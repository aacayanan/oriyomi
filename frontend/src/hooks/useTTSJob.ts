"use client";

import { useState, useCallback, useRef } from "react";
import { apiUrl, apiEventSource } from "@/lib/api";

export type TTSJobStatus =
  | "idle"
  | "queued"
  | "processing"
  | "complete"
  | "error";

export interface TTSProgress {
  chunk: number;
  total: number;
}

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
  progress: TTSProgress | null;
  error: string | null;
  submitJob: (
    text: string,
    voice: string,
    speed: number,
  ) => Promise<TTSJobResult | null>;
  cancelJob: () => void;
}

export default function useTTSJob(): UseTTSJobReturn {
  const [status, setStatus] = useState<TTSJobStatus>("idle");
  const [progress, setProgress] = useState<TTSProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Keep a stable ref to status for the onerror callback
  const statusRef = useRef<TTSJobStatus>("idle");
  statusRef.current = status;

  const cancelJob = useCallback(() => {
    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Abort any in-flight fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    statusRef.current = "idle";
    setProgress(null);
    setError(null);
  }, []);

  const submitJob = useCallback(
    async (
      text: string,
      voice: string,
      speed: number,
    ): Promise<TTSJobResult | null> => {
      // Cancel any existing job
      cancelJob();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setStatus("queued");
        statusRef.current = "queued";
        setError(null);

        // Submit TTS request
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

        // Check if sync response (has audio_base64 directly)
        if (data.audio_base64) {
          setStatus("complete");
          statusRef.current = "complete";
          return data as TTSJobResult;
        }

        // Async response — open SSE for progress
        const taskId: string = data.task_id;
        setStatus("processing");
        statusRef.current = "processing";

        return new Promise<TTSJobResult>((resolve, reject) => {
          const es = apiEventSource(`/api/tts/stream/${taskId}`);
          eventSourceRef.current = es;

          es.onmessage = async (event) => {
            try {
              const progressData = JSON.parse(event.data);

              if (
                progressData.status === "processing" ||
                progressData.status === "chunk_done"
              ) {
                setProgress({
                  chunk: progressData.chunk,
                  total: progressData.total,
                });
              } else if (progressData.status === "complete") {
                es.close();
                eventSourceRef.current = null;

                // Fetch the final result
                const resultRes = await fetch(apiUrl(`/api/tts/${taskId}`), {
                  signal: abortController.signal,
                });
                const resultData = await resultRes.json();

                if (!resultRes.ok) {
                  throw new Error(
                    resultData.detail || "Failed to fetch result",
                  );
                }

                setStatus("complete");
                statusRef.current = "complete";
                setProgress(null);
                resolve(resultData as TTSJobResult);
              } else if (progressData.status === "error") {
                es.close();
                eventSourceRef.current = null;
                throw new Error(
                  progressData.error || "Generation failed",
                );
              }
            } catch (err) {
              es.close();
              eventSourceRef.current = null;
              setStatus("error");
              statusRef.current = "error";
              setError(
                err instanceof Error ? err.message : "Unknown error",
              );
              reject(err);
            }
          };

          es.onerror = () => {
            es.close();
            eventSourceRef.current = null;
            // Don't reject on transient SSE errors — EventSource auto-reconnects
            // Only set error if we're still processing
            if (statusRef.current === "processing") {
              setStatus("error");
              statusRef.current = "error";
              setError("Connection lost. Please try again.");
              reject(new Error("SSE connection lost"));
            }
          };
        });
      } catch (err) {
        if (abortController.signal.aborted) return null;
        setStatus("error");
        statusRef.current = "error";
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate speech.",
        );
        return null;
      }
    },
    [cancelJob],
  );

  return { status, progress, error, submitJob, cancelJob };
}