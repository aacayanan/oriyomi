"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Landing-page reader mock that performs the product claim live:
 * the lit sentence is the spoken sentence.
 *
 * Timing mimics the real viewer — sentence duration = chars / 15 seconds
 * at 1.0× (the same estimator TextReader uses) — with discrete
 * timestamp-driven advancement, gold waveform region over the active
 * sentence, vermilion played fill, crease-bar done marks, smooth
 * center-scroll of the sheet, and click-to-seek on any sentence.
 */

const SENTENCES = [
  "Glycolysis is the first step in cellular respiration, breaking down glucose into pyruvate and releasing energy in the form of ATP and NADH.",
  "This process does not require oxygen and occurs in the cytoplasm of all living cells.",
  "Glycolysis takes place in the cytoplasm.",
  "Glycolysis consists of two phases: the energy-investment phase and the energy-payoff phase.",
  "During the energy-investment phase, two ATP molecules are used to activate glucose.",
];

const DURS = SENTENCES.map((s) => Math.round((s.length / 15) * 1000));
const STARTS: number[] = [];
{
  let acc = 0;
  for (const d of DURS) {
    STARTS.push(acc);
    acc += d;
  }
}
const TOTAL = STARTS[STARTS.length - 1] + DURS[DURS.length - 1];
/** Beat held on the last line before the fold replays. */
const HOLD_MS = 1600;

/** Static first-paint frame: the canonical lit sentence, mid-utterance. */
const INITIAL_T = STARTS[2] + Math.round(DURS[2] * 0.35);

const WAVE_HEIGHTS = [
  6, 10, 8, 14, 10, 16, 12, 8, 14, 6, 10, 12, 8, 14, 6, 10, 16, 8, 12, 6, 14,
  10, 8, 12, 6,
];

