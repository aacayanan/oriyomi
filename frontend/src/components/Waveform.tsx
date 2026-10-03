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

/** Format seconds as M:SS. */
function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getWaveColors() {
  return {
    waveColor: "#C9BEB0",
    progressColor: "#C34838",
    cursorColor: "#1A1513",
  };
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

  /** Hover seek preview: x position (px) within the waveform + target time. */
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  useEffect(() => {
    if (!audioBase64) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let ws: WaveSurfer | null = null;

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

      ws = WaveSurferCtor.create({
        container,
        url: blobUrl,
        height: 48,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        cursorWidth: 1.5,
        dragToSeek: false,
        ...getWaveColors(),
        plugins: [regions],
      });
      wsRef.current = ws;
      regionsRef.current = regions;

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
        color: isPlaying
          ? "rgba(201, 162, 39, 0.45)"
          : "rgba(201, 162, 39, 0.28)",
        drag: false,
        resize: false,
      });
      if (region.element) {
        region.element.style.pointerEvents = "none";
      }
    };

    applyHighlightRef.current = applyHighlight;
    applyHighlight();
  }, [activeSentenceIndex, sentences, isPlaying]);

  useEffect(() => {
    if (!readyRef.current) return;
    wsRef.current?.setTime(currentTime);
  }, [currentTime]);

  const handleWaveMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const ratio = rect.width > 0 ? x / rect.width : 0;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    setHover({ x, time: ratio * safeDuration });
  };

  const clearHover = () => setHover(null);

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      {audioBase64 ? (
        <>
          <div className="flex items-center justify-between font-data text-[11px] tabular-nums text-ink-fade">
            <span>{formatTime(Math.min(currentTime, duration > 0 ? duration : Infinity))}</span>
            {/* Hover target time — shows where a click would seek */}
            <span className={hover ? "text-sumi" : undefined}>
              {hover ? formatTime(hover.time) : formatTime(duration)}
            </span>
          </div>
          <div
            className="relative w-full"
            onMouseMove={handleWaveMove}
            onMouseLeave={clearHover}
          >
            <div ref={containerRef} className="w-full" aria-label="Audio waveform" />
            {/* Seek-preview bar: vertical line where click would play from */}
            {hover && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-px -translate-x-1/2 bg-sumi/80"
                style={{ left: hover.x }}
              >
                <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sumi" />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-12 items-center justify-center border border-dashed border-hairline font-ui text-[10px] tracking-[0.12em] text-ink-mute uppercase">
          Waveform after play
        </div>
      )}
    </div>
  );
}
