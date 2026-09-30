"use client";

import { useRef, useState } from "react";

interface Voice {
  id: string;
  name: string;
  locale: string;
  display_name: string;
}

interface ControlsProps {
  voice: string;
  onVoiceChange: (voice: string) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  voices: Voice[];
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

export default function Controls({
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  onPlay,
  onPause,
  onStop,
  onSeek,
  isPlaying,
  isPaused,
  isLoading,
  voices,
  currentTime,
  duration,
}: ControlsProps) {
  const showPlay = !isPlaying;
  const showPause = isPlaying;

  // Progress-bar scrubbing state. Refs hold the values the event handlers
  // read (always current); state drives the displayed value.
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const scrubTimeRef = useRef(0);
  const isScrubbingRef = useRef(false);

  const maxTime = duration > 0 ? duration : 1;
  const displayTime = Math.min(isScrubbing ? scrubTime : currentTime, maxTime);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {/* Voice dropdown */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Voice
          </label>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            disabled={isPlaying}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Speed slider */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Speed: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="w-40 accent-blue-500"
          />
        </div>

        {/* Playback buttons */}
        <div className="flex gap-2">
          {showPlay && (
            <button
              onClick={onPlay}
              disabled={isLoading}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Play"
            >
              ▶
            </button>
          )}
          {showPause && (
            <button
              onClick={onPause}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500 text-white transition-colors hover:bg-yellow-600"
              title="Pause"
            >
              ⏸
            </button>
          )}
          {(isPlaying || isPaused) && (
            <button
              onClick={onStop}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
              title="Stop"
            >
              ⏹
            </button>
          )}
        </div>
      </div>

      {/* Progress bar with time display */}
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(displayTime)}
        </span>
        <input
          type="range"
          min={0}
          max={maxTime}
          step={0.1}
          value={displayTime}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            scrubTimeRef.current = v;
            isScrubbingRef.current = true;
            setScrubTime(v);
            setIsScrubbing(true);
          }}
          onPointerUp={() => {
            if (isScrubbingRef.current) {
              onSeek(scrubTimeRef.current);
              isScrubbingRef.current = false;
              setIsScrubbing(false);
            }
          }}
          onPointerCancel={() => {
            isScrubbingRef.current = false;
            setIsScrubbing(false);
          }}
          onKeyUp={() => {
            if (isScrubbingRef.current) {
              onSeek(scrubTimeRef.current);
              isScrubbingRef.current = false;
              setIsScrubbing(false);
            }
          }}
          disabled={duration <= 0}
          aria-label="Seek"
          className="h-2 flex-1 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="w-12 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(duration)}
        </span>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <p className="text-sm text-blue-500">Generating speech...</p>
      )}
    </div>
  );
}
