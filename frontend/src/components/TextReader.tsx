"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useAudioPlayer from "./useAudioPlayer";
import useTTSJob from "@/hooks/useTTSJob";
import TextBox from "./TextBox";
import FileUpload from "./FileUpload";
import TextViewer from "./TextViewer";
import Controls from "./Controls";
import Waveform from "./Waveform";
import Quiz from "./Quiz";
import ChapterSelector from "./ChapterSelector";
import type { Section } from "./ChapterSelector";
import CraneProgress from "./CraneProgress";
import {
  CraneMark,
  PlayIcon,
  PauseIcon,
  StopIcon,
  VoiceIcon,
  TempoIcon,
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

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
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

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [docType, setDocType] = useState("flat");

  const audioPlayer = useAudioPlayer();
  const ttsJob = useTTSJob();

  const sentencesRef = useRef<Sentence[]>([]);
  const analyzeTimerRef = useRef<number | null>(null);
  const updateSentences = useCallback((next: Sentence[]) => {
    sentencesRef.current = next;
    setSentences(next);
  }, []);

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current);
    };
  }, []);

  const analyzeText = useCallback(async (textToAnalyze: string) => {
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
        setSections(data.sections || []);
        setHasStructure(data.has_structure || false);
        setDocType(data.doc_type || "flat");
        setSelectedSection(null);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    }
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
        setVoice((prev) =>
          list.some((v) => v.id === prev) ? prev : list[0].id,
        );
      })
      .catch((err) => {
        console.error("Failed to fetch voices:", err);
        if (!cancelled) setVoices(FALLBACK_VOICES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTimeUpdate = useCallback((currentTime: number) => {
    const current = sentencesRef.current;
    if (current.length === 0) return;

    for (let i = current.length - 1; i >= 0; i--) {
      if (currentTime >= current[i].start_ms / 1000) {
        setActiveSentenceIndex(i);
        return;
      }
    }
    setActiveSentenceIndex(0);
  }, []);

  const handleClear = useCallback(() => {
    ttsJob.cancelJob();
    audioPlayer.stop();
    setText("");
    updateSentences([]);
    setActiveSentenceIndex(null);
    setAudioBase64(null);
    setIsLoading(false);
    setSections([]);
    setSelectedSection(null);
    setHasStructure(false);
  }, [audioPlayer, updateSentences, ttsJob]);

  const handleFileExtracted = useCallback(
    (extractedText: string) => {
      audioPlayer.stop();
      setText(extractedText);
      updateSentences([]);
      setActiveSentenceIndex(null);
      setAudioBase64(null);
      setError(null);
      analyzeText(extractedText);
    },
    [audioPlayer, updateSentences, analyzeText],
  );

  const regenerateTTS = useCallback(
    async (newSpeed: number, resumeFrom?: number) => {
      const textToGenerate = selectedSection ? selectedSection.text : text;
      if (!textToGenerate.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        const normalizedText = textToGenerate
          .replace(/[\t\n\r]+/g, " ")
          .replace(/ {2,}/g, " ")
          .trim();

        const result = await ttsJob.submitJob(normalizedText, voice, newSpeed);
        if (!result) return;

        const newSentences: Sentence[] = result.sentences || [];
        const oldSentences = sentencesRef.current;
        const oldDuration =
          oldSentences.length > 0
            ? oldSentences[oldSentences.length - 1].end_ms / 1000
            : 0;
        const newDuration =
          newSentences.length > 0
            ? newSentences[newSentences.length - 1].end_ms / 1000
            : 0;

        let startOffset = 0;
        if (resumeFrom !== undefined && resumeFrom > 0 && newDuration > 0) {
          const fraction = oldDuration > 0 ? Math.min(resumeFrom / oldDuration, 1) : 0;
          startOffset = fraction * newDuration;
        }

        updateSentences(newSentences);
        setActiveSentenceIndex(null);
        setAudioBase64(result.audio_base64);

        audioPlayer.setOffset(startOffset);
        audioPlayer.play(result.audio_base64, handleTimeUpdate);
      } catch (err) {
        console.error("TTS request failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate speech. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [text, selectedSection, voice, audioPlayer, handleTimeUpdate, updateSentences, ttsJob],
  );

  const handlePlay = useCallback(async () => {
    if (audioPlayer.isPaused && audioBase64) {
      audioPlayer.play(audioBase64, handleTimeUpdate);
      return;
    }
    await regenerateTTS(speed);
  }, [audioPlayer.isPaused, audioBase64, handleTimeUpdate, regenerateTTS, speed]);

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
    ttsJob.cancelJob();
    audioPlayer.stop();
    setActiveSentenceIndex(null);
    setIsLoading(false);
  }, [audioPlayer, ttsJob]);

  const duration =
    sentences.length > 0 ? sentences[sentences.length - 1].end_ms / 1000 : 0;
  const progress = duration > 0 ? Math.min(1, audioPlayer.currentTime / duration) : 0;

  // Which section (fold) is active, for the rail + crane sheet
  const foldTotal = hasStructure && sections.length > 0 ? sections.length : text.trim() ? 1 : 0;
  let foldIndex = 0;
  if (foldTotal > 0) {
    if (selectedSection) {
      const idx = sections.findIndex(
        (s) =>
          s.char_start === selectedSection.char_start &&
          s.title === selectedSection.title,
      );
      foldIndex = idx >= 0 ? idx : 0;
    } else if (activeSentenceIndex !== null && sentences.length > 0 && sections.length > 0) {
      // Approximate: map active sentence progress onto section char offsets
      const active = sentences[activeSentenceIndex];
      const totalChars = sections[sections.length - 1].char_end || 1;
      // sentences are normalized for TTS; fall back to time fraction
      const timeFraction = duration > 0 ? active.start_ms / 1000 / duration : 0;
      const approxChar = timeFraction * totalChars;
      foldIndex = sections.findIndex((s) => approxChar < s.char_end);
      if (foldIndex < 0) foldIndex = sections.length - 1;
    }
  }
  const foldProgress = foldTotal > 0 ? (foldIndex + (activeSentenceIndex !== null ? progress : 0)) / foldTotal : progress;

  const activeSection = sections[foldIndex] ?? null;
  const completedFolds = Math.max(0, foldIndex);
  const currentSectionTitle = selectedSection
    ? selectedSection.title
    : activeSection && hasStructure
      ? activeSection.title
      : null;

  const currentVoiceName =
    voices.find((v) => v.id === voice)?.display_name ?? "Emma";
  const foldCardChars = activeSection
    ? activeSection.char_end - activeSection.char_start
    : text.trim().length;
  const foldCardDuration = estimateDuration(foldCardChars);

  // Open source panel automatically when empty
  useEffect(() => {
    if (!text.trim()) setSourceOpen(true);
  }, [text]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* ——— Top bar ——— */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-fold">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#reader" className="flex shrink-0 items-center gap-2.5">
            <CraneMark className="h-7 w-7 text-vermilion-ink" />
            <span className="font-display text-xl leading-none text-sumi sm:text-2xl">
              Text Reader
            </span>
          </a>

          <nav className="ml-auto hidden items-center gap-6 md:flex lg:gap-8">
            {(
              [
                ["Read", "reader"],
                ["Folds", "folds"],
                ["Guide", "source"],
                ["Quiz", "quiz"],
              ] as const
            ).map(([label, id]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === "source") setSourceOpen(true);
                  if (id === "folds") setSourceOpen((v) => v || !text.trim());
                  scrollTo(id);
                }}
                className="label-ui text-[11px] text-sumi transition-colors hover:text-vermilion"
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={audioPlayer.isPlaying ? handlePause : handlePlay}
            disabled={isLoading}
            className="gold-dot-btn ml-auto h-11 shrink-0 px-5 text-xs md:ml-0 md:h-12 md:px-6"
            aria-label={audioPlayer.isPlaying ? "Pause" : "Play"}
          >
            {audioPlayer.isPlaying ? (
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
            )}
            <span>{audioPlayer.isPlaying ? "Pause" : "Play"}</span>
            {isLoading && (
              <span
                className="ml-1 h-3 w-3 animate-spin rounded-full border border-fold border-t-transparent"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </header>

      {/* ——— Three-zone desk ——— */}
      <main
        id="reader"
        className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-[var(--zone-gap)] px-4 py-5 sm:px-6 lg:grid-cols-[var(--rail-w)_minmax(0,1fr)_minmax(16rem,22rem)] lg:px-8 lg:py-7"
      >
        {/* Left rail */}
        <aside className="flex flex-col gap-0 border border-hairline bg-washi/40 px-4 py-4">
          <div className="label-ui text-[11px] text-ink-fade">
            Fold {foldTotal > 0 ? String(foldIndex + 1).padStart(2, "0") : "—"}
            {" of "}
            {foldTotal > 0 ? String(foldTotal).padStart(2, "0") : "—"}
          </div>

          {/* progress dots */}
          <div className="mt-4 flex flex-wrap items-start gap-2" aria-hidden="true">
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

          {/* current fold card */}
          <div className="mt-5 flex gap-3 border border-hairline bg-fold">
            <div className="crease-lines relative w-[4.5rem] shrink-0" aria-hidden="true" />
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

          {/* VOICE / TEMPO */}
          <div className="mt-5">
            <div className="flex items-center gap-2 pb-1 text-ink-fade">
              <VoiceIcon className="h-3.5 w-3.5" />
              <TempoIcon className="ml-2 h-3.5 w-3.5" />
            </div>
            <Controls
              voice={voice}
              onVoiceChange={setVoice}
              speed={speed}
              onSpeedChange={handleSpeedChange}
              voices={voices}
              disabled={audioPlayer.isPlaying}
            />
            <p className="mt-1 font-data text-[11px] text-ink-fade">
              {currentVoiceName}
            </p>
          </div>

          {/* timestamp strip */}
          <div className="mt-4 flex items-center justify-between border-y border-hairline-deep py-3 font-data text-sm tabular-nums text-ink-fade">
            <span>{formatClock(audioPlayer.currentTime)}</span>
            <span>{formatClock(duration)}</span>
          </div>

          <Waveform
            audioBase64={audioBase64}
            sentences={sentences}
            activeSentenceIndex={activeSentenceIndex}
            onSeek={handleSeek}
            isPlaying={audioPlayer.isPlaying}
            currentTime={audioPlayer.currentTime}
            duration={duration}
          />

          {/* folds / structure */}
          <div id="folds" className="mt-5 scroll-mt-24">
            <ChapterSelector
              sections={sections}
              selectedSection={selectedSection}
              onSelect={setSelectedSection}
              disabled={isLoading}
              docType={docType}
            />
          </div>

          {/* source: upload + paste */}
          <div id="source" className="mt-5 scroll-mt-24">
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
                    if (!t.trim()) {
                      ttsJob.cancelJob();
                      audioPlayer.stop();
                      updateSentences([]);
                      setActiveSentenceIndex(null);
                      setAudioBase64(null);
                      setSections([]);
                      setSelectedSection(null);
                      setHasStructure(false);
                      setError(null);
                      return;
                    }
                    // Auto-detect structure shortly after the learner stops typing
                    if (analyzeTimerRef.current) {
                      window.clearTimeout(analyzeTimerRef.current);
                    }
                    analyzeTimerRef.current = window.setTimeout(() => {
                      if (t.trim().length >= 50) void analyzeText(t);
                    }, 900);
                  }}
                  onClear={handleClear}
                />
                <button
                  type="button"
                  onClick={() => analyzeText(text)}
                  disabled={!text.trim() || isLoading}
                  className="outline-btn h-9 px-3 text-[10px]"
                >
                  Detect folds
                </button>
              </div>
            )}
          </div>

          {/* TTS progress */}
          {isLoading && ttsJob.progress && (
            <div className="mt-4 border border-hairline bg-fold p-3">
              <div className="flex items-center justify-between font-ui text-[11px] text-sumi-soft">
                <span>Folding speech…</span>
                <span className="font-data tabular-nums">
                  {ttsJob.progress.chunk} / {ttsJob.progress.total}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-hairline">
                <div
                  className="h-full bg-vermilion transition-all duration-300"
                  style={{
                    width: `${(ttsJob.progress.chunk / ttsJob.progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* transport when playing/paused/loading */}
          {(audioPlayer.isPlaying || audioPlayer.isPaused || isLoading) && (
            <div className="mt-4 flex gap-2">
              {!audioPlayer.isPlaying && !isLoading && (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="gold-dot-btn h-9 flex-1 text-[11px]"
                >
                  <PlayIcon className="h-3.5 w-3.5" />
                  Resume
                </button>
              )}
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
              {isLoading && (
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
        </aside>

        {/* Center sheet */}
        <section className="flex min-h-[28rem] flex-col lg:min-h-[36rem]">
          <div className="min-h-0 flex-1">
            <TextViewer
              sentences={sentences}
              activeSentenceIndex={activeSentenceIndex}
              text={text}
              onSentenceClick={handleSentenceClick}
              currentSectionTitle={currentSectionTitle}
              completedFolds={completedFolds}
              totalFolds={foldTotal}
            />
          </div>
          {/* corner margin ticks */}
          <div className="flex items-center justify-between px-2 pt-2 font-ui text-xs text-vermilion-soft">
            <span aria-hidden="true">▶</span>
            <span className="label-ui text-[9px] text-ink-mute">
              Sentence-sync read-along
            </span>
            <span aria-hidden="true">◀</span>
          </div>
        </section>

        {/* Right: crane sheet + current fold */}
        <aside className="flex flex-col gap-4">
          <CraneProgress
            progress={progress}
            foldProgress={foldProgress}
            className="w-full"
          />
          <div className="border border-hairline bg-fold px-4 py-4">
            <div className="label-ui text-[11px] text-ink-mute">Current fold</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-5xl leading-none text-vermilion-soft">
                {foldTotal > 0 ? String(foldIndex + 1).padStart(2, "0") : "00"}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-xl text-sumi">
                {currentSectionTitle ?? (text.trim() ? "Reading" : "Empty")}
              </span>
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
          </div>
        </aside>
      </main>

      {/* Quiz */}
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 sm:px-6 lg:px-8">
        <Quiz text={text} disabled={!text.trim()} />
      </div>
    </div>
  );
}
