"use client";

import { useState } from "react";
import { ChevronIcon } from "./Icons";

export interface Section {
  title: string;
  level: number; // 1=chapter, 2=section, 3=subsection
  section_type: string;
  number: string | null;
  char_start: number;
  char_end: number;
  text: string;
  text_preview: string;
  /** Extractive 2-3 sentence summary from the backend (sumy). */
  summary?: string | null;
  children: Section[];
}

interface ChapterSelectorProps {
  sections: Section[];
  selectedSection: Section | null;
  onSelect: (section: Section | null) => void; // null = full document
  disabled?: boolean;
  docType: string;
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
    <div className="border-t border-hairline pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label-ui text-[11px] text-sumi-soft">
          Folds · {sections.length}
        </h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="outline-btn h-7 px-2 text-[10px]"
          disabled={disabled}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Hide" : "Show"}
          <ChevronIcon
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={disabled}
            className={`w-full border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedSection === null
                ? "border-vermilion bg-fold font-semibold text-vermilion-ink"
                : "border-hairline bg-transparent text-sumi hover:bg-fold"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-ui text-xs">Whole document</span>
              <span className="font-data text-[10px] text-ink-fade">
                {docType === "flat" ? "flat" : docType}
              </span>
            </div>
          </button>

          {sections.map((section, i) => {
            const isSelected =
              selectedSection?.title === section.title &&
              selectedSection?.char_start === section.char_start;
            const chars = section.char_end - section.char_start;
            return (
              <button
                key={`${section.char_start}-${i}`}
                type="button"
                onClick={() => onSelect(section)}
                disabled={disabled}
                className={`w-full border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "border-vermilion bg-fold font-semibold text-vermilion-ink"
                    : "border-hairline bg-transparent text-sumi hover:bg-fold"
                }`}
                style={{ paddingLeft: `${0.75 + section.level * 0.65}rem` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate font-ui text-xs ${
                      section.level === 1
                        ? "font-semibold"
                        : section.level === 3
                          ? "italic"
                          : ""
                    }`}
                  >
                    <span className="mr-1.5 font-data text-[10px] tabular-nums text-ink-fade">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </span>
                  <span className="shrink-0 font-data text-[10px] tabular-nums text-ink-fade">
                    {estimateDuration(chars)}
                  </span>
                </div>
                <span className="sr-only">{LEVEL_LABELS[section.level]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
