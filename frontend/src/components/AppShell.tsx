'use client'

import { Suspense } from 'react'
import { useAuth } from '@/hooks/useAuth'
import MobileGate from './MobileGate'
import MobileReader from './MobileReader'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  // While loading, show a minimal state
  if (loading) {
    return (
      <div className="h-screen overflow-hidden">
        <div className="app-mobile-gate">
          <span className="gate-loading" aria-label="Loading" />
        </div>
        <div className="app-desktop-only h-full">{children}</div>
      </div>
    )
  }

  // Signed-in: mobile gets MobileReader, desktop gets the full TextReader
  if (user) {
    return (
      <div className="h-screen overflow-hidden">
        <Suspense fallback={<div className="mr-loading"><span className="mr-loading-text">Loading…</span></div>}>
          <MobileReader />
        </Suspense>
        <div className="app-desktop-only h-full">{children}</div>
      </div>
    )
  }

  // Signed-out: gate mobile, show desktop reader
  return (
    <div className="h-screen overflow-hidden">
      <MobileGate>{children}</MobileGate>
      <div className="app-desktop-only h-full">{children}</div>
    </div>
  )
}