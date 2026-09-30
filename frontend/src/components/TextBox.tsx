"use client";

interface TextBoxProps {
  text: string;
  onChange: (text: string) => void;
  onClear: () => void;
}

export default function TextBox({ text, onChange, onClear }: TextBoxProps) {
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Paste your text
      </label>
      <textarea
        className="w-full min-h-[80px] resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-800"
        placeholder="Paste your text here (read-only)..."
        value={text}
        onChange={(e) => onChange(e.target.value)}
        readOnly
        title="Text is read-only. Paste with Cmd+V / Ctrl+V, then press 'Read aloud' to listen."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={!text}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-red-900/30 dark:hover:text-red-400 dark:hover:border-red-800"
        >
          Clear text
        </button>
      </div>
    </div>
  );
}
