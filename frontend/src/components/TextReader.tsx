"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useAudioPlayer from "./useAudioPlayer";
import useDocumentTTS from "@/hooks/useDocumentTTS";
import TextBox from "./TextBox";
import FileUpload from "./FileUpload";
import TextViewer from "./TextViewer";
import Controls from "./Controls";
import Waveform from "./Waveform";
import Quiz from "./Quiz";
import FoldList from "./FoldList";
import FoldCreaseArt from "./FoldCreaseArt";
import BrainrotStage from "./BrainrotStage";
import type { Section } from "./ChapterSelector";
import {
  CraneMark,
  PauseIcon,
  StopIcon,
  AlertIcon,
} from "./Icons";
import { apiUrl } from "@/lib/api";

interface Voice {
  id: string;
  name: string;
  locale: string;
  display_name: string;
}

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

function estimateDuration(chars: number): string {
  const seconds = Math.round(chars / 15);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${mins}:00`;
}

export default function TextReader() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("en-US-EmmaMultilingualNeural");
  const [speed, setSpeed] = useState(1.0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [hasCompletedRead, setHasCompletedRead] = useState(false);
  const [jumpToSentenceIndex, setJumpToSentenceIndex] = useState<number | null>(
    null,
  );
  /** Fold whose audio is currently loaded / playing */
  const [playingFoldIndex, setPlayingFoldIndex] = useState<number | null>(null);
  /** Fold waiting on Celery TTS — auto-plays when ready */
  const [waitingFold, setWaitingFold] = useState<number | null>(null);
  const [autoPlayFold, setAutoPlayFold] = useState<number | null>(null);

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [docType, setDocType] = useState("flat");

  const audioPlayer = useAudioPlayer();
  const docTTS = useDocumentTTS();

  const sentencesRef = useRef<Sentence[]>([]);
  const playingFoldRef = useRef<number | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  const analyzeTimerRef = useRef<number | null>(null);
  const updateSentences = useCallback((next: Sentence[]) => {
    sentencesRef.current = next;
    setSentences(next);
    if (next.length === 0) setHasCompletedRead(false);
  }, []);

  useEffect(() => {
    playingFoldRef.current = playingFoldIndex;
  }, [playingFoldIndex]);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current);
    };
  }, []);

  const FALLBACK_VOICES: Voice[] = [
    {
      id: "en-US-EmmaMultilingualNeural",
      name: "en-US-EmmaMultilingualNeural",
      locale: "en-US",
      display_name: "Emma",
    },
  ];

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/voices"))
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) && data.length > 0 ? data : FALLBACK_VOICES;
        setVoices(list);
        setVoice((prev) => (list.some((v) => v.id === prev) ? prev : list[0].id));
      })
      .catch((err) => {
        console.error("Failed to fetch voices:", err);
        if (!cancelled) setVoices(FALLBACK_VOICES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analyzeText = useCallback(
    async (textToAnalyze: string, opts?: { autoplayFold?: number }) => {
      if (!textToAnalyze.trim() || textToAnalyze.trim().length < 50) {
        setSections([]);
        setSelectedSection(null);
        setHasStructure(false);
        return;
      }

      try {
        const res = await fetch(apiUrl("/api/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToAnalyze }),
        });
        const data = await res.json();
        if (res.ok) {
          const nextSections: Section[] = data.sections || [];
          setSections(nextSections);
          sectionsRef.current = nextSections;
          // Paragraph-packed and structured docs both count as folds
          setHasStructure(
            Boolean(data.has_structure) || nextSections.length > 0,
          );
          setDocType(data.doc_type || "flat");
          setSelectedSection(null);

          // Queue one Celery task per fold immediately
          if (nextSections.length > 0) {
            // Begin reading as soon as fold 0 audio is ready
            setAutoPlayFold(opts?.autoplayFold ?? 0);
            try {
              await docTTS.start({
                text: textToAnalyze,
                voice,
                speed,
                sections: nextSections,
              });
            } catch (err) {
              console.error("Fold TTS queue failed:", err);
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not reach the TTS service. Is the backend running?",
              );
            }
          }
        }
      } catch (err) {
        console.error("Analysis failed:", err);
        setError(
          "Could not reach the TTS service. Start the backend (docker compose up).",
        );
      }
    },
    [docTTS, voice, speed],
  );

  /** Auto-detect folds shortly after the learner stops typing/pasting. */
  const scheduleAnalyze = useCallback(
    (value: string) => {
      if (analyzeTimerRef.current) {
        window.clearTimeout(analyzeTimerRef.current);
      }
      analyzeTimerRef.current = window.setTimeout(() => {
        if (value.trim().length >= 50) void analyzeText(value);
      }, 900);
    },
    [analyzeText],
  );

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      const current = sentencesRef.current;
      if (current.length === 0) return;

      for (let i = current.length - 1; i >= 0; i--) {
        if (currentTime >= current[i].start_ms / 1000) {
          setActiveSentenceIndex(i);
          if (i >= current.length - 1) {
            setHasCompletedRead(true);
            // Advance to the next fold when its audio is already queued
            const next = (playingFoldRef.current ?? -1) + 1;
            const total = sectionsRef.current.length;
            if (total > next) {
              setWaitingFold(next);
            }
          }
          return;
        }
      }
      setActiveSentenceIndex(0);
    },
    [],
  );

  const resetReadingState = useCallback(() => {
    docTTS.cancel();
    audioPlayer.stop();
    updateSentences([]);
    setActiveSentenceIndex(null);
    setAudioBase64(null);
    setIsLoading(false);
    setHasCompletedRead(false);
    setJumpToSentenceIndex(null);
    setPlayingFoldIndex(null);
    setWaitingFold(null);
    setAutoPlayFold(null);
  }, [audioPlayer, docTTS, updateSentences]);

  const handleClear = useCallback(() => {
    resetReadingState();
    setText("");
    setSections([]);
    setSelectedSection(null);
    setHasStructure(false);
    setError(null);
  }, [resetReadingState]);

  const handleFileExtracted = useCallback(
    (extractedText: string) => {
      resetReadingState();
      setText(extractedText);
      setError(null);
      analyzeText(extractedText);
    },
    [resetReadingState, analyzeText],
  );

  /** Load a fold's Celery-generated audio and start playback. */
  const startPlayingFold = useCallback(
    (index: number) => {
      const fold = docTTS.getFold(index);
      if (!fold) {
        setWaitingFold(index);
        return false;
      }
      audioPlayer.stop();
      const foldSentences: Sentence[] = (fold.sentences || []).map((s, i) => ({
        index: i,
        text: s.text,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
      }));
      updateSentences(foldSentences);
      setActiveSentenceIndex(null);
      setHasCompletedRead(false);
      setAudioBase64(fold.audio_base64);
      setPlayingFoldIndex(index);
      playingFoldRef.current = index;
      setWaitingFold(null);
      setAutoPlayFold(null);
      setIsLoading(false);
      audioPlayer.setOffset(0);
      audioPlayer.play(fold.audio_base64, handleTimeUpdate);
      return true;
    },
    [audioPlayer, docTTS, handleTimeUpdate, updateSentences],
  );

  /** When a fold finishes generating, play it if the user is waiting on it. */
  useEffect(() => {
    const target = waitingFold ?? autoPlayFold;
    if (target === null) return;
    if (docTTS.hasFold(target)) {
      startPlayingFold(target);
    }
  }, [docTTS.readyTick, waitingFold, autoPlayFold, docTTS, startPlayingFold]);

  const ensureDocumentTTS = useCallback(async () => {
    if (docTTS.documentId) return;
    const secs = sectionsRef.current;
    if (!secs.length || !text.trim()) return;
    setIsLoading(true);
    try {
      await docTTS.start({ text, voice, speed, sections: secs });
    } catch (err) {
      console.error("TTS queue failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the TTS service. Start the backend (docker compose up).",
      );
    } finally {
      setIsLoading(false);
    }
  }, [docTTS, text, voice, speed]);

  const handlePlay = useCallback(async () => {
    if (audioPlayer.isPaused && audioBase64) {
      audioPlayer.play(audioBase64, handleTimeUpdate);
      return;
    }

    const idx = playingFoldIndex ?? 0;
    if (docTTS.hasFold(idx)) {
      startPlayingFold(idx);
      return;
    }

    // Fold audio not ready — queue generation and auto-play when it lands
    setWaitingFold(idx);
    setAutoPlayFold(idx);
    await ensureDocumentTTS();
  }, [
    audioPlayer.isPaused,
    audioBase64,
    handleTimeUpdate,
    docTTS,
    playingFoldIndex,
    startPlayingFold,
    ensureDocumentTTS,
  ]);

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      if (audioPlayer.isPlaying || audioPlayer.isPaused) {
        audioPlayer.setPlaybackRate(newSpeed);
      }
    },
    [audioPlayer],
  );

  const handleSentenceClick = useCallback(
    (index: number) => {
      if (sentences.length === 0 || !audioBase64) return;

      const sentence = sentences[index];
      if (!sentence) return;

      audioPlayer.stop();
      audioPlayer.setOffset(sentence.start_ms / 1000);
      setActiveSentenceIndex(index);
      audioPlayer.play(audioBase64, handleTimeUpdate);
    },
    [sentences, audioBase64, audioPlayer, handleTimeUpdate],
  );

  const handleSeek = useCallback(
    (time: number) => {
      if (!audioBase64) return;

      const clamped = Math.max(0, time);
      audioPlayer.stop();
      audioPlayer.setOffset(clamped);
      const current = sentencesRef.current;
      for (let i = current.length - 1; i >= 0; i--) {
        if (clamped >= current[i].start_ms / 1000) {
          setActiveSentenceIndex(i);
          break;
        }
      }
      audioPlayer.play(audioBase64, handleTimeUpdate);
    },
    [audioBase64, audioPlayer, handleTimeUpdate],
  );

  const handlePause = useCallback(() => {
    audioPlayer.pause();
  }, [audioPlayer]);

  const handleStop = useCallback(() => {
    resetReadingState();
  }, [resetReadingState]);

  const duration =
    sentences.length > 0 ? sentences[sentences.length - 1].end_ms / 1000 : 0;

  const foldTotal =
    hasStructure && sections.length > 0
      ? sections.length
      : text.trim()
        ? 1
        : 0;

  let foldIndex = 0;
  if (foldTotal > 0) {
    if (playingFoldIndex !== null && sections[playingFoldIndex]) {
      foldIndex = playingFoldIndex;
    } else if (selectedSection) {
      const idx = sections.findIndex(
        (s) =>
          s.char_start === selectedSection.char_start &&
          s.title === selectedSection.title,
      );
      foldIndex = idx >= 0 ? idx : 0;
    } else if (
      activeSentenceIndex !== null &&
      sentences.length > 0 &&
      sections.length > 0
    ) {
      const active = sentences[activeSentenceIndex];
      const totalChars = sections[sections.length - 1].char_end || 1;
      const timeFraction = duration > 0 ? active.start_ms / 1000 / duration : 0;
      const approxChar = timeFraction * totalChars;
      foldIndex = sections.findIndex((s) => approxChar < s.char_end);
      if (foldIndex < 0) foldIndex = sections.length - 1;
    }
  }

  const activeSection = sections[foldIndex] ?? null;
  const completedFolds = Math.max(0, foldIndex);
  const currentSectionTitle = selectedSection
    ? selectedSection.title
    : activeSection && hasStructure
      ? activeSection.title
      : null;

  const foldCardChars = activeSection
    ? activeSection.char_end - activeSection.char_start
    : text.trim().length;
  const foldCardDuration = estimateDuration(foldCardChars);

  const prevFold =
    hasStructure && foldIndex > 0
      ? { index: foldIndex - 1, section: sections[foldIndex - 1] }
      : null;
  const nextFold =
    hasStructure && foldIndex < sections.length - 1
      ? { index: foldIndex + 1, section: sections[foldIndex + 1] }
      : null;

  /**
   * Jump to a fold and start playback from its opening line.
   * Plays immediately if that fold's Celery audio is ready; otherwise
   * waits and auto-plays when generation completes.
   */
  const jumpToFold = useCallback(
    async (index: number) => {
      if (index < 0) return;
      const section = sections[index] ?? null;
      if (section) setSelectedSection(section);

      if (docTTS.hasFold(index)) {
        startPlayingFold(index);
        return;
      }

      setAutoPlayFold(null);
      setWaitingFold(index);
      await ensureDocumentTTS();
    },
    [sections, docTTS, startPlayingFold, ensureDocumentTTS],
  );

  const handleSelectFold = useCallback(
    (index: number, section: Section | null) => {
      if (section) setSelectedSection(section);
      jumpToFold(index);
    },
    [jumpToFold],
  );

  // Open source panel automatically when empty
  useEffect(() => {
    if (!text.trim()) setSourceOpen(true);
  }, [text]);

  // Play → pause when running; resume when audio exists; else queue folds
  const foldStatusList = Object.values(docTTS.foldStatus);
  const foldsComplete = foldStatusList.filter((s) => s === "complete").length;
  const foldsQueued = foldStatusList.length;
  const isPreparingFolds =
    waitingFold !== null ||
    (foldsQueued > 0 && foldsComplete < foldsQueued && !audioBase64);

  const playLabel = audioPlayer.isPlaying
    ? "Pause"
    : isPreparingFolds
      ? "Preparing…"
      : audioBase64 && !isLoading
        ? "Resume"
        : "Play";
  const playIcon = audioPlayer.isPlaying ? (
    <PauseIcon className="h-4 w-4" />
  ) : (
    <span
      className="h-2.5 w-2.5 rounded-full"
      style={{
        background:
          "radial-gradient(circle at 35% 30%, #E8C55A, #C9A227 60%, #A8841C)",
      }}
      aria-hidden="true"
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ——— Top bar: logo only ——— */}
      <header className="z-30 flex shrink-0 items-center border-b border-hairline bg-fold px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          <CraneMark className="h-7 w-7 text-vermilion-ink" />
          <span className="font-display text-xl leading-none text-sumi sm:text-2xl">
            Text Reader
          </span>
        </div>
      </header>

      {/* ——— Three-zone desk (viewport-locked; only the sheet scrolls long content) ——— */}
      <main className="mx-auto grid w-full max-w-[1600px] min-h-0 flex-1 grid-cols-1 gap-[var(--zone-gap)] overflow-y-auto px-4 py-4 sm:px-6 lg:grid-cols-[var(--rail-w)_minmax(0,1fr)_minmax(16rem,22rem)] lg:overflow-hidden lg:px-8 lg:py-5">
        {/* Left rail — panel itself does not scroll; fold cards scroll inside FoldList */}
        <aside className="flex min-h-0 flex-col gap-0 overflow-hidden border border-hairline bg-washi/40 px-4 py-4">
          <div className="label-ui shrink-0 text-[11px] text-ink-fade">
            Fold {foldTotal > 0 ? String(foldIndex + 1).padStart(2, "0") : "—"}
            {" of "}
            {foldTotal > 0 ? String(foldTotal).padStart(2, "0") : "—"}
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-start gap-2" aria-hidden="true">
            {foldTotal === 0 ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-ink-mute/70" />
            ) : (
              Array.from({ length: Math.min(foldTotal, 16) }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full border-2 ${
                    i < foldIndex
                      ? "border-vermilion-soft bg-vermilion-soft"
                      : i === foldIndex
                        ? "border-gold bg-gold"
                        : "border-ink-mute/70"
                  }`}
                />
              ))
            )}
            {foldTotal > 16 && (
              <span className="font-data text-[10px] text-ink-fade">
                +{foldTotal - 16}
              </span>
            )}
          </div>

          {/* current fold card — unique crease art for this fold */}
          <div className="mt-5 flex shrink-0 gap-3 border border-hairline bg-fold">
            <FoldCreaseArt
              index={Math.max(0, foldIndex)}
              active={audioPlayer.isPlaying}
              className="w-[4.5rem] shrink-0 border-r border-hairline"
            />
            <div className="flex min-w-0 flex-col justify-center gap-0.5 py-3 pr-3">
              <span className="font-display text-2xl leading-none text-vermilion-soft">
                {foldTotal > 0 ? String(foldIndex + 1).padStart(2, "0") : "00"}
              </span>
              <span className="truncate font-display text-base leading-tight text-sumi">
                {currentSectionTitle ?? (text.trim() ? "Document" : "No fold yet")}
              </span>
              <span className="font-data text-xs tabular-nums text-ink-fade">
                {foldCardDuration}
              </span>
            </div>
          </div>

          {/* Scrollable fold cards when structure exists (this box scrolls, not the rail) */}
          {hasStructure && sections.length > 0 && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <FoldList
                sections={sections}
                activeFoldIndex={foldIndex}
                onSelectFold={handleSelectFold}
                disabled={isLoading}
              />
            </div>
          )}

          {/* Source + transport pinned to the bottom of the rail */}
          <div className="mt-auto flex shrink-0 flex-col pt-5">
          {/* source: upload + paste (auto-detects folds) */}
          <div id="source">
            <div className="flex items-center justify-between gap-2">
              <h2 className="label-ui text-[11px] text-sumi-soft">Source</h2>
              <button
                type="button"
                onClick={() => setSourceOpen((v) => !v)}
                className="label-ui text-[10px] text-ink-fade hover:text-vermilion"
                aria-expanded={sourceOpen}
              >
                {sourceOpen ? "Hide" : "Show"}
              </button>
            </div>
            {sourceOpen && (
              <div className="mt-3 flex flex-col gap-3">
                <FileUpload onTextExtracted={handleFileExtracted} />
                <TextBox
                  text={text}
                  onChange={(t) => {
                    setText(t);
                    setHasCompletedRead(false);
                    if (!t.trim()) {
                      resetReadingState();
                      setSections([]);
                      setSelectedSection(null);
                      setHasStructure(false);
                      setError(null);
                      return;
                    }
                    scheduleAnalyze(t);
                  }}
                  onClear={handleClear}
                />
                {/* Play lives under the paste box */}
                <button
                  type="button"
                  onClick={audioPlayer.isPlaying ? handlePause : handlePlay}
                  disabled={isLoading || docTTS.isSubmitting}
                  className="gold-dot-btn h-12 w-full text-xs"
                  aria-label={playLabel}
                >
                  {playIcon}
                  <span>{playLabel}</span>
                  {(isLoading || docTTS.isSubmitting || isPreparingFolds) && (
                    <span
                      className="ml-1 h-3 w-3 animate-spin rounded-full border border-fold border-t-transparent"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            )}
          </div>

          {foldsQueued > 0 && foldsComplete < foldsQueued && (
            <div className="mt-4 border border-hairline bg-fold p-3">
              <div className="flex items-center justify-between font-ui text-[11px] text-sumi-soft">
                <span>Folding speech…</span>
                <span className="font-data tabular-nums">
                  {foldsComplete} / {foldsQueued} folds
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-hairline">
                <div
                  className="h-full bg-vermilion transition-all duration-300"
                  style={{
                    width: `${foldsQueued ? (foldsComplete / foldsQueued) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {(audioPlayer.isPlaying || audioPlayer.isPaused || isLoading || isPreparingFolds) && (
            <div className="mt-4 flex gap-2">
              {(audioPlayer.isPlaying || audioPlayer.isPaused) && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="outline-btn h-9 flex-1 text-[10px]"
                >
                  <StopIcon className="h-3.5 w-3.5" />
                  Stop
                </button>
              )}
              {(isLoading || docTTS.isSubmitting) && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="outline-btn h-9 flex-1 text-[10px]"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 border border-vermilion-soft/60 bg-fold p-3"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" />
              <p className="font-ui text-xs leading-relaxed text-vermilion-ink">
                {error}
              </p>
            </div>
          )}
          </div>
        </aside>

        {/* Center sheet — the only long scroller on desktop */}
        <section className="flex min-h-[24rem] min-h-0 flex-col lg:min-h-0">
          <div className="min-h-0 flex-1">
            <TextViewer
              sentences={sentences}
              activeSentenceIndex={activeSentenceIndex}
              text={text}
              onSentenceClick={handleSentenceClick}
              currentSectionTitle={currentSectionTitle}
              completedFolds={completedFolds}
              totalFolds={foldTotal}
              jumpToSentenceIndex={jumpToSentenceIndex}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between px-2 pt-2 font-ui text-xs text-vermilion-soft">
            <span aria-hidden="true">▶</span>
            <span className="label-ui text-[9px] text-ink-mute">
              Sentence-sync read-along
            </span>
            <span aria-hidden="true">◀</span>
          </div>
        </section>

        {/* Right: companion videos + current/prev/next fold + quiz */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <BrainrotStage
            className="aspect-square w-full shrink-0"
          />

          <div className="shrink-0 border border-hairline bg-fold px-4 py-4">
            <div className="label-ui text-[11px] text-ink-mute">Current fold</div>
            <div className="mt-2 flex items-stretch gap-3">
              <FoldCreaseArt
                index={Math.max(0, foldIndex)}
                active={audioPlayer.isPlaying}
                className="h-20 w-20 shrink-0 border border-hairline-deep"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-4xl leading-none text-vermilion-soft">
                    {foldTotal > 0 ? String(foldIndex + 1).padStart(2, "0") : "00"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-lg text-sumi">
                    {currentSectionTitle ?? (text.trim() ? "Reading" : "Empty")}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 font-body text-sm leading-relaxed text-ink-fade">
              {activeSection?.text_preview?.slice(0, 140) ??
                (text.trim()
                  ? "Press play to fold this document into speech. The sheet advances as sentences finish."
                  : "Load a document to begin. Each section is a fold; the crane stands when the last one closes.")}
              {activeSection?.text_preview &&
                activeSection.text_preview.length > 140 &&
                "…"}
            </p>

            {/* Previous / next fold */}
            {hasStructure && sections.length > 1 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => prevFold && jumpToFold(prevFold.index)}
                  disabled={!prevFold}
                  className="outline-btn h-auto min-h-[3.25rem] flex-col items-start gap-0.5 px-3 py-2 text-left disabled:opacity-35"
                >
                  <span className="label-ui text-[9px] text-ink-fade">Previous</span>
                  <span className="w-full truncate font-ui text-[11px] font-semibold tracking-normal normal-case text-sumi">
                    {prevFold
                      ? `${String(prevFold.index + 1).padStart(2, "0")} · ${prevFold.section.title}`
                      : "—"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => nextFold && jumpToFold(nextFold.index)}
                  disabled={!nextFold}
                  className="outline-btn h-auto min-h-[3.25rem] flex-col items-start gap-0.5 px-3 py-2 text-left disabled:opacity-35"
                >
                  <span className="label-ui text-[9px] text-ink-fade">Next</span>
                  <span className="w-full truncate font-ui text-[11px] font-semibold tracking-normal normal-case text-sumi">
                    {nextFold
                      ? `${String(nextFold.index + 1).padStart(2, "0")} · ${nextFold.section.title}`
                      : "—"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Voice / speed / waveform — under current fold, above quiz */}
          <div className="shrink-0 border border-hairline bg-fold px-4 py-3">
            <div className="label-ui mb-1 text-[11px] text-ink-mute">Playback</div>
            <Controls
              voice={voice}
              onVoiceChange={setVoice}
              speed={speed}
              onSpeedChange={handleSpeedChange}
              voices={voices}
              voiceDisabled={audioPlayer.isPlaying}
            />
            <div className="mt-2 border-t border-hairline pt-3">
              <Waveform
                audioBase64={audioBase64}
                sentences={sentences}
                activeSentenceIndex={activeSentenceIndex}
                onSeek={handleSeek}
                isPlaying={audioPlayer.isPlaying}
                currentTime={audioPlayer.currentTime}
                duration={duration}
              />
            </div>
          </div>

          <Quiz text={text} fullyRead={hasCompletedRead} />
        </aside>
      </main>
    </div>
  );
}
