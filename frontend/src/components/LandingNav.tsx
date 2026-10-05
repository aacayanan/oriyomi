'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import LoginModal from './LoginModal'

export default function LandingNav() {
  const { user, loading } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <svg className="landing-mark" viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
          fill="currentColor"
        />
      </svg>
      <span className="wordmark">oriyomi</span>
      <div className="landing-issue">
        <span className="landing-issue-label">Vol. 01 · Free Forever</span>
        <span className="landing-issue-sub">
          Sentence-sync read-along
        </span>
      </div>

      {!loading && !user && (
        <button
          type="button"
          className="landing-nav-ghost"
          onClick={() => setModalOpen(true)}
        >
          Log in
        </button>
      )}

      <Link className="landing-nav-cta" href="/app">
        Open the reader
      </Link>

      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}