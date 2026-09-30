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
        className="w-full min-h-[180px] rounded-lg border border-zinc-300 bg-white p-4 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-800"
        placeholder="Paste your text here..."
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        {text.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
