"use client";

import { useRef, useEffect, useState } from "react";
import { ZoomInIcon, ZoomOutIcon, CheckIcon } from "./Icons";

interface Sentence {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

interface SectionLike {
  title: string;
  char_start: number;
}

interface TextViewerProps {
  sentences: Sentence[];
  activeSentenceIndex: number | null;
  text: string;
  onSentenceClick?: (index: number) => void;
  currentSectionTitle?: string | null;
  completedFolds?: number;
  totalFolds?: number;
  /** When this number changes, scroll that sentence into view (fold jump). */
  jumpToSentenceIndex?: number | null;
}

const MIN_SCALE = 0.75;
const MAX_SCALE = 1.7;
const SCALE_STEP = 0.1;

export default function TextViewer({
  sentences,
  activeSentenceIndex,
  text,
  onSentenceClick,
  currentSectionTitle,
  completedFolds = 0,
  totalFolds = 0,
  jumpToSentenceIndex = null,
}: TextViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [scale, setScale] = useState(1);
  const [jumpIndex, setJumpIndex] = useState<number | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      jumpToSentenceIndex >= sentences.length
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
  }, [jumpToSentenceIndex, sentences.length]);

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
        {sentences.length === 0 ? (
          text ? (
            <div className="mx-auto flex max-w-[48rem] flex-col gap-5">
              {text.split(/\n+/).map((paragraph, i) => (
                <p
                  key={i}
                  className="font-body text-sumi"
                  style={{ lineHeight: 1.45 }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <EmptySheet />
          )
        ) : (
          <div className="mx-auto flex max-w-[48rem] flex-col gap-4">
            {sentences.map((sentence, i) => {
              const isActive = i === activeSentenceIndex;
              const isDone =
                activeSentenceIndex !== null && i < activeSentenceIndex;
              const isJumping = i === jumpIndex;
              return (
                <p
                  key={i}
                  className="flex items-start gap-3 font-body text-sumi"
                  style={{ lineHeight: 1.45 }}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[0.55em] flex h-[0.7em] w-[0.7em] shrink-0 items-center justify-center rounded-full ${
                      isActive
                        ? "bg-gold"
                        : isDone
                          ? "bg-vermilion/70"
                          : "bg-transparent"
                    }`}
                  >
                    {isDone && !isActive && (
                      <CheckIcon className="h-[0.55em] w-[0.55em] text-fold" />
                    )}
                  </span>
                  <span
                    ref={(el) => {
                      sentenceRefs.current[i] = el;
                      if (isActive) activeRef.current = el;
                    }}
                    onClick={() => onSentenceClick?.(i)}
                    className={`cursor-pointer transition-colors duration-200 ${
                      isActive
                        ? "crease-active"
                        : isDone
                          ? "text-sumi-soft"
                          : "hover:text-vermilion-ink"
                    } ${isJumping ? "outline outline-[1px] outline-offset-[3px] outline-vermilion/60" : ""}`}
                    role={onSentenceClick ? "button" : undefined}
                    tabIndex={onSentenceClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!onSentenceClick) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSentenceClick(i);
                      }
                    }}
                  >
                    {isActive ? <u>{sentence.text}</u> : sentence.text}
                  </span>
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptySheet() {
  return (
    <div className="mx-auto flex h-full min-h-[22rem] max-w-[36rem] flex-col items-start justify-center gap-4 px-2">
      <p className="font-display text-3xl leading-tight text-sumi sm:text-4xl">
        Fold a document into speech.
      </p>
      <p className="max-w-[34ch] font-body text-base leading-relaxed text-ink-fade">
        Paste text or drop a file in the source panel. Play reads it aloud
        sentence by sentence — the active crease lights gold as it goes.
      </p>
      <p className="label-ui text-[11px] text-ink-mute">
        .txt · .md · .pdf · .docx
      </p>
    </div>
  );
}
