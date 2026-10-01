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
  onSentenceClick?: (index: number) => void;
  currentSectionTitle?: string | null;
}

const MIN_SCALE = 0.7;
const MAX_SCALE = 1.6;
const SCALE_STEP = 0.1;

export default function TextViewer({
  sentences,
  activeSentenceIndex,
  text,
  onSentenceClick,
  currentSectionTitle,
}: TextViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  // Auto-scroll to active sentence
  useEffect(() => {
    if (activeSentenceIndex !== null && activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSentenceIndex]);

  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(1)));
  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(1)));

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Scale controls */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-2 py-1 dark:border-zinc-700">
        {currentSectionTitle && (
          <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {currentSectionTitle}
          </span>
        )}
        <div className={`flex items-center gap-1 ${currentSectionTitle ? "ml-auto" : "ml-auto"}`}>
        <button
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-sm leading-none text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Zoom out"
        >
          −
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-sm leading-none text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Zoom in"
        >
          +
        </button>
        </div>
      </div>

      {/* Scrollable text area — font size follows the scale control */}
      <div
        className="max-h-[300px] overflow-y-auto p-4 text-base leading-relaxed text-zinc-800 dark:text-zinc-200"
        style={{ fontSize: `${scale}rem` }}
      >
        {/* Fallback: render raw text as paragraphs */}
        {sentences.length === 0 ? (
          text ? (
            text.split("\n").map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="italic text-zinc-400">
              Your text will appear here after generating speech...
            </p>
          )
        ) : (
          /* Render sentences with highlighting */
          <p>
            {sentences.map((sentence, i) => {
              const isActive = i === activeSentenceIndex;
              return (
                <span
                  key={i}
                  ref={isActive ? activeRef : null}
                  onClick={() => onSentenceClick?.(i)}
                  className={`rounded px-1 transition-colors duration-200 ${
                    isActive
                      ? "bg-yellow-200 dark:bg-yellow-800"
                      : "cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700"
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
