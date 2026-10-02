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

const POLL_MS = 1200;

/**
 * Queues one Celery TTS task per fold and polls status until each fold's
 * audio is cached. Polling (not SSE) so folds that finish before the
 * client subscribes are still picked up, and short requests survive the
 * Next.js /api proxy.
 */
export default function useDocumentTTS(): UseDocumentTTSReturn {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [foldStatus, setFoldStatus] = useState<Record<number, FoldStatus>>({});
  const [readyTick, setReadyTick] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const foldAudioRef = useRef<Map<number, FoldAudio>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const documentIdRef = useRef<string | null>(null);
  const loadedFoldsRef = useRef<Set<number>>(new Set());

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    stopPolling();
    abortRef.current?.abort();
    abortRef.current = null;
    documentIdRef.current = null;
    setDocumentId(null);
    setFoldStatus({});
    foldAudioRef.current.clear();
    loadedFoldsRef.current.clear();
  }, [stopPolling]);

  const fetchFoldAudio = useCallback(async (docId: string, index: number) => {
    if (loadedFoldsRef.current.has(index)) return;
    loadedFoldsRef.current.add(index);
    try {
      const res = await fetch(
        apiUrl(`/api/tts/document/${docId}/fold/${index}`),
      );
      if (!res.ok) {
        loadedFoldsRef.current.delete(index);
        return;
      }
      const fold = (await res.json()) as FoldAudio;
      foldAudioRef.current.set(index, fold);
      setReadyTick((t) => t + 1);
    } catch (err) {
      loadedFoldsRef.current.delete(index);
      console.error("Failed to load fold audio:", err);
    }
  }, []);

  const poll = useCallback(async () => {
    const docId = documentIdRef.current;
    if (!docId) return;

    const schedule = () => {
      pollTimerRef.current = window.setTimeout(() => {
        void poll();
      }, POLL_MS);
    };

    try {
      const res = await fetch(apiUrl(`/api/tts/document/${docId}/status`));
      if (res.status === 404) {
        // Status record missing — try fold audio directly, keep polling briefly
        for (let i = 0; i < 8; i += 1) {
          await fetchFoldAudio(docId, i);
        }
        schedule();
        return;
      }
      if (!res.ok) {
        schedule();
        return;
      }
      const data = (await res.json()) as {
        folds: Array<{ index: number; status: FoldStatus }>;
      };

      const next: Record<number, FoldStatus> = {};
      let completeCount = 0;
      let errorCount = 0;
      for (const f of data.folds || []) {
        next[f.index] = f.status;
        if (f.status === "complete") completeCount += 1;
        if (f.status === "error") errorCount += 1;
      }
      setFoldStatus(next);

      for (const f of data.folds || []) {
        if (f.status === "complete") {
          await fetchFoldAudio(docId, f.index);
        }
      }

      // Also opportunistically probe fold audio if status lags behind
      // (worker finished but status write raced the poll).
      if (completeCount === 0) {
        for (let i = 0; i < (data.folds?.length ?? 0); i += 1) {
          await fetchFoldAudio(docId, i);
        }
      }

      const total = data.folds?.length ?? 0;
      if (total > 0 && completeCount + errorCount >= total) {
        return; // all done — stop polling
      }
    } catch (err) {
      console.error("Fold status poll failed:", err);
    }

    schedule();
  }, [fetchFoldAudio]);

  const start = useCallback(
    async (opts: StartOpts): Promise<string | null> => {
      cancel();

      const folds = opts.sections
        .map((s, i) => ({
          index: i,
          title: s.title || `Fold ${String(i + 1).padStart(2, "0")}`,
          text: (s.text || "").trim(),
          char_start: s.char_start,
          char_end: s.char_end,
        }))
        .filter((f) => f.text.length > 0);

      if (folds.length === 0) return null;

      const abort = new AbortController();
      abortRef.current = abort;
      setIsSubmitting(true);

      try {
        const res = await fetch(apiUrl("/api/tts/document"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: opts.text,
            voice: opts.voice,
            speed: opts.speed,
            folds,
          }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || `Server error (${res.status})`);
        }

        const docId: string = data.document_id;
        documentIdRef.current = docId;
        setDocumentId(docId);

        const initial: Record<number, FoldStatus> = {};
        for (const f of data.folds as Array<{ index: number; status: FoldStatus }>) {
          initial[f.index] = f.status;
        }
        setFoldStatus(initial);

        // Poll immediately — a fold may already be done (short texts)
        void poll();
        return docId;
      } catch (err) {
        if (abort.signal.aborted) return null;
        console.error("Document TTS submit failed:", err);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [cancel, poll],
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

  useEffect(() => stopPolling, [stopPolling]);

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
