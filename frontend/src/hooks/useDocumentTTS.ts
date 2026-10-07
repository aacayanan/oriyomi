"use client";

import { useCallback, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import type { Section } from "@/components/ChapterSelector";

export interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface FoldAudio {
  fold_index: number;
  title: string;
  audio_base64: string;
  sentences: Sentence[];
  duration_ms: number;
}

export type FoldStatus = "queued" | "processing" | "complete" | "error";

interface StartOpts {
  /** Full document text; not sent to the API (folds carry their own text). */
  text: string;
  voice: string;
  speed: number;
  sections: Section[];
}

interface UseDocumentTTSReturn {
  documentId: string | null;
  foldStatus: Record<number, FoldStatus>;
  /** Bumped whenever a fold's audio becomes available */
  readyTick: number;
  isSubmitting: boolean;
  /** Most recent fold failure message — surfaced in the folding card. */
  lastError: string | null;
  start: (opts: StartOpts) => Promise<string | null>;
  /** Load saved fold audio directly — skips TTS generation entirely. */
  hydrate: (audio: FoldAudio[]) => void;
  cancel: () => void;
  getFold: (index: number) => FoldAudio | undefined;
  /** All currently loaded folds, for persisting a session. */
  getAllFolds: () => FoldAudio[];
  hasFold: (index: number) => boolean;
  /** Re-queue folds whose generation failed. No-op while a run is active. */
  retryFailed: () => Promise<void>;
}

/**
 * Parallel fold generation: one POST /api/tts/fold per section.
 *
 * Requests are pooled (MAX_CONCURRENT_FOLDS) rather than all fired at once —
 * each response carries full base64 audio, and an unbounded fan-out resets
 * the Next.js /api proxy under Docker (socket hang up / ECONNRESET).
 * Network failures are retried once before the fold is marked error.
 *
 * The first completed fold is playable immediately (readyTick bumps per fold).
 * Cancel aborts every in-flight fold request. Folds that settled as error
 * can be re-queued with retryFailed() — the failure message is kept in
 * lastError so the UI can show why instead of "preparing" forever.
 */
const MAX_CONCURRENT_FOLDS = 3;
const FOLD_RETRY_DELAY_MS = 400;

interface FoldJob {
  index: number;
  title: string;
  text: string;
}

export default function useDocumentTTS(): UseDocumentTTSReturn {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [foldStatus, setFoldStatus] = useState<Record<number, FoldStatus>>({});
  const [readyTick, setReadyTick] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const foldAudioRef = useRef<Map<number, FoldAudio>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  /** Jobs + prefs from the last start() — retryFailed regenerates from these. */
  const jobsRef = useRef<FoldJob[]>([]);
  const optsRef = useRef<{ voice: string; speed: number } | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    jobsRef.current = [];
    optsRef.current = null;
    setDocumentId(null);
    setFoldStatus({});
    foldAudioRef.current.clear();
    setIsSubmitting(false);
    setLastError(null);
  }, []);

  const hydrate = useCallback(
    (audio: FoldAudio[]) => {
      cancel();
      if (audio.length === 0) return;

      const status: Record<number, FoldStatus> = {};
      for (const f of audio) {
        foldAudioRef.current.set(f.fold_index, f);
        status[f.fold_index] = "complete";
      }
      const docId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDocumentId(docId);
      setFoldStatus(status);
      setReadyTick((t) => t + 1);
    },
    [cancel],
  );

  /**
   * Shared worker pool: generate `jobs`, updating per-fold status as they
   * land. Settles isSubmitting when every job in THIS run has finished.
   */
  const runFoldJobs = useCallback(
    async (
      jobs: FoldJob[],
      opts: { voice: string; speed: number },
      abort: AbortController,
    ) => {
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const t = window.setTimeout(resolve, ms);
          abort.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });

      const fetchFold = async (f: FoldJob): Promise<FoldAudio> => {
        let lastErr: unknown;
        // One retry for transport/proxy resets and flaky TTS upstreams.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (abort.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          try {
            const res = await fetch(apiUrl("/api/tts/fold"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: f.text,
                voice: opts.voice,
                speed: opts.speed,
                fold_index: f.index,
                title: f.title,
              }),
              signal: abort.signal,
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.detail || `Server error (${res.status})`);
            }
            return data as FoldAudio;
          } catch (err) {
            if (abort.signal.aborted) throw err;
            lastErr = err;
            if (attempt === 0) {
              await sleep(FOLD_RETRY_DELAY_MS);
              continue;
            }
            throw err;
          }
        }
        throw lastErr;
      };

      let remaining = jobs.length;
      const settle = () => {
        remaining -= 1;
        if (remaining <= 0 && !abort.signal.aborted) {
          setIsSubmitting(false);
        }
      };

      // Bounded worker pool: at most MAX_CONCURRENT_FOLDS in flight.
      let cursor = 0;
      const worker = async () => {
        while (cursor < jobs.length) {
          if (abort.signal.aborted) return;
          const f = jobs[cursor];
          cursor += 1;
          setFoldStatus((s) => ({ ...s, [f.index]: "processing" }));
          try {
            const data = await fetchFold(f);
            if (abort.signal.aborted) return;
            foldAudioRef.current.set(f.index, data);
            setFoldStatus((s) => ({ ...s, [f.index]: "complete" }));
            setReadyTick((t) => t + 1);
          } catch (err) {
            if (abort.signal.aborted) return;
            console.error(`Fold ${f.index} generation failed:`, err);
            setLastError(
              err instanceof Error ? err.message : "Fold generation failed",
            );
            setFoldStatus((s) => ({ ...s, [f.index]: "error" }));
          } finally {
            settle();
          }
        }
      };

      const poolSize = Math.min(MAX_CONCURRENT_FOLDS, jobs.length);
      await Promise.all(Array.from({ length: poolSize }, () => worker()));
    },
    [],
  );

  const start = useCallback(
    async (opts: StartOpts): Promise<string | null> => {
      cancel();

      const folds: FoldJob[] = opts.sections
        .map((s, i) => ({
          index: i,
          title: s.title || `Fold ${String(i + 1).padStart(2, "0")}`,
          text: (s.text || "").trim(),
        }))
        .filter((f) => f.text.length > 0);

      if (folds.length === 0) return null;

      const abort = new AbortController();
      abortRef.current = abort;
      jobsRef.current = folds;
      optsRef.current = { voice: opts.voice, speed: opts.speed };

      // Client-side job id — there is no server-side document record.
      const docId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDocumentId(docId);

      const initial: Record<number, FoldStatus> = {};
      for (const f of folds) initial[f.index] = "queued";
      setFoldStatus(initial);
      setIsSubmitting(true);

      await runFoldJobs(folds, { voice: opts.voice, speed: opts.speed }, abort);

      return docId;
    },
    [cancel, runFoldJobs],
  );

  const retryFailed = useCallback(async () => {
    if (isSubmitting) return;
    const opts = optsRef.current;
    const jobs = jobsRef.current;
    if (!opts || jobs.length === 0) return;

    const failed = jobs.filter((f) => foldStatus[f.index] === "error");
    if (failed.length === 0) return;

    let abort = abortRef.current;
    if (!abort) {
      abort = new AbortController();
      abortRef.current = abort;
    }

    setLastError(null);
    // Synchronous re-queue: waiting/autoPlay effects must observe "queued"
    // rather than the stale "error" as soon as retry is requested.
    setFoldStatus((s) => {
      const next = { ...s };
      for (const f of failed) next[f.index] = "queued";
      return next;
    });
    setIsSubmitting(true);

    await runFoldJobs(failed, opts, abort);
  }, [isSubmitting, foldStatus, runFoldJobs]);

  const getFold = useCallback(
    (index: number) => foldAudioRef.current.get(index),
    [],
  );

  const getAllFolds = useCallback(
    () => Array.from(foldAudioRef.current.values()),
    // readyTick included so callers see folds that just landed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readyTick],
  );

  const hasFold = useCallback(
    (index: number) => foldAudioRef.current.has(index),
    // readyTick intentionally included so callers re-check after audio lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readyTick],
  );

  return {
    documentId,
    foldStatus,
    readyTick,
    isSubmitting,
    lastError,
    start,
    hydrate,
    cancel,
    getFold,
    getAllFolds,
    hasFold,
    retryFailed,
  };
}
