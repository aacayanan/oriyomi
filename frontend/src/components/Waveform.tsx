"use client";

import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

interface WaveformProps {
  audioBase64: string | null;
  sentences: Sentence[];
  activeSentenceIndex: number | null;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

/** Format seconds as M:SS (e.g. 1:23, 10:45). */
function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Wave colors matched to the app's Tailwind zinc light/dark palette. */
function getWaveColors(dark: boolean) {
  return dark
    ? { waveColor: "#3f3f46", progressColor: "#60a5fa", cursorColor: "#fafafa" }
    : { waveColor: "#d4d4d8", progressColor: "#3b82f6", cursorColor: "#171717" };
}

export default function Waveform({
  audioBase64,
  sentences,
  activeSentenceIndex,
  onSeek,
  isPlaying,
  currentTime,
  duration,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const readyRef = useRef(false);
  const onSeekRef = useRef(onSeek);
  const applyHighlightRef = useRef<(() => void) | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Always call the latest onSeek without re-initializing wavesurfer
  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  // The app themes via Tailwind `dark:` + prefers-color-scheme; track that here
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Recolor the waveform when the system theme changes
  useEffect(() => {
    if (!wsRef.current) return;
    wsRef.current.setOptions(getWaveColors(isDark));
  }, [isDark]);

  // Create (and tear down) wavesurfer whenever the audio changes.
  // wavesurfer.js touches browser APIs, so it is imported dynamically
  // inside this client-only effect — never during SSR.
  useEffect(() => {
    if (!audioBase64) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let ws: WaveSurfer | null = null;

    // wavesurfer loads audio from a URL; give it a Blob URL decoded from
    // the base64 MP3. The real player keeps using the base64 data itself —
    // wavesurfer here is only a visual overlay.
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blobUrl = URL.createObjectURL(
      new Blob([bytes], { type: "audio/mpeg" }),
    );

    (async () => {
      const [{ default: WaveSurferCtor }, { default: RegionsPluginCtor }] =
        await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/regions.esm.js"),
        ]);
      if (cancelled) return;

      const regions = RegionsPluginCtor.create();
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      ws = WaveSurferCtor.create({
        container,
        url: blobUrl,
        height: 96,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        cursorWidth: 2,
        dragToSeek: false, // click-to-seek only (see interaction handler)
        ...getWaveColors(dark),
        plugins: [regions],
      });
      wsRef.current = ws;
      regionsRef.current = regions;

      // Click-to-seek: wavesurfer reports the clicked time; the parent
      // decides how to move the real (Web Audio) playback engine
      ws.on("interaction", (newTime: number) => {
        onSeekRef.current(newTime);
      });

      ws.on("ready", () => {
        readyRef.current = true;
        applyHighlightRef.current?.();
      });
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      wsRef.current = null;
      regionsRef.current = null;
      ws?.destroy();
      ws = null;
      URL.revokeObjectURL(blobUrl);
    };
  }, [audioBase64]);

  // Highlight the active sentence's time range with a region
  useEffect(() => {
    const applyHighlight = () => {
      const ws = wsRef.current;
      const regions = regionsRef.current;
      if (!ws || !regions || !readyRef.current) return;

      regions.clearRegions();
      if (activeSentenceIndex === null) return;
      const sentence = sentences[activeSentenceIndex];
      if (!sentence) return;

      const region = regions.addRegion({
        start: sentence.start_ms / 1000,
        end: sentence.end_ms / 1000,
        // Yellow to match TextViewer's active-sentence highlight
        color: isDark
          ? isPlaying
            ? "rgba(250, 204, 21, 0.32)"
            : "rgba(250, 204, 21, 0.22)"
          : isPlaying
            ? "rgba(250, 204, 21, 0.4)"
            : "rgba(250, 204, 21, 0.28)",
        drag: false,
        resize: false,
      });
      // Let clicks pass through the region to the waveform (seek), not the region
      if (region.element) {
        region.element.style.pointerEvents = "none";
      }
    };

    applyHighlightRef.current = applyHighlight;
    applyHighlight();
  }, [activeSentenceIndex, sentences, isPlaying, isDark]);

  // Mirror the external playback clock onto wavesurfer's progress cursor
  // (audio actually plays through useAudioPlayer, not wavesurfer)
  useEffect(() => {
    if (!readyRef.current) return;
    wsRef.current?.setTime(currentTime);
  }, [currentTime]);

  const displayTime = Math.min(currentTime, duration > 0 ? duration : Infinity);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Time display: elapsed / total */}
      <div className="mb-2 flex items-center justify-between text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      {audioBase64 ? (
        <div ref={containerRef} className="w-full" aria-label="Audio waveform" />
      ) : (
        <div className="flex h-24 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
          The waveform will appear here after generating speech
        </div>
      )}
    </div>
  );
}
