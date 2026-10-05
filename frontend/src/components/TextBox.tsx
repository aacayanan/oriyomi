"use client";

interface TextBoxProps {
  text: string;
  onChange: (text: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function TextBox({ text, onChange, onClear, disabled }: TextBoxProps) {
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-[9rem] w-full resize-y border border-hairline bg-fold p-3 font-body text-sm leading-relaxed text-sumi placeholder:text-ink-mute focus-visible:border-vermilion"
        placeholder="Paste a chapter…"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-data label-lg tabular-nums text-ink-fade">
          {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
        </span>
        {text.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="label-ui label-lg text-ink-fade transition-colors hover:text-vermilion"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
