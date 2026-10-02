"use client";

import { useState, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";

export type TTSJobStatus = "idle" | "processing" | "complete" | "error";

export interface TTSJobResult {
  audio_base64: string;
  sentences: Array<{
    index: number;
    text: string;
    start_ms: number;
    end_ms: number;
  }>;
  voice: string;
  speed: number;
}

interface UseTTSJobReturn {
  status: TTSJobStatus;
  error: string | null;
  submitJob: (
    text: string,
    voice: string,
    speed: number,
  ) => Promise<TTSJobResult | null>;
  cancelJob: () => void;
}

/**
 * Single-block TTS: one synchronous POST /api/tts. Long texts chunk and
 * generate in parallel inside the request (see tts.generate_audio_chunked),
 * so there is no task id, no polling, and no SSE — the response is the audio.
 */
export default function useTTSJob(): UseTTSJobReturn {
  const [status, setStatus] = useState<TTSJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelJob = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    setError(null);
  }, []);

  const submitJob = useCallback(
    async (
      text: string,
      voice: string,
      speed: number,
    ): Promise<TTSJobResult | null> => {
      cancelJob();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setStatus("processing");
        setError(null);

        const res = await fetch(apiUrl("/api/tts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice, speed }),
          signal: abortController.signal,
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || `Server error (${res.status})`);
        }

        setStatus("complete");
        return data as TTSJobResult;
      } catch (err) {
        if (abortController.signal.aborted) return null;
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate speech.",
        );
        return null;
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [cancelJob],
  );

  return { status, error, submitJob, cancelJob };
}
