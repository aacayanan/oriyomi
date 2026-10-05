"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  start: (opts: StartOpts) => Promise<string | null>;
  cancel: () => void;
  getFold: (index: number) => FoldAudio | undefined;
  hasFold: (index: number) => boolean;
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
 * Cancel aborts every in-flight fold request.
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

  const foldAudioRef = useRef<Map<number, FoldAudio>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDocumentId(null);
    setFoldStatus({});
    foldAudioRef.current.clear();
    setIsSubmitting(false);
  }, []);

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

      let remaining = folds.length;
      const settle = () => {
        remaining -= 1;
        if (remaining <= 0 && !abort.signal.aborted) {
          setIsSubmitting(false);
        }
      };

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

      // Bounded worker pool: at most MAX_CONCURRENT_FOLDS in flight.
      let cursor = 0;
      const worker = async () => {
        while (cursor < folds.length) {
          if (abort.signal.aborted) return;
          const f = folds[cursor];
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
            setFoldStatus((s) => ({ ...s, [f.index]: "error" }));
          } finally {
            settle();
          }
        }
      };

      const poolSize = Math.min(MAX_CONCURRENT_FOLDS, folds.length);
      await Promise.all(Array.from({ length: poolSize }, () => worker()));

      return docId;
    },
    [cancel],
  );

  const getFold = useCallback(
    (index: number) => foldAudioRef.current.get(index),
    [],
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
    start,
    cancel,
    getFold,
    hasFold,
  };
}
