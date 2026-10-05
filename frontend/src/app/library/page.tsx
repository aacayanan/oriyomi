"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import OrigamiLibrary from "@/components/OrigamiLibrary";
import { CraneMark } from "@/components/Icons";

export default function LibraryPage() {
  const { user, loading } = useAuth();

  return (
    <div className="lib-page">
      {/* Top bar — mirrors the reader */}
      <header className="lib-topbar">
        <Link href="/" className="lib-topbar-brand">
          <CraneMark className="h-7 w-7 text-vermilion-ink" />
          <span className="lib-topbar-wordmark">oriyomi</span>
        </Link>
      </header>

      <main className="lib-main">
        {/* Registration crosses — the landing page's marginalia, scoped to the sheet */}
        <svg className="lib-reg lib-reg-tl" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
        </svg>
        <svg className="lib-reg lib-reg-tr" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth=".8" />
        </svg>

        {loading ? (
          <div className="lib-checking">
            <span className="lib-checking-label">Checking session…</span>
          </div>
        ) : !user ? (
          <div className="lib-signed-out">
            <CraneMark className="lib-signed-out-mark" />
            <h1 className="lib-title">Sign in to view your library</h1>
            <div className="lib-title-rule" aria-hidden="true" />
            <p className="lib-signed-out-copy">
              Your saved origamis live here. Sign in to keep fold sessions and
              read them anywhere.
            </p>
            <Link href="/" className="gold-dot-btn label-lg h-10 px-6 no-underline mt-2">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Editorial title block */}
            <div className="lib-heading">
              <h1 className="lib-title">Origami Library</h1>
              <div className="lib-title-rule" aria-hidden="true" />
              <span className="lib-folio-mark">
                折り · your saved fold sessions
              </span>
            </div>
            <OrigamiLibrary />
          </>
        )}
      </main>
    </div>
  );
}
