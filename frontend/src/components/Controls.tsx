"use client";

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
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  voices: Voice[];
}

export default function Controls({
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  onPlay,
  onPause,
  onStop,
  isPlaying,
  isPaused,
  isLoading,
  voices,
}: ControlsProps) {
  const showPlay = !isPlaying;
  const showPause = isPlaying;

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
            disabled={isPlaying}
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
              title={isPaused ? "Resume" : "Play"}
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

      {/* Loading indicator */}
      {isLoading && (
        <p className="text-sm text-blue-500">Generating speech...</p>
      )}
    </div>
  );
}
