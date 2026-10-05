"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import OrigamiLibrary from "@/components/OrigamiLibrary";
import { CraneMark } from "@/components/Icons";

export default function LibraryPage() {
  const { user, loading } = useAuth();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — mirrors the reader top bar */}
      <header className="z-30 flex shrink-0 items-center gap-4 border-b border-hairline bg-fold px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 no-underline"
        >
          <CraneMark className="h-7 w-7 text-vermilion-ink" />
          <span className="font-display text-[28px] font-bold leading-none tracking-[0.012em] text-sumi">
            oriyomi
          </span>
        </Link>
        <span className="label-ui label-lg text-ink-fade ml-4">
          Library
        </span>
        {user && (
          <Link
            href="/app"
            className="outline-btn label-sm ml-auto h-8 rounded-none px-3 no-underline"
          >
            Reader
          </Link>
        )}
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="label-ui label-lg text-ink-fade">
              Checking session…
            </span>
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <span className="font-display text-xl font-bold text-sumi">
              Sign in to view your library
            </span>
            <p className="font-body text-sm text-ink-mute max-w-[30ch]">
              Your saved fold sessions live here. Sign in to save and revisit
              your origamis.
            </p>
            <Link
              href="/"
              className="gold-dot-btn h-10 rounded-none px-5 label-lg no-underline mt-2"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <OrigamiLibrary />
        )}
      </main>
    </div>
  );
}