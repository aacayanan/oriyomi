"use client";

import { useRef, useEffect } from "react";

interface Sentence {
  index: number;
  text: string;
  start_time: number;
  end_time: number;
}

interface TextViewerProps {
  sentences: Sentence[];
  activeSentenceIndex: number | null;
  text: string;
}

export default function TextViewer({
  sentences,
  activeSentenceIndex,
  text,
}: TextViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to active sentence
  useEffect(() => {
    if (activeSentenceIndex !== null && activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSentenceIndex]);

  // Fallback: render raw text as paragraphs
  if (sentences.length === 0) {
    return (
      <div className="max-h-[300px] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-base leading-relaxed text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
        {text ? (
          text.split("\n").map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))
        ) : (
          <p className="italic text-zinc-400">
            Your text will appear here after generating speech...
          </p>
        )}
      </div>
    );
  }

  // Render sentences with highlighting
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-base leading-relaxed text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      <p>
        {sentences.map((sentence, i) => {
          const isActive = i === activeSentenceIndex;
          return (
            <span
              key={i}
              ref={isActive ? activeRef : null}
              className={`rounded px-1 transition-colors duration-200 ${
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
    </div>
  );
}
