"use client";

import { useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";

interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface QuizProps {
  text: string;
  disabled?: boolean;
}

interface QuizState {
  questions: QuizQuestion[];
  answers: (number | null)[];
}

/** Optional comprehension fold — graceful without GEMINI_API_KEY. */
export default function Quiz({ text, disabled = false }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const generateQuiz = useCallback(async () => {
    if (!text.trim() || disabled) return;

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
  }, [text, disabled]);

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

  const answeredCount = quiz ? quiz.answers.filter((a) => a !== null).length : 0;
  const correctCount = quiz
    ? quiz.questions.reduce(
        (count, q, i) => (quiz.answers[i] === q.correct_index ? count + 1 : count),
        0,
      )
    : 0;
  const showScore = quiz !== null && answeredCount > 0;

  return (
    <section
      id="quiz"
      className="border border-hairline bg-fold/80"
      aria-label="Quiz"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="label-ui text-[11px] text-sumi-soft">Quiz</h2>
          {showScore && (
            <span className="font-data text-xs tabular-nums text-ink-fade">
              {correctCount} / {quiz!.questions.length} correct
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {quiz && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="label-ui text-[10px] text-ink-fade hover:text-vermilion"
            >
              {open ? "Hide" : "Show"}
            </button>
          )}
          <button
            type="button"
            onClick={generateQuiz}
            disabled={isLoading || disabled}
            title={disabled ? "Add text first" : undefined}
            className="gold-dot-btn h-8 px-4 text-[11px]"
          >
            <span className="h-2 w-2 rounded-full bg-gold-lit" aria-hidden="true" />
            {quiz ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="px-4 py-3 font-ui text-xs text-ink-fade">
          Folding questions…
        </p>
      )}

      {error && !isLoading && (
        <p className="border-t border-hairline px-4 py-3 font-ui text-xs text-vermilion-ink">
          {error}
        </p>
      )}

      {quiz && open && !isLoading && (
        <div className="flex flex-col gap-4 px-4 py-4">
          {quiz.questions.map((q, qi) => {
            const selected = quiz.answers[qi];
            const answered = selected !== null;
            return (
              <div key={qi} className="flex flex-col gap-2">
                <p className="font-body text-sm leading-relaxed text-sumi">
                  <span className="mr-2 font-data text-[11px] tabular-nums text-ink-fade">
                    {String(qi + 1).padStart(2, "0")}
                  </span>
                  {q.question}
                </p>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((option, oi) => {
                    let optionClass =
                      "w-full border border-hairline bg-transparent px-3 py-2 text-left font-ui text-xs text-sumi transition-colors hover:bg-washi";
                    if (answered) {
                      if (oi === q.correct_index) {
                        optionClass =
                          "w-full border border-vermilion bg-fold px-3 py-2 text-left font-ui text-xs font-semibold text-vermilion-ink";
                      } else if (oi === selected) {
                        optionClass =
                          "w-full border border-hairline-deep bg-washi-deep px-3 py-2 text-left font-ui text-xs text-ink-fade line-through";
                      } else {
                        optionClass =
                          "w-full border border-hairline bg-transparent px-3 py-2 text-left font-ui text-xs text-ink-mute";
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
    </section>
  );
}
