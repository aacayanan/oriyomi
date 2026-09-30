"use client";

import { useRef, useEffect, useState } from "react";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

interface TextViewerProps {
  sentences: Sentence[];
  activeSentenceIndex: number | null;
  text: string;
}

const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 40;
const DEFAULT_FONT_SIZE = 20;

export default function TextViewer({
  sentences,
  activeSentenceIndex,
  text,
}: TextViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

  // Auto-scroll to active sentence
  useEffect(() => {
    if (activeSentenceIndex !== null && activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSentenceIndex]);

  const decreaseFontSize = () =>
    setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 2));
  const increaseFontSize = () =>
    setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 2));

  const isEmpty = !text && sentences.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* Viewer header with size controls */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Text display
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={decreaseFontSize}
            disabled={fontSize <= MIN_FONT_SIZE}
            aria-label="Decrease font size"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            A&minus;
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {fontSize}px
          </span>
          <button
            type="button"
            onClick={increaseFontSize}
            disabled={fontSize >= MAX_FONT_SIZE}
            aria-label="Increase font size"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            A+
          </button>
        </div>
      </div>

      {/* Main text viewer */}
      <div
        className="flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        style={{ fontSize }}
      >
        {isEmpty ? (
          <p className="italic text-zinc-400">
            Paste some text on the left to get started.
          </p>
        ) : sentences.length === 0 ? (
          <div className="leading-relaxed">
            {text.split("\n").map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="leading-relaxed">
            {sentences.map((sentence, i) => {
              const isActive = i === activeSentenceIndex;
              return (
                <span
                  key={i}
                  ref={isActive ? activeRef : null}
                  className={`rounded-sm px-0.5 transition-colors duration-200 ${
                    isActive
                      ? "bg-yellow-200 dark:bg-yellow-800"
                      : ""
                  }`}
                >
                  {sentence.text}
                </span>
              );
            })}
          </p>
        )}
      </div>
    </div>
  );
}
