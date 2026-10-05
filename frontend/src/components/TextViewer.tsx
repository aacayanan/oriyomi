"use client";

import { Fragment, useRef, useEffect, useState } from "react";
import { ZoomInIcon, ZoomOutIcon } from "./Icons";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export type FoldViewStatus = "ready" | "pending" | "error";

export interface ViewerFold {
  index: number;
  title: string | null;
  /** Sentence-split text once that fold's TTS lands; null while pending. */
  sentences: Sentence[] | null;
  /** Plain text fallback (whole fold) shown until sentences arrive. */
  text: string;
  status: FoldViewStatus;
}

interface TextViewerProps {
  folds: ViewerFold[];
  /** Global sentence index across all folds (offset by fold position). */
  activeSentenceIndex: number | null;
  onSentenceClick?: (globalIndex: number) => void;
  currentSectionTitle?: string | null;
  completedFolds?: number;
  totalFolds?: number;
  /** Fold currently playing — divider for it lights up. */
  activeFoldIndex?: number | null;
  /** When this number changes, scroll that sentence into view (fold jump). */
  jumpToSentenceIndex?: number | null;
}

const MIN_SCALE = 0.75;
const MAX_SCALE = 1.7;
const SCALE_STEP = 0.1;

export default function TextViewer({
  folds,
  activeSentenceIndex,
  onSentenceClick,
  currentSectionTitle,
  completedFolds = 0,
  totalFolds = 0,
  activeFoldIndex = null,
  jumpToSentenceIndex = null,
}: TextViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [scale, setScale] = useState(1);
  const [jumpIndex, setJumpIndex] = useState<number | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Running global index per fold — sentences are addressed across the doc
  const foldOffsets = folds.map((fold, fi) => {
    let offset = 0;
    for (let k = 0; k < fi; k += 1) {
      offset += folds[k].sentences?.length ?? 0;
    }
    return offset;
  });
  const totalSentences = folds.reduce(
    (sum, fold) => sum + (fold.sentences?.length ?? 0),
    0,
  );

  useEffect(() => {
    if (activeSentenceIndex !== null && activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSentenceIndex]);

  // Jump-scroll: when jumpToSentenceIndex changes, scroll that sentence into view
  useEffect(() => {
    if (
      jumpToSentenceIndex === null ||
      jumpToSentenceIndex === undefined ||
      !Number.isFinite(jumpToSentenceIndex) ||
      jumpToSentenceIndex < 0 ||
      jumpToSentenceIndex >= totalSentences
    ) {
      return;
    }
    const el = sentenceRefs.current[jumpToSentenceIndex];
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({
        top:
          el.offsetTop -
          container.clientHeight / 2 +
          el.clientHeight / 2,
        behavior: "smooth",
      });
    }
    setJumpIndex(jumpToSentenceIndex);
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(() => setJumpIndex(null), 1200);
    return () => {
      if (jumpTimer.current) clearTimeout(jumpTimer.current);
    };
  }, [jumpToSentenceIndex, totalSentences]);

  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(1)));
  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(1)));

  return (
    <div className="flex h-full min-h-0 flex-col border border-hairline bg-fold">
      {/* sheet header: section title + zoom */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {totalFolds > 0 && (
            <span className="label-ui shrink-0 text-[11px] text-ink-fade">
              Fold {String(Math.min(completedFolds + 1, totalFolds)).padStart(2, "0")}
            </span>
          )}
          {currentSectionTitle && (
            <span className="truncate font-display text-lg text-sumi">
              {currentSectionTitle}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            className="outline-btn h-8 w-8 rounded-none"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOutIcon className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-data text-xs tabular-nums text-ink-fade">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            className="outline-btn h-8 w-8 rounded-none"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomInIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* document body — zoom scales this font-size; children use em */}
      <div
        ref={scrollRef}
        className="sheet-scroll min-h-0 flex-1 overflow-y-auto px-[var(--sheet-pad)] py-8 sm:px-10 sm:py-10"
        style={{ fontSize: `${(scale * 1.05).toFixed(3)}rem` }}
      >
        {folds.length === 0 ? (
          <EmptySheet />
        ) : (
          <div className="mx-auto flex max-w-[48rem] flex-col gap-4">
            {folds.map((fold, fi) => (
              <Fragment key={`${fold.index}-${fi}`}>
                {fi > 0 && (
                  <FoldDivider
                    number={String(fold.index + 1).padStart(2, "0")}
                    title={fold.title}
                    status={fold.status}
                    active={fold.index === activeFoldIndex}
                  />
                )}
                {fold.sentences ? (
                  fold.sentences.map((sentence, i) => {
                    const g = foldOffsets[fi] + i;
                    const isActive = g === activeSentenceIndex;
                    const isDone =
                      activeSentenceIndex !== null && g < activeSentenceIndex;
                    const isJumping = g === jumpIndex;
                    return (
                      <p
                        key={g}
                        className="flex items-start gap-3 font-body text-sumi"
                        style={{ lineHeight: 1.45 }}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-[0.55em] flex shrink-0 items-center justify-center ${
                            isActive
                              ? "h-[0.7em] w-[0.7em] rounded-full bg-gold"
                              : isDone
                                ? // Folded mark — a short crease bar, not a check badge
                                  "mt-[0.72em] h-[2px] w-[0.95em] bg-ink-mute/80"
                                : "h-[0.7em] w-[0.7em]"
                          }`}
                        />
                        <span
                          ref={(el) => {
                            sentenceRefs.current[g] = el;
                            if (isActive) activeRef.current = el;
                          }}
                          onClick={() => onSentenceClick?.(g)}
                          className={`cursor-pointer transition-colors duration-200 ${
                            isActive
                              ? "crease-active"
                              : isDone
                                ? "text-ink-mute"
                                : "hover:text-vermilion-ink"
                          } ${isJumping ? "outline outline-[1px] outline-offset-[3px] outline-vermilion/60" : ""}`}
                          role={onSentenceClick ? "button" : undefined}
                          tabIndex={onSentenceClick ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (!onSentenceClick) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSentenceClick(g);
                            }
                          }}
                        >
                          {isActive ? <u>{sentence.text}</u> : sentence.text}
                        </span>
                      </p>
                    );
                  })
                ) : (
                  <div className="flex flex-col gap-4 pt-2">
                    {fold.text
                      .split(/\n+/)
                      .filter((paragraph) => paragraph.trim().length > 0)
                      .map((paragraph, i) => (
                        <p
                          key={i}
                          className="font-body text-sumi"
                          style={{ lineHeight: 1.45 }}
                        >
                          {paragraph}
                        </p>
                      ))}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Paper-perforation break between folds: dashed crease line with a diamond
 * at the fold, fold number + title on the left, generation state on the right.
 */
function FoldDivider({
  number,
  title,
  status,
  active,
}: {
  number: string;
  title: string | null;
  status: FoldViewStatus;
  active: boolean;
}) {
  const dashColor = active
    ? "color-mix(in srgb, var(--color-gold) 55%, var(--color-hairline-deep))"
    : "var(--color-hairline-deep)";
  const dashStyle = {
    backgroundImage: `repeating-linear-gradient(to right, ${dashColor} 0 7px, transparent 7px 14px)`,
  };

  return (
    <div
      className="flex items-center gap-3 py-7"
      role="separator"
      aria-label={`Fold ${number}${title ? `: ${title}` : ""}`}
    >
      <span
        className={`label-ui shrink-0 text-[0.595em] ${active ? "text-vermilion" : "text-ink-fade"}`}
      >
        Fold {number}
      </span>
      {title && (
        <span className="max-w-[40%] truncate font-display text-[0.833em] text-sumi-soft">
          {title}
        </span>
      )}
      <span aria-hidden="true" className="relative flex min-w-0 flex-1 items-center">
        <span className="h-px flex-1" style={dashStyle} />
        <span
          className={`mx-2 h-1.5 w-1.5 shrink-0 rotate-45 border ${
            active ? "border-gold bg-gold/40" : "border-ink-mute/70"
          }`}
        />
        <span className="h-px flex-1" style={dashStyle} />
      </span>
      {status === "pending" && (
        <span className="label-ui shrink-0 text-[0.536em] text-ink-mute">
          folding…
        </span>
      )}
      {status === "error" && (
        <span className="label-ui shrink-0 text-[0.536em] text-vermilion">
          failed
        </span>
      )}
    </div>
  );
}

function EmptySheet() {
  return (
    <div className="mx-auto flex h-full min-h-[22rem] max-w-[36rem] flex-col items-start justify-center gap-4 px-2">
      <p className="font-display leading-tight text-sumi text-[1.786em] sm:text-[2.143em]">
        Fold a document into speech.
      </p>
      <p className="max-w-[34ch] font-body leading-relaxed text-ink-fade text-[0.952em]">
        Paste text or drop a file in the source panel. Play reads it aloud
        sentence by sentence — the active crease lights gold as it goes.
      </p>
      <p className="label-ui text-ink-mute text-[0.655em]">
        .txt · .md · .pdf · .docx
      </p>
    </div>
  );
}
