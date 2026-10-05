"use client";

import { useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import { ChevronIcon } from "./Icons";

/* ─── Types ─── */

interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface QuizProps {
  text: string;
  /** true when playback has reached the last sentence of the document */
  fullyRead: boolean;
  disabled?: boolean;
}

interface QuizState {
  questions: QuizQuestion[];
  answers: (number | null)[];
}

/* ─── Inline lock icon (avoids coupling to Icons.tsx) ─── */

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/* ─── Component ─── */

/** Optional comprehension fold — locked until the full document is listened to. */
export default function Quiz({ text, fullyRead, disabled = false }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const isDisabled = disabled || !text.trim();
  const isLocked = !fullyRead || isDisabled;

  /* ── Generate ── */

  const generateQuiz = useCallback(async () => {
    if (isLocked) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/quiz"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, num_questions: 3 }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || `Server error (${res.status})`);
      }

      const questions: QuizQuestion[] = data.questions || [];
      setQuiz({
        questions,
        answers: questions.map(() => null),
      });
      setOpen(true);
    } catch (err) {
      console.error("Quiz request failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Quiz is unavailable right now. You can keep reading without it.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [text, isLocked]);

  /* ── Answer ── */

  const handleAnswer = useCallback(
    (questionIndex: number, optionIndex: number) => {
      setQuiz((prev) => {
        if (!prev) return prev;
        if (prev.answers[questionIndex] !== null) return prev;
        const newAnswers = [...prev.answers];
        newAnswers[questionIndex] = optionIndex;
        return { ...prev, answers: newAnswers };
      });
    },
    [],
  );

  /* ── Score ── */

  const answeredCount = quiz ? quiz.answers.filter((a) => a !== null).length : 0;
  const correctCount = quiz
    ? quiz.questions.reduce(
        (count, q, i) => (quiz.answers[i] === q.correct_index ? count + 1 : count),
        0,
      )
    : 0;
  const showScore = quiz !== null && answeredCount > 0;

  /* ── Toggle ── */

  const canToggle = !isLocked;
  const handleToggle = () => {
    if (canToggle) setOpen((v) => !v);
  };

  /* ── Render ── */

  return (
    <section
      id="quiz"
      className="border border-hairline bg-fold/80"
      aria-label="Quiz"
    >
      {/* ── Header (always visible) ── */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLocked}
        aria-expanded={open}
        aria-disabled={isLocked}
        title={isLocked ? "Finish listening to the full text to unlock" : undefined}
        className={`flex w-full items-center justify-between gap-3 border-b border-hairline px-4 py-3 text-left transition-colors ${
          isLocked
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:bg-washi/60"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <LockIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-ink-mute" : "text-ink-fade"}`}
          />
          <span className="label-ui label-lg text-sumi-soft">Quiz</span>
          {isLocked && (
            <span className="font-data label-sm text-ink-mute">Coming soon</span>
          )}
          {!isLocked && showScore && (
            <span className="font-data text-xs tabular-nums text-ink-fade">
              {correctCount} / {quiz!.questions.length} correct
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {quiz && !isLocked && (
            <span className="label-ui label-sm text-ink-fade">
              {open ? "Hide" : "Show"}
            </span>
          )}
          <ChevronIcon
            className={`h-4 w-4 shrink-0 text-ink-fade transition-transform ${
              open ? "rotate-180" : ""
            } ${isLocked ? "opacity-40" : ""}`}
          />
        </div>
      </button>

      {/* ── Locked hint ── */}
      {isLocked && (
        <p className="px-4 py-2 font-ui label-lg leading-relaxed text-ink-mute">
          Finish listening to the full text to unlock
        </p>
      )}

      {/* ── Unlocked content ── */}
      {!isLocked && open && (
        <div className="px-4 py-3">
          {/* Badge row */}
          <div className="mb-3 flex items-center gap-2.5">
            <span className="label-ui label-sm text-sumi-soft">To be tested</span>
            <span className="inline-flex items-center rounded-full border border-hairline-deep bg-washi px-2 py-0.5 font-data label-sm uppercase tracking-wider text-ink-fade">
              Coming soon
            </span>
            <button
              type="button"
              onClick={generateQuiz}
              disabled={isLoading}
              className="gold-dot-btn ml-auto h-7 px-3 label-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold-lit" aria-hidden="true" />
              {quiz ? "Regenerate" : "Generate"}
            </button>
          </div>

          {/* Loading */}
          {isLoading && (
            <p className="py-2 font-ui text-xs text-ink-fade">Folding questions…</p>
          )}

          {/* Error */}
          {error && !isLoading && (
            <p className="border-t border-hairline py-2 font-ui text-xs text-vermilion-ink">
              {error}
            </p>
          )}

          {/* Questions */}
          {quiz && !isLoading && (
            <div className="flex flex-col gap-4 pt-1">
              {quiz.questions.map((q, qi) => {
                const selected = quiz.answers[qi];
                const answered = selected !== null;
                return (
                  <div key={qi} className="flex flex-col gap-2">
                    <p className="font-body text-sm leading-relaxed text-sumi">
                      <span className="mr-2 font-data label-lg tabular-nums text-ink-fade">
                        {String(qi + 1).padStart(2, "0")}
                      </span>
                      {q.question}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {q.options.map((option, oi) => {
                        let optionClass = "option-btn";
                        if (answered) {
                          if (oi === q.correct_index) {
                            optionClass = "option-btn option-btn--correct";
                          } else if (oi === selected) {
                            optionClass = "option-btn option-btn--wrong";
                          }
                        }
                        return (
                          <button
                            key={oi}
                            type="button"
                            onClick={() => handleAnswer(qi, oi)}
                            disabled={answered}
                            className={optionClass}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {answered && q.explanation && (
                      <p className="font-body text-xs italic leading-relaxed text-ink-fade">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}