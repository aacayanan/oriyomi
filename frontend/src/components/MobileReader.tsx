"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth, useAuthActions } from "@/hooks/useAuth";
import useDocumentTTS, {
  type FoldAudio,
  type FoldStatus,
} from "@/hooks/useDocumentTTS";
import useAudioPlayer from "./useAudioPlayer";
import LoginModal from "@/components/LoginModal";
import type { Origami } from "@/types/origami";
import type { Section } from "@/components/ChapterSelector";
import { PlayIcon, PauseIcon, StopIcon, CraneMark } from "@/components/Icons";
import { apiUrl } from "@/lib/api";

/* ─── helpers ─── */

function formatTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Flatten a nested Section tree into a flat list for TTS generation. */
function flattenSections(sections: unknown[]): Section[] {
  const flat: Section[] = [];
  const walk = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (typeof s.text === "string" && s.text.trim().length > 0) {
        flat.push(s as unknown as Section);
      }
      if (Array.isArray(s.children)) {
        walk(s.children);
      }
    }
  };
  walk(sections);
  return flat;
}

/* ─── component ─── */

export default function MobileReader() {
  const { user, loading: authLoading } = useAuth();
  const { signOut } = useAuthActions();
  const searchParams = useSearchParams();
  const router = useRouter();

  /* auth gate */
  const [loginOpen, setLoginOpen] = useState(false);

  /* library state */
  const [origamis, setOrigamis] = useState<Origami[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  /* reader state */
  const [view, setView] = useState<"library" | "reader">("library");
  const [origami, setOrigami] = useState<Origami | null>(null);
  const [loadingOrigami, setLoadingOrigami] = useState(false);
  const [activeFoldIndex, setActiveFoldIndex] = useState(0);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [error, setError] = useState<string | null>(null);

  /* TTS + audio */
  const tts = useDocumentTTS();
  const player = useAudioPlayer();
  const playingRef = useRef(false);
  const autoAdvanceRef = useRef(false);

  /* ── load origami list on mount ── */

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const res = await fetch(apiUrl("/api/origamis"), {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data: Origami[] = await res.json();
        if (!cancelled) setOrigamis(data);
      } catch (err) {
        if (!cancelled)
          setLibraryError(
            err instanceof Error ? err.message : "Could not load library",
          );
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  /* ── auto-load from ?origami= query param ── */

  useEffect(() => {
    const id = searchParams.get("origami");
    if (!id || authLoading || !user) return;
    const alreadyLoaded = origami?.id === id && view === "reader";
    if (alreadyLoaded) return;
    // Wait for library to finish loading so we can find the origami
    if (libraryLoading) return;

    const found = origamis.find((o) => o.id === id);
    if (found) {
      selectOrigami(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, authLoading, origamis, libraryLoading]);

  /* ── generate TTS when origami is selected ── */

  const sections = useMemo(
    () => (origami ? flattenSections(origami.sections) : []),
    [origami],
  );

  useEffect(() => {
    if (!origami || sections.length === 0) return;

    let cancelled = false;

    // Compute character offsets for each section (for sentence index tracking).
    const withOffsets = sections.map((s, i) => {
      let charStart = 0;
      for (let j = 0; j < i; j++) {
        charStart += (sections[j].text || "").length;
      }
      return { ...s, char_start: charStart, char_end: charStart + (s.text || "").length };
    });

    (async () => {
      const docId = await tts.start({
        text: origami.text,
        voice: origami.voice || "en-US-EmmaMultilingualNeural",
        speed,
        sections: withOffsets as unknown as Section[],
      });
      if (cancelled || !docId) return;
      // Auto-play first fold when ready
      // (readyTick will trigger the effect below)
    })();

    return () => {
      cancelled = true;
    };
    // Only run when origami changes — speed changes are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origami, sections.length]);

  /* ── auto-play first fold when audio is ready ── */

  useEffect(() => {
    if (view !== "reader") return;
    if (player.isPlaying || player.isPaused) return;
    if (autoAdvanceRef.current) return;
    if (!tts.hasFold(0)) return;

    autoAdvanceRef.current = true;
    playFold(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.readyTick, view]);

  /* ── player callbacks ── */

  const handleTimeUpdate = useCallback(
    (timeSec: number) => {
      const fold = tts.getFold(activeFoldIndex);
      if (!fold) return;
      const timeMs = timeSec * 1000;
      for (let i = 0; i < fold.sentences.length; i++) {
        const s = fold.sentences[i];
        if (timeMs >= s.start_ms && timeMs < s.end_ms) {
          setActiveSentenceIndex(i);
          break;
        }
      }
    },
    [tts, activeFoldIndex],
  );

  const handleFoldEnded = useCallback(() => {
    playingRef.current = false;
    // Auto-advance to next fold
    const nextIndex = activeFoldIndex + 1;
    if (tts.hasFold(nextIndex)) {
      setActiveFoldIndex(nextIndex);
      setActiveSentenceIndex(0);
      // Small delay so the UI updates before audio starts
      setTimeout(() => playFoldDirect(nextIndex), 150);
    }
  }, [activeFoldIndex, tts]);

  const playFoldDirect = useCallback(
    (foldIndex: number) => {
      const fold = tts.getFold(foldIndex);
      if (!fold) return;
      playingRef.current = true;
      player.setOffset(0);
      player.play(fold.audio_base64, handleTimeUpdate, handleFoldEnded);
    },
    [tts, player, handleTimeUpdate, handleFoldEnded],
  );

  const playFold = useCallback(
    (foldIndex: number) => {
      setActiveFoldIndex(foldIndex);
      setActiveSentenceIndex(0);
      playFoldDirect(foldIndex);
    },
    [playFoldDirect],
  );

  const handlePlayPause = useCallback(() => {
    if (player.isPlaying) {
      player.pause();
      playingRef.current = false;
      return;
    }
    if (player.isPaused) {
      // Resume: re-play from saved offset
      const fold = tts.getFold(activeFoldIndex);
      if (!fold) return;
      playingRef.current = true;
      player.play(fold.audio_base64, handleTimeUpdate, handleFoldEnded);
      return;
    }
    // Not playing and not paused — start current fold
    playFold(activeFoldIndex);
  }, [player, tts, activeFoldIndex, handleTimeUpdate, handleFoldEnded, playFold]);

  const handleStop = useCallback(() => {
    player.stop();
    playingRef.current = false;
    setActiveSentenceIndex(0);
  }, [player]);

  const handlePrevFold = useCallback(() => {
    if (activeFoldIndex <= 0) return;
    const prev = activeFoldIndex - 1;
    if (playingRef.current) {
      player.stop();
      playFold(prev);
    } else {
      setActiveFoldIndex(prev);
      setActiveSentenceIndex(0);
    }
  }, [activeFoldIndex, player, playFold]);

  const handleNextFold = useCallback(() => {
    if (activeFoldIndex >= sections.length - 1) return;
    const next = activeFoldIndex + 1;
    if (playingRef.current) {
      player.stop();
      playFold(next);
    } else {
      setActiveFoldIndex(next);
      setActiveSentenceIndex(0);
    }
  }, [activeFoldIndex, sections.length, player, playFold]);

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      player.setPlaybackRate(newSpeed);
    },
    [player],
  );

  /* ── navigation ── */

  const selectOrigami = useCallback(
    async (o: Origami) => {
      // Update URL without full navigation
      router.replace(`/app?origami=${o.id}`, { scroll: false });
      setOrigami(o);
      setSpeed(o.speed || 1.0);
      setActiveFoldIndex(0);
      setActiveSentenceIndex(0);
      setError(null);
      tts.cancel();
      player.stop();
      playingRef.current = false;
      autoAdvanceRef.current = false;
      setView("reader");
    },
    [router, tts, player],
  );

  const goBackToLibrary = useCallback(() => {
    tts.cancel();
    player.stop();
    playingRef.current = false;
    autoAdvanceRef.current = false;
    setView("library");
    setOrigami(null);
    setActiveFoldIndex(0);
    setActiveSentenceIndex(0);
    setError(null);
    router.replace("/app", { scroll: false });
  }, [tts, player, router]);

  const handleSignOut = useCallback(async () => {
    tts.cancel();
    player.stop();
    await signOut();
  }, [tts, player, signOut]);

  /* ── derived ── */

  const currentFold = tts.getFold(activeFoldIndex);
  const foldStatusMap = tts.foldStatus;
  const isGenerating =
    tts.isSubmitting &&
    Object.values(foldStatusMap).some(
      (s) => s === "queued" || s === "processing",
    );
  const currentFoldReady = tts.hasFold(activeFoldIndex);

  const currentSentence = currentFold?.sentences[activeSentenceIndex];
  const prevSentence =
    activeSentenceIndex > 0
      ? currentFold?.sentences[activeSentenceIndex - 1]
      : undefined;
  const nextSentence = currentFold?.sentences[activeSentenceIndex + 1];

  /* ── auth loading ── */

  if (authLoading) {
    return (
      <div className="mr-loading">
        <CraneMark className="mr-loading-mark" />
        <span className="mr-loading-text">Loading…</span>
      </div>
    );
  }

  /* ── signed out ── */

  if (!user) {
    return (
      <div className="app-mobile-gate">
        <svg className="gate-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
            fill="currentColor"
          />
        </svg>
        <span className="gate-wordmark">oriyomi</span>
        <span className="gate-rule" aria-hidden="true" />
        <p className="gate-copy">
          oriyomi works best on desktop devices, mobile is still in beta and
          requires an account
        </p>
        <button
          type="button"
          className="gate-login"
          onClick={() => setLoginOpen(true)}
        >
          Log in
        </button>
        <p className="gate-fine">折り to fold · 読み to read</p>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  /* ── LIBRARY VIEW ── */

  if (view === "library") {
    return (
      <div className="mobile-reader">
        <header className="mobile-reader-header">
          <span className="mobile-reader-title">Library</span>
          <button
            type="button"
            className="mobile-reader-action"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </header>

        <main className="mobile-reader-library">
          {libraryLoading && (
            <div className="mr-lib-status">
              <CraneMark className="mr-lib-status-mark" />
              <span>Loading…</span>
            </div>
          )}

          {libraryError && (
            <div className="mr-lib-status mr-lib-error">
              <span>{libraryError}</span>
              <button
                type="button"
                className="mr-lib-retry"
                onClick={() => {
                  setLibraryError(null);
                  setLibraryLoading(true);
                  // Re-trigger the effect by toggling state
                  setOrigamis([]);
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!libraryLoading && !libraryError && origamis.length === 0 && (
            <div className="mr-lib-empty">
              <CraneMark className="mr-lib-empty-mark" />
              <p>No origamis yet.</p>
              <p className="mr-lib-empty-hint">
                Upload a document on desktop to get started.
              </p>
            </div>
          )}

          {!libraryLoading && origamis.length > 0 && (
            <ul className="mr-lib-list">
              {origamis.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="mr-lib-item"
                    onClick={() => selectOrigami(o)}
                  >
                    <span className="mr-lib-item-title">{o.title}</span>
                    <span className="mr-lib-item-date">
                      {new Date(o.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    );
  }

  /* ── READER VIEW ── */

  const foldTitle =
    currentFold?.title ||
    sections[activeFoldIndex]?.title ||
    `Fold ${activeFoldIndex + 1}`;

  const generatingFolds = Object.entries(foldStatusMap).filter(
    ([, s]) => s === "queued" || s === "processing",
  ).length;
  const completedFolds = Object.values(foldStatusMap).filter(
    (s) => s === "complete",
  ).length;

  return (
    <div className="mobile-reader">
      {/* Header */}
      <header className="mobile-reader-header">
        <button
          type="button"
          className="mobile-reader-back"
          onClick={goBackToLibrary}
          aria-label="Back to library"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Library</span>
        </button>
        <span className="mobile-reader-title">{origami?.title}</span>
        <button
          type="button"
          className="mobile-reader-action"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </header>

      {/* Stage — sentence display */}
      <div className="mobile-reader-stage">
        {error && (
          <div className="mr-stage-error">
            <span>{error}</span>
            <button
              type="button"
              className="mr-stage-error-dismiss"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {isGenerating && !currentFoldReady && (
          <div className="mr-stage-loading">
            <CraneMark className="mr-stage-loading-mark" />
            <span className="mr-stage-loading-text">Preparing audio…</span>
            {completedFolds > 0 && (
              <span className="mr-stage-loading-progress">
                {completedFolds} of {sections.length} folds ready
              </span>
            )}
          </div>
        )}

        {currentFoldReady && (
          <>
            {/* Fold navigation */}
            <div className="mr-fold-nav">
              <button
                type="button"
                className="mr-fold-nav-btn"
                onClick={handlePrevFold}
                disabled={activeFoldIndex <= 0}
                aria-label="Previous fold"
              >
                ‹
              </button>
              <span className="mr-fold-nav-label">{foldTitle}</span>
              <button
                type="button"
                className="mr-fold-nav-btn"
                onClick={handleNextFold}
                disabled={activeFoldIndex >= sections.length - 1}
                aria-label="Next fold"
              >
                ›
              </button>
            </div>

            {/* Sentence display */}
            <div className="mr-sentence-area">
              {prevSentence && (
                <p className="mr-sentence mr-sentence--prev">
                  {prevSentence.text}
                </p>
              )}
              {currentSentence && (
                <p className="mr-sentence mr-sentence--active">
                  {currentSentence.text}
                </p>
              )}
              {nextSentence && (
                <p className="mr-sentence mr-sentence--next">
                  {nextSentence.text}
                </p>
              )}
              {!currentSentence && (
                <p className="mr-sentence mr-sentence--active">
                  {sections[activeFoldIndex]?.text?.slice(0, 200) || "…"}
                </p>
              )}
            </div>

            {/* Progress indicator */}
            {currentFold && (
              <div className="mr-progress">
                <span className="mr-progress-time">
                  {formatTime(player.currentTime * 1000)}
                </span>
                <div className="mr-progress-bar">
                  <div
                    className="mr-progress-fill"
                    style={{
                      width: `${currentFold.duration_ms > 0 ? Math.min(100, (player.currentTime * 1000) / currentFold.duration_ms * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="mr-progress-time">
                  {formatTime(currentFold.duration_ms)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Transport — fixed bottom bar */}
      <div className="mobile-reader-transport">
        <div className="mr-transport-controls">
          <button
            type="button"
            className="mr-transport-btn mr-transport-btn--stop"
            onClick={handleStop}
            disabled={!player.isPlaying && !player.isPaused}
            aria-label="Stop"
          >
            <StopIcon />
          </button>

          <button
            type="button"
            className="mr-transport-btn mr-transport-btn--play"
            onClick={handlePlayPause}
            disabled={!currentFoldReady}
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
        </div>

        <div className="mr-transport-speed">
          <label className="mr-speed-label" htmlFor="mr-speed">
            {speed.toFixed(1)}×
          </label>
          <input
            id="mr-speed"
            type="range"
            className="mr-speed-slider"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}