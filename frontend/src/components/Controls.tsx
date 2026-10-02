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
  voices: Voice[];
  /** Locks the voice select only — speed stays live during playback */
  voiceDisabled?: boolean;
}

/** VOICE + SPEED rail rows — outline chrome from the approved comp. */
export default function Controls({
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  voices,
  voiceDisabled = false,
}: ControlsProps) {
  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-3 border-t border-hairline py-3">
        <span className="label-ui w-[4.5rem] shrink-0 text-[11px] text-sumi-soft">
          Voice
        </span>
        <span className="relative min-w-0 flex-1">
          <select
            className="w-full appearance-none border border-transparent bg-transparent py-0.5 pr-6 font-ui text-sm font-semibold text-sumi hover:border-hairline focus-visible:border-vermilion"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            disabled={voiceDisabled || voices.length === 0}
          >
            {voices.length === 0 ? (
              <option value={voice}>Emma</option>
            ) : (
              voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_name}
                </option>
              ))
            )}
          </select>
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-ink-fade">
            ▾
          </span>
        </span>
      </label>

      <label className="flex items-center gap-3 border-t border-hairline py-3">
        <span className="label-ui w-[4.5rem] shrink-0 text-[11px] text-sumi-soft">
          Speed
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-hairline-deep accent-vermilion"
            aria-label="Playback speed"
          />
          <span className="w-12 shrink-0 text-right font-data text-sm tabular-nums text-sumi">
            {speed.toFixed(1)}x
          </span>
        </span>
      </label>
    </div>
  );
}
