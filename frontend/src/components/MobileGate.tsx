'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import LoginModal from './LoginModal'

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  // While loading auth state, show minimal spinner
  if (loading) {
    return (
      <div className="app-mobile-gate">
        <span className="gate-loading" aria-label="Loading" />
      </div>
    )
  }

  // Signed-in users skip the gate (mobile reader handled elsewhere)
  if (user) {
    return <>{children}</>
  }

  // Signed-out: show the gate
  return (
    <>
      <div className="app-mobile-gate">
        <svg className="gate-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
            fill="currentColor"
          />
        </svg>
        <span className="gate-wordmark">oriyomi</span>
        <span className="gate-rule" aria-hidden="true" />
        <p className="gate-copy">
          oriyomi works best on desktop devices, mobile is still in beta and requires an account
        </p>
        <button
          type="button"
          className="gate-login"
          onClick={() => setModalOpen(true)}
        >
          Log in
        </button>
        <p className="gate-fine">折り to fold · 読み to read</p>
      </div>
      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}