"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useAudioPlayer from "./useAudioPlayer";
import useDocumentTTS from "@/hooks/useDocumentTTS";
import TextBox from "./TextBox";
import FileUpload from "./FileUpload";
import TextViewer from "./TextViewer";
import type { ViewerFold } from "./TextViewer";
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
  PlayIcon,
  StopIcon,
  AlertIcon,
  ChevronIcon,
} from "./Icons";
import { apiUrl } from "@/lib/api";
import { expandSectionsForTTS } from "@/lib/foldSplit";
import SaveOrigamiButton from "./SaveOrigamiButton";
import { useAuth, useAuthActions } from "@/hooks/useAuth";
import LoginModal from "./LoginModal";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Origami } from "@/types/origami";

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
  /** Canvas data — the document the viewer renders. Set when a session is
   *  committed (analysis done or origami loaded); never bound to the textarea. */
  const [text, setText] = useState("");
  /** Ephemeral textbox content. Cleared once audio processing starts so a
   *  committed session can't be edited — paste again to start a new one. */
  const [draft, setDraft] = useState("");
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
  /** Companion stage: open when empty; collapses once text is pasted (quiz-style). */
  const [companionOpen, setCompanionOpen] = useState(true);
  const hadCompanionTextRef = useRef(false);
  const [hasCompletedRead, setHasCompletedRead] = useState(false);
  const [jumpToSentenceIndex, setJumpToSentenceIndex] = useState<number | null>(
    null,
  );
  /** Fold whose audio is currently loaded / playing */
  const [playingFoldIndex, setPlayingFoldIndex] = useState<number | null>(null);
  /** Fold waiting on parallel TTS — auto-plays when ready */
  const [waitingFold, setWaitingFold] = useState<number | null>(null);
  const [autoPlayFold, setAutoPlayFold] = useState<number | null>(null);

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [docType, setDocType] = useState("flat");
  const [wordsFolded, setWordsFolded] = useState(0);

  const audioPlayer = useAudioPlayer();
  const docTTS = useDocumentTTS();
  const { user, loading: authLoading } = useAuth();
  const { signOut } = useAuthActions();
  const [loginOpen, setLoginOpen] = useState(false);
  const searchParams = useSearchParams();
  const origamiParam = searchParams.get("origami");
  /** Guard so the origami effect runs once per param value. */
  const loadedOrigamiRef = useRef<string | null>(null);

  const sentencesRef = useRef<Sentence[]>([]);
  const playingFoldRef = useRef<number | null>(null);
  /** True while a fold play() awaits decode — blocks autoplay re-entry. */
  const playInFlightRef = useRef(false);
  const sectionsRef = useRef<Section[]>([]);
  const analyzeTimerRef = useRef<number | null>(null);
  /** Sentence seek requested inside a fold that isn't playing yet. */
  const pendingSeekRef = useRef<{ fold: number; local: number } | null>(null);
  const foldOffsetsRef = useRef<number[]>([]);
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

  /**
   * Whole-document viewer model: every fold at once, in reading order.
   * Folds whose audio has landed contribute sentence-split text
   * (with global indices for cross-fold highlight/seek); the rest show
   * plain section text until they finish folding.
   */
  const { viewerFolds, foldOffsets, sentenceByGlobalIndex } = useMemo(() => {
    const folds: ViewerFold[] = [];
    const offsets: number[] = [];
    const byIndex = new Map<
      number,
      { fold: number; local: number; start_ms: number }
    >();
    let cursor = 0;

    const pushFold = (index: number, title: string | null, plainText: string) => {
      offsets.push(cursor);
      const raw = docTTS.getFold(index)?.sentences;
      if (raw && raw.length > 0) {
        const mapped = raw.map((s, j) => {
          const g = cursor + j;
          byIndex.set(g, { fold: index, local: j, start_ms: s.start_ms });
          return { index: g, text: s.text, start_ms: s.start_ms, end_ms: s.end_ms };
        });
        cursor += mapped.length;
        folds.push({ index, title, sentences: mapped, text: plainText, status: "ready" });
      } else {
        const status =
          docTTS.foldStatus[index] === "error" ? "error" : "pending";
        folds.push({ index, title, sentences: null, text: plainText, status });
      }
    };

    if (hasStructure && sections.length > 0) {
      sections.forEach((s, i) => pushFold(i, s.title || null, s.text || ""));
    } else if (text.trim()) {
      pushFold(0, null, text);
    }

    return {
      viewerFolds: folds,
      foldOffsets: offsets,
      sentenceByGlobalIndex: byIndex,
    };
  }, [hasStructure, sections, text, docTTS]);

  useEffect(() => {
    foldOffsetsRef.current = foldOffsets;
  }, [foldOffsets]);

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

  // Poll global words-folded counter every 15s
  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      fetch(apiUrl("/api/stats"))
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && typeof data?.words_folded === "number") {
            setWordsFolded(data.words_folded);
          }
        })
        .catch(() => {});
    };
    fetchStats();
    // Poll every 60s — frequent enough to feel live, light on API calls.
    const id = setInterval(fetchStats, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  /* ── load a saved origami from ?origami= ── */

  useEffect(() => {
    // Wait for auth to settle first. AppShell swaps readers when auth
    // resolves (mobile mounts MobileReader); loading a fold before that
    // point made this reader fetch and auto-play the stored fold, and the
    // visible reader then played the same fold again — doubled audio.
    if (authLoading || !user) return;

    // Read the id from the URL directly — more reliable than the hook
    // across client-side navigations in Next 16.
    const id = new URLSearchParams(window.location.search).get("origami");
    if (!id || loadedOrigamiRef.current === id) return;
    let cancelled = false;

    // A pending analyze debounce must not fire after this load — it would
    // overwrite the canvas with stale draft text and reprocess audio.
    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
      analyzeTimerRef.current = null;
    }

    (async () => {
      try {
        // Same-origin fetch — these are Next.js route handlers, not FastAPI.
        const res = await fetch(`/api/origamis/${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Load failed (${res.status})`);
        }
        const o: Origami = await res.json();
        if (cancelled) return;

        loadedOrigamiRef.current = id;

        // Stop anything currently playing before loading the new session.
        audioPlayer.stop();
        playInFlightRef.current = false;
        setPlayingFoldIndex(null);
        setWaitingFold(null);
        setAutoPlayFold(null);

        const savedSecs = (o.sections || []) as Section[];
        // Regenerating (no saved audio): expand sections whose audio would
        // exceed ~4 min into continuation folds BEFORE they enter reader
        // state — fold indices stay 1:1 with sections everywhere. Hydrate
        // keeps sections as saved; fold_audio indices match them as-is.
        const hasSavedAudio = Boolean(o.fold_audio && o.fold_audio.length > 0);
        const secs = hasSavedAudio
          ? savedSecs
          : expandSectionsForTTS(savedSecs, o.speed || speed);
        // Text + sections feed the viewer/canvas directly — the textbox
        // stays hidden and empty; this is a loaded session, not a fresh paste.
        setText(o.text);
        setDraft("");
        setSections(secs);
        sectionsRef.current = secs;
        setHasStructure(secs.length > 0);
        setDocType(secs.length > 0 ? "chapters" : "flat");
        setSelectedSection(null);
        setSourceOpen(false);
        setCompanionOpen(false);
        hadCompanionTextRef.current = true;
        setError(null);
        if (o.voice) setVoice(o.voice);
        if (o.speed) setSpeed(o.speed);

        // Saved audio — hydrate the reader directly, no reprocessing.
        if (o.fold_audio && o.fold_audio.length > 0) {
          setAutoPlayFold(0);
          docTTS.hydrate(o.fold_audio);
          return;
        }

        // No saved audio (older origami) — regenerate via the normal flow.
        if (secs.length > 0 && o.text.trim()) {
          setAutoPlayFold(0);
          setIsLoading(true);
          try {
            await docTTS.start({
              text: o.text,
              voice: o.voice || voice,
              speed: o.speed || speed,
              sections: secs,
            });
          } finally {
            if (!cancelled) setIsLoading(false);
          }
        }
      } catch (err) {
        console.error("Failed to load origami:", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the saved origami. It may have expired.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origamiParam, authLoading, user]);

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
          // Expand sections whose audio would exceed ~4 min into
          // continuation folds before they enter reader state.
          const nextSections: Section[] = expandSectionsForTTS(
            data.sections || [],
            speed,
          );
          setSections(nextSections);
          sectionsRef.current = nextSections;
          // Paragraph-packed and structured docs both count as folds
          setHasStructure(
            Boolean(data.has_structure) || nextSections.length > 0,
          );
          setDocType(data.doc_type || "flat");
          setSelectedSection(null);

          // Fan out one TTS request per fold immediately
          if (nextSections.length > 0) {
            // Commit the session: the canvas (text + sections) now owns the
            // data, and the textbox clears so the fold can't be re-modified.
            setText(textToAnalyze);
            setDraft("");
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
          // Mark complete only when the last sentence has finished —
          // fold advance itself runs from the player's onEnded callback.
          // (Advancing on last.start_ms used to kill the final line.)
          if (i >= current.length - 1) {
            const last = current[current.length - 1];
            if (last.end_ms > 0 && currentTime >= last.end_ms / 1000) {
              setHasCompletedRead(true);
            }
          }
          return;
        }
      }
      setActiveSentenceIndex(0);
    },
    [],
  );

  /**
   * Called when the current fold's audio ends naturally (not stop/pause).
   * Queues the next fold for playback if one exists.
   */
  const advanceAfterFold = useCallback(() => {
    setHasCompletedRead(true);
    const next = (playingFoldRef.current ?? -1) + 1;
    const total = sectionsRef.current.length;
    if (total > next) {
      setWaitingFold(next);
    }
  }, []);

  const resetReadingState = useCallback(() => {
    docTTS.cancel();
    audioPlayer.stop();
    playInFlightRef.current = false;
    if (analyzeTimerRef.current) {
      window.clearTimeout(analyzeTimerRef.current);
      analyzeTimerRef.current = null;
    }
    pendingSeekRef.current = null;
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
    setDraft("");
    setSections([]);
    setSelectedSection(null);
    setHasStructure(false);
    setError(null);
    // Ready for the next document — bring the source box back
    setSourceOpen(true);
  }, [resetReadingState]);

  const handleFileExtracted = useCallback(
    (extractedText: string) => {
      resetReadingState();
      setText(extractedText);
      setDraft("");
      setError(null);
      analyzeText(extractedText);
    },
    [resetReadingState, analyzeText],
  );

  /** Load a fold's generated audio and start playback. */
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
      setHasCompletedRead(false);
      setAudioBase64(fold.audio_base64);
      setPlayingFoldIndex(index);
      playingFoldRef.current = index;
      setWaitingFold(null);
      setAutoPlayFold(null);
      setIsLoading(false);

      // Honor a sentence click that landed before this fold's audio was ready
      const seek = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (seek && seek.fold === index && foldSentences.length > 0) {
        const local = Math.min(
          Math.max(seek.local, 0),
          foldSentences.length - 1,
        );
        audioPlayer.setOffset(foldSentences[local].start_ms / 1000);
        setActiveSentenceIndex(local);
      } else {
        audioPlayer.setOffset(0);
        setActiveSentenceIndex(null);
      }

      // Advance only when this fold's audio actually finishes, not when
      // the last sentence starts (that skipped the final line).
      // Flag in-flight so the autoplay effect can't re-enter while the
      // player is still decoding (isPlaying stays false until decode lands).
      playInFlightRef.current = true;
      audioPlayer.play(fold.audio_base64, handleTimeUpdate, advanceAfterFold);
      return true;
    },
    [audioPlayer, docTTS, handleTimeUpdate, updateSentences, advanceAfterFold],
  );

  /** When a fold finishes generating, play it if the user is waiting on it. */
  useEffect(() => {
    const target = waitingFold ?? autoPlayFold;
    if (target === null) return;
    // Already playing, paused, or mid-decode on this fold — don't restart it.
    // (isPlaying is false while decodeAudioData is pending; without the
    // in-flight check this effect re-fires on every render and stacks plays.)
    if (
      playingFoldRef.current === target &&
      (audioPlayer.isPlaying || audioPlayer.isPaused || playInFlightRef.current)
    )
      return;
    if (docTTS.hasFold(target)) {
      startPlayingFold(target);
    }
  }, [docTTS.readyTick, waitingFold, autoPlayFold, docTTS, startPlayingFold, audioPlayer.isPlaying, audioPlayer.isPaused]);

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
      audioPlayer.play(audioBase64, handleTimeUpdate, advanceAfterFold);
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
    advanceAfterFold,
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
      audioPlayer.play(audioBase64, handleTimeUpdate, advanceAfterFold);
    },
    [audioBase64, audioPlayer, handleTimeUpdate, advanceAfterFold],
  );

  const handlePause = useCallback(() => {
    playInFlightRef.current = false;
    audioPlayer.pause();
  }, [audioPlayer]);

  const handleStop = useCallback(() => {
    resetReadingState();
    // Bring source back after stop so new text can be pasted
    setSourceOpen(true);
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

  // Playback tracks fold-local sentence indices; the sheet addresses
  // sentences globally across all folds — map the active one up.
  const viewerActiveIndex =
    activeSentenceIndex !== null && playingFoldIndex !== null
      ? (foldOffsets[playingFoldIndex] ?? 0) + activeSentenceIndex
      : null;

  const foldCardChars = activeSection
    ? activeSection.char_end - activeSection.char_start
    : text.trim().length;
  const foldCardDuration = estimateDuration(foldCardChars);

  // Right-sidebar description: show the backend fold summary the moment it
  // exists; while a fold has none, say so — never fall back to the raw
  // first-sentence preview. Reacts automatically when a summary arrives.
  const foldDescription = activeSection?.summary
    ? activeSection.summary
    : activeSection
      ? "Summarizing this fold — the description will appear here when it's ready."
      : text.trim()
        ? "Press play. Read along. The sheet advances as sentences finish."
        : "Load a document to begin. Each section is a fold; the crane stands when the last one closes.";

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
   * Plays immediately if that fold's audio is ready; otherwise
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

  /**
   * Click a sentence anywhere in the sheet. Same fold + audio loaded →
   * seek straight to it. Otherwise jump to that fold, carrying the seek
   * so playback starts on the clicked line once audio lands.
   */
  const handleSentenceClick = useCallback(
    (globalIndex: number) => {
      const entry = sentenceByGlobalIndex.get(globalIndex);
      if (!entry) return;

      if (entry.fold === playingFoldIndex && audioBase64) {
        audioPlayer.stop();
        audioPlayer.setOffset(entry.start_ms / 1000);
        setActiveSentenceIndex(entry.local);
        audioPlayer.play(audioBase64, handleTimeUpdate, advanceAfterFold);
        return;
      }

      pendingSeekRef.current = { fold: entry.fold, local: entry.local };
      void jumpToFold(entry.fold);
    },
    [
      sentenceByGlobalIndex,
      playingFoldIndex,
      audioBase64,
      audioPlayer,
      handleTimeUpdate,
      jumpToFold,
    ],
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

  // Companion: expand when empty; auto-collapse the first time text arrives
  useEffect(() => {
    const hasText = Boolean(text.trim());
    if (!hasText) {
      setCompanionOpen(true);
      hadCompanionTextRef.current = false;
    } else if (!hadCompanionTextRef.current) {
      setCompanionOpen(false);
      hadCompanionTextRef.current = true;
    }
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
      ? "Preparing"
      : audioBase64 && !isLoading
        ? "Resume"
        : "Play";
  const playIcon = audioPlayer.isPlaying ? (
    <PauseIcon className="h-4 w-4" />
  ) : (
    <PlayIcon className="h-4 w-4" />
  );

  /** Hide Source once audio is ready or playback/fold work has started. */
  const hideSource =
    Boolean(audioBase64) ||
    audioPlayer.isPlaying ||
    audioPlayer.isPaused ||
    isPreparingFolds ||
    docTTS.isSubmitting;

  const showStop = audioPlayer.isPlaying || audioPlayer.isPaused;
  const showCancel = (isLoading || docTTS.isSubmitting) && !showStop;
  const hasSecondTransport = showStop || showCancel;

  /** Audio is ready — transport controls live in the sheet header. */
  const showHeaderTransport = Boolean(audioBase64) || audioPlayer.isPlaying || audioPlayer.isPaused;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ——— Top bar: logo · tagline (centered) · auth ——— */}
      <header className="z-30 flex shrink-0 items-center gap-4 border-b border-hairline bg-fold px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
          <CraneMark className="h-7 w-7 text-vermilion-ink" />
          {/* Matches the landing .wordmark: Shippori Mincho 700 @ 28px */}
          <span className="font-display text-[28px] font-bold leading-none tracking-[0.012em] text-sumi">
            oriyomi
          </span>
        </Link>
        <p className="label-ui label-sm min-w-0 flex-1 text-center leading-relaxed text-ink-fade">
          <span className="text-sumi-soft">ori</span>—to fold,{" "}
          <span className="text-sumi-soft">yomi</span>—to read
        </p>
        {user ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/library"
              className="outline-btn label-sm h-8 rounded-none px-3 no-underline"
            >
              Library
            </Link>
            <button
              type="button"
              className="outline-btn label-sm h-8 rounded-none px-3"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="outline-btn label-sm h-8 rounded-none px-3 shrink-0"
            onClick={() => setLoginOpen(true)}
          >
            Log in
          </button>
        )}
      </header>

      {/* ——— Three-zone desk (viewport-locked; only the sheet scrolls long content) ——— */}
      <main className="mx-auto grid w-full max-w-[1600px] min-h-0 flex-1 grid-cols-1 gap-[var(--zone-gap)] overflow-y-auto px-4 py-4 sm:px-6 lg:grid-cols-[var(--rail-w)_minmax(0,1fr)_minmax(16rem,22rem)] lg:grid-rows-1 lg:overflow-hidden lg:px-8 lg:py-5">
        {/* Left rail — panel itself does not scroll; fold cards scroll inside FoldList */}
        <aside className="flex min-h-0 flex-col gap-0 overflow-hidden border border-hairline bg-washi/40 px-4 py-4">
          <div className="label-ui shrink-0 label-lg text-ink-fade">
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
              <span className="font-data label-lg text-ink-fade">
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

          {/* Scrollable upper region — fold cards + source share it; the rail itself never scrolls */}
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
          {hasStructure && sections.length > 0 && (
            <div className="flex min-h-0 flex-col">
              <FoldList
                sections={sections}
                activeFoldIndex={foldIndex}
                onSelectFold={handleSelectFold}
                disabled={isLoading}
              />
            </div>
          )}
          {/* source: upload + paste — hidden once audio is ready / playing */}
          {!hideSource && (
          <div id="source">
            <div className="flex items-center justify-between gap-2">
              <h2 className="label-ui label-lg text-sumi-soft">Source</h2>
              <button
                type="button"
                onClick={() => setSourceOpen((v) => !v)}
                className="label-ui label-lg text-ink-fade hover:text-vermilion"
                aria-expanded={sourceOpen}
              >
                {sourceOpen ? "Hide" : "Show"}
              </button>
            </div>
            {sourceOpen && (
              <div className="mt-3 flex flex-col gap-3">
                <FileUpload onTextExtracted={handleFileExtracted} />
                <TextBox
                  text={draft}
                  onChange={(t) => {
                    setDraft(t);
                    setHasCompletedRead(false);
                    if (!t.trim()) {
                      resetReadingState();
                      setText("");
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
              </div>
            )}
          </div>
          )}

          {foldsQueued > 0 && foldsComplete < foldsQueued && (
            <div className="mt-4 border border-hairline bg-fold p-3">
              <div className="flex items-center justify-between font-ui label-lg text-sumi-soft">
                <span>Folding…</span>
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

          {/* Transport — pinned at the rail bottom, always visible */}
          <div className="shrink-0 pt-5">
          <div className="flex flex-col gap-2">
            <SaveOrigamiButton
              text={text}
              sections={sections}
              voice={voice}
              speed={speed}
              foldAudio={docTTS.getAllFolds()}
            />
          <div className="flex items-center gap-2">
            {showHeaderTransport ? (
              /* Audio ready: Stop while playing; Clear once the read finishes */
              showStop ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="outline-btn reader-transport-btn h-11 w-full rounded-none px-4 label-lg"
                >
                  <StopIcon className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : hasCompletedRead ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="outline-btn reader-transport-btn h-11 w-full rounded-none px-4 label-lg"
                >
                  Clear
                </button>
              ) : null
            ) : (
              <>
                {showCancel && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="outline-btn reader-transport-btn h-11 shrink-0 rounded-none px-4 label-lg"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={audioPlayer.isPlaying ? handlePause : handlePlay}
                  disabled={
                    !audioPlayer.isPlaying &&
                    !audioPlayer.isPaused &&
                    (isLoading || docTTS.isSubmitting)
                  }
                  className={`gold-dot-btn h-11 label-lg ${
                    hasSecondTransport ? "flex-1" : "w-full"
                  }`}
                  aria-label={playLabel}
                >
                  {playIcon}
                  <span>{playLabel}</span>
                </button>
              </>
            )}
          </div>
          </div>
          </div>
        </aside>

        {/* Center sheet — the only long scroller on desktop */}
        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <TextViewer
              folds={viewerFolds}
              activeSentenceIndex={viewerActiveIndex}
              onSentenceClick={handleSentenceClick}
              currentSectionTitle={currentSectionTitle}
              completedFolds={completedFolds}
              totalFolds={foldTotal}
              activeFoldIndex={foldIndex}
              jumpToSentenceIndex={jumpToSentenceIndex}
              transport={showHeaderTransport ? (
                <>
                  {showStop && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="outline-btn reader-transport-btn h-8 w-8 rounded-none"
                      aria-label="Stop"
                    >
                      <StopIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={audioPlayer.isPlaying ? handlePause : handlePlay}
                    disabled={
                      !audioPlayer.isPlaying &&
                      !audioPlayer.isPaused &&
                      (isLoading || docTTS.isSubmitting)
                    }
                    className="gold-dot-btn reader-transport-btn h-8 w-8"
                    aria-label={playLabel}
                  >
                    {audioPlayer.isPlaying ? (
                      <PauseIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PlayIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              ) : undefined}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 pt-2 font-ui text-xs text-vermilion-soft">
            <span aria-hidden="true">▶</span>
            <span className="label-ui label-sm text-ink-mute tabular-nums">
              {wordsFolded.toLocaleString()} word{wordsFolded === 1 ? "" : "s"} folded
            </span>
            <a
              href="https://buymeacoffee.com/aaroncayanan"
              target="_blank"
              rel="noopener noreferrer"
              className="label-ui label-sm text-ink-mute transition-colors hover:text-vermilion"
            >
              ☕ Buy me a coffee
            </a>
            <span aria-hidden="true">◀</span>
          </div>
        </section>

        {/* Right: companion + current fold + playback + quiz */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {/* Companion — quiz-style collapse; open when empty, optional once text is pasted */}
          <section
            className="shrink-0 border border-hairline bg-fold/80"
            aria-label="Reading companion"
          >
            <button
              type="button"
              onClick={() => setCompanionOpen((v) => !v)}
              aria-expanded={companionOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-hairline px-4 py-3 text-left transition-colors hover:bg-washi/60"
            >
              <div className="flex items-center gap-2.5">
                <span className="label-ui label-lg text-sumi-soft">
                  Companion
                </span>
                {Boolean(text.trim()) && (
                  <span className="font-data label-lg text-ink-mute">
                    optional
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="label-ui label-lg text-ink-fade">
                  {companionOpen ? "Hide" : "Show"}
                </span>
                <ChevronIcon
                  className={`h-4 w-4 shrink-0 text-ink-fade transition-transform ${
                    companionOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
            {companionOpen && (
              <div className="p-2">
                <BrainrotStage className="aspect-square w-full" />
              </div>
            )}
          </section>

          <div className="shrink-0 border border-hairline bg-fold px-4 py-4">
            <div className="label-ui label-lg text-ink-mute">Current fold</div>
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
              {foldDescription}
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
                  <span className="label-ui label-sm text-ink-fade">Previous</span>
                  <span className="w-full truncate font-ui label-lg font-semibold tracking-normal normal-case text-sumi">
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
                  <span className="label-ui label-sm text-ink-fade">Next</span>
                  <span className="w-full truncate font-ui label-lg font-semibold tracking-normal normal-case text-sumi">
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
            <div className="label-ui mb-1 label-lg text-ink-mute">Playback</div>
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

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
