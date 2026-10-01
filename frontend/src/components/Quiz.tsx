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
  text: string; // the full source text
  disabled?: boolean; // disable when no text
}

interface QuizState {
  questions: QuizQuestion[];
  /** For each question index: the option the user picked, or null if unanswered. */
  answers: (number | null)[];
}

export default function Quiz({ text, disabled = false }: QuizProps) {
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      console.error("Quiz request failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate quiz. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [text, disabled]);

  const handleAnswer = useCallback(
    (questionIndex: number, optionIndex: number) => {
      setQuiz((prev) => {
        if (!prev) return prev;
        // Don't allow changing an already-answered question
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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quiz</h2>
        <div className="flex items-center gap-2">
          {showScore && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {correctCount} / {quiz!.questions.length} correct
            </span>
          )}
          <button
            onClick={generateQuiz}
            disabled={isLoading || disabled}
            title={disabled ? "Add text first" : undefined}
            className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {quiz ? "Regenerate" : "Generate quiz"}
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="mt-3 text-sm text-blue-500">Generating quiz...</p>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {quiz && !isLoading && (
        <div className="mt-4 flex flex-col gap-4">
          {quiz.questions.map((q, qi) => {
            const selected = quiz.answers[qi];
            const answered = selected !== null;
            return (
              <div
                key={qi}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {qi + 1}. {q.question}
                </p>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((option, oi) => {
                    let optionClass =
                      "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";
                    if (answered) {
                      if (oi === q.correct_index) {
                        optionClass =
                          "w-full rounded-md border border-green-500 bg-green-50 px-3 py-2 text-left text-sm font-medium text-green-800 dark:border-green-600 dark:bg-green-900/40 dark:text-green-300";
                      } else if (oi === selected) {
                        optionClass =
                          "w-full rounded-md border border-red-500 bg-red-50 px-3 py-2 text-left text-sm text-red-800 dark:border-red-600 dark:bg-red-900/40 dark:text-red-300";
                      } else {
                        optionClass =
                          "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500";
                      }
                    }
                    return (
                      <button
                        key={oi}
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
                  <p className="mt-2 text-sm italic text-zinc-500 dark:text-zinc-400">
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
