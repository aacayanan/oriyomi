"use client";

import { useState } from "react";

export interface Section {
  title: string;
  level: number; // 1=chapter, 2=section, 3=subsection
  section_type: string; // "chapter", "section", "part", etc.
  number: string | null;
  char_start: number;
  char_end: number;
  text: string;
  text_preview: string;
  children: Section[];
}

interface ChapterSelectorProps {
  sections: Section[];
  selectedSection: Section | null;
  onSelect: (section: Section | null) => void; // null = "Generate All"
  disabled?: boolean;
  docType: string; // "flat", "chapters", "sections", "hierarchical"
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Chapter",
  2: "Section",
  3: "Subsection",
};

function estimateDuration(chars: number): string {
  const seconds = Math.round(chars / 15);
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

export default function ChapterSelector({
  sections,
  selectedSection,
  onSelect,
  disabled = false,
  docType,
}: ChapterSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (sections.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Structure ({sections.length} {sections.length === 1 ? "section" : "sections"} detected)
        </h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          disabled={disabled}
        >
          {isExpanded ? "Hide" : "Show"}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 flex flex-col gap-1">
          {/* Generate All */}
          <button
            onClick={() => onSelect(null)}
            disabled={disabled}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedSection === null
                ? "border-blue-500 bg-blue-50 font-medium text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Generate All</span>
              <span className="text-xs text-zinc-400">
                {docType === "flat" ? "no structure" : docType}
              </span>
            </div>
          </button>

          {/* Section list */}
          {sections.map((section, i) => {
            const isSelected = selectedSection?.title === section.title && selectedSection?.char_start === section.char_start;
            const chars = section.char_end - section.char_start;
            return (
              <button
                key={`${section.char_start}-${i}`}
                onClick={() => onSelect(section)}
                disabled={disabled}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 font-medium text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                }`}
                style={{ paddingLeft: `${section.level * 16}px` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate ${
                      section.level === 1
                        ? "font-medium"
                        : section.level === 3
                          ? "italic"
                          : ""
                    }`}
                  >
                    {section.title}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {chars} chars · {estimateDuration(chars)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
