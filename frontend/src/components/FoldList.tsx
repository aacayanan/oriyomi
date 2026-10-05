import type { ReactElement } from "react";
import type { Section } from "./ChapterSelector";
import FoldCreaseArt from "./FoldCreaseArt";
import "./folds.css";

interface FoldListProps {
  sections: Section[];
  activeFoldIndex: number; // -1 when none
  onSelectFold: (index: number, section: Section | null) => void;
  disabled?: boolean;
}

function estimateDuration(chars: number): string {
  const seconds = Math.round(chars / 15);
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

/**
 * Fold cards. This component is the scroll region — the side rail itself
 * does not scroll. Fill a `min-h-0 flex-1` parent for a responsive height.
 */
export default function FoldList({
  sections,
  activeFoldIndex,
  onSelectFold,
  disabled = false,
}: FoldListProps): ReactElement | null {
  if (sections.length === 0) return null;

  const showHeader = sections.length > 1;

  return (
    <div className="fold-list flex h-full min-h-0 flex-col">
      {showHeader && (
        <div className="flex shrink-0 items-center justify-between px-1 pb-1.5">
          <span className="label-ui label-lg text-sumi-soft">
            Folds&nbsp;·&nbsp;{sections.length}
          </span>
        </div>
      )}

      <div className="fold-list__scroll flex min-h-0 flex-col">
        {sections.map((section, i) => {
          const isActive = i === activeFoldIndex;
          const chars = section.char_end - section.char_start;

          return (
            <button
              key={`${section.char_start}-${i}`}
              type="button"
              onClick={() => onSelectFold(i, section)}
              disabled={disabled}
              className={`fold-row flex w-full shrink-0 items-center gap-2.5 border-b border-hairline px-2 py-2 text-left transition-colors
                disabled:cursor-not-allowed disabled:opacity-40
                ${
                  isActive
                    ? "fold-row--active bg-fold text-sumi"
                    : "bg-transparent text-sumi hover:bg-washi-deep"
                }`}
              aria-current={isActive ? "true" : undefined}
            >
              <FoldCreaseArt
                index={i}
                active={isActive}
                className="h-9 w-9 shrink-0 border border-hairline-deep"
              />

              <span
                className={`w-5 shrink-0 font-data label-lg tabular-nums ${
                  isActive ? "font-semibold text-gold" : "text-ink-fade"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span
                  className={`truncate font-ui text-xs ${
                    section.level === 1
                      ? "font-semibold"
                      : section.level === 3
                        ? "italic"
                        : ""
                  }`}
                >
                  {section.title}
                </span>
                <span className="shrink-0 font-data label-lg tabular-nums text-ink-fade">
                  {estimateDuration(chars)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