function formatTime(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function activeIndexAt(t: number): number {
  const tt = Math.min(t, TOTAL - 1);
  let idx = 0;
  for (let i = 0; i < STARTS.length; i++) {
    if (STARTS[i] <= tt) idx = i;
  }
  return idx;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ReaderMock() {
  const [t, setT] = useState(INITIAL_T);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const endHoldRef = useRef<number | null>(null);
  const resumeRef = useRef(false);

  /** Open on the fold's first line and play, unless motion is reduced. */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    setT(0);
    setPlaying(true);
  }, []);

  /** Timestamp-driven engine: advance, hold at fold end, replay. */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        let next = prev + dt;
        if (next >= TOTAL) {
          if (endHoldRef.current === null) endHoldRef.current = now + HOLD_MS;
          if (now >= endHoldRef.current) {
            endHoldRef.current = null;
            return 0;
          }
          return TOTAL;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /**
   * Pause the loop when offscreen or the tab is hidden;
   * resume on return if it had been running.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onVisibility = () => {
      if (document.hidden) {
        resumeRef.current = playing;
        setPlaying(false);
      } else if (resumeRef.current) {
        resumeRef.current = false;
        setPlaying(true);
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          resumeRef.current = playing;
          setPlaying(false);
        } else if (resumeRef.current && !document.hidden) {
          resumeRef.current = false;
          setPlaying(true);
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing]);

  const active = activeIndexAt(t);

  /** Keep the lit line centered in the sheet, like the real viewer. */
  useEffect(() => {
    const line = lineRefs.current[active];
    const box = scrollRef.current;
    if (!line || !box) return;
    const target = Math.max(
      0,
      line.offsetTop - (box.clientHeight - line.offsetHeight) / 2,
    );
    if (prefersReducedMotion()) {
      box.scrollTop = target;
    } else {
      box.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [active]);

  const seekTo = useCallback((timeMs: number) => {
    endHoldRef.current = null;
    setT(Math.max(0, Math.min(timeMs, TOTAL - 1)));
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) endHoldRef.current = null;
      return !p;
    });
  }, []);

  const progress = Math.min(1, t / TOTAL);
  const playedBars = Math.floor(progress * WAVE_HEIGHTS.length);
  const regionLeft = (STARTS[active] / TOTAL) * 100;
  const regionWidth = (DURS[active] / TOTAL) * 100;

  return (
    <div className="reader-mock" ref={rootRef}>
      <div className="reader-header">
        <span className="label-ui">BIO-101 · ch.02 · glycolysis</span>
        <span className="label-ui">fold 02 of 04</span>
      </div>
      <div className="reader-body">
        <div className="fold-rail">
          <div className="fold-rail-header">Fold 02 of 04</div>
          <div className="fold-dots">
            <span className="fold-dot fold-dot-done" />
            <span className="fold-dot fold-dot-active" />
            <span className="fold-dot" />
            <span className="fold-dot" />
          </div>
          <div className="fold-card">
            <div className="fold-card-art" />
            <div className="fold-card-info">
              <span className="fold-card-num">02</span>
              <span className="fold-card-title">Glycolysis</span>
              <span className="fold-card-time">~27s</span>
            </div>
          </div>
          <div className="fold-rail-list">
            <div className="fold-list-card">
              <div className="fold-list-art" />
              <span className="fold-list-num">01</span>
              <span className="fold-list-title">Introduction</span>
              <span className="fold-list-dur">~13s</span>
            </div>
            <div className="fold-list-card">
              <div className="fold-list-art fold-list-art-active" />
              <span className="fold-list-num fold-list-num-active">02</span>
              <span className="fold-list-title fold-list-title-active">
                Glycolysis
              </span>
              <span className="fold-list-dur">~27s</span>
            </div>
            <div className="fold-list-card">
              <div className="fold-list-art" />
              <span className="fold-list-num">03</span>
              <span className="fold-list-title">Krebs cycle</span>
              <span className="fold-list-dur">~22s</span>
            </div>
            <div className="fold-list-card">
              <div className="fold-list-art" />
              <span className="fold-list-num">04</span>
              <span className="fold-list-title">Electron transport</span>
              <span className="fold-list-dur">~19s</span>
            </div>
          </div>
        </div>

        <div className="reader-sheet">
          <div className="sheet-sentences" ref={scrollRef}>
            {SENTENCES.map((text, i) => {
              const state =
                i === active ? "sline-active" : i < active ? "sline-done" : "sline-pending";
              return (
                <div className={`sline ${state}`} key={i}>
                  <span className="s-dot" aria-hidden="true" />
                  <button
                    type="button"
                    className="s-text"
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    onClick={() => seekTo(STARTS[i] + 1)}
                    aria-label={`Play from: ${text}`}
                  >
                    {text}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="playback-bar">
            <span className="playback-voice">emma · 1.0×</span>
            <div className="playback-controls">
              <div className="wave-wrap">
                <div className="wave-times">
                  <span>{formatTime(Math.min(t, TOTAL))}</span>
                  <span>
                    {hover !== null
                      ? formatTime(hover * TOTAL)
                      : formatTime(TOTAL)}
                  </span>
                </div>
                <div
                  className="waveform-strip"
                  role="presentation"
                  aria-label="Audio waveform"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (rect.width <= 0) return;
                    const ratio = Math.min(
                      1,
                      Math.max(0, (e.clientX - rect.left) / rect.width),
                    );
                    setHover(ratio);
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (rect.width <= 0) return;
                    const ratio = Math.min(
                      1,
                      Math.max(0, (e.clientX - rect.left) / rect.width),
                    );
                    seekTo(ratio * TOTAL);
                  }}
                >
                  <div
                    className="wf-region"
                    aria-hidden="true"
                    style={{
                      left: `${regionLeft}%`,
                      width: `${regionWidth}%`,
                      opacity: playing ? 0.45 : 0.28,
                    }}
                  />
                  {WAVE_HEIGHTS.map((h, i) => (
                    <span
                      key={i}
                      className={`wf-bar ${i < playedBars ? "wf-bar-played" : ""}`}
                      style={{ height: h }}
                    />
                  ))}
                  <div
                    className="wf-head"
                    aria-hidden="true"
                    style={{ left: `${progress * 100}%` }}
                  />
                  {hover !== null && (
                    <div
                      className="wf-preview"
                      aria-hidden="true"
                      style={{ left: `${hover * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <span className="speed-label">1.0×</span>
              <button
                className="play-btn"
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <svg viewBox="0 0 10 12" fill="none" aria-hidden="true">
                    <rect x="0" y="0" width="3" height="12" fill="#1a1513" />
                    <rect x="7" y="0" width="3" height="12" fill="#1a1513" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 12 14" fill="none" aria-hidden="true">
                    <path d="M0 0 L12 7 L0 14 Z" fill="#1a1513" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
