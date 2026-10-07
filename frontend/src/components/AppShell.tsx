'use client'

import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import MobileGate from './MobileGate'
import MobileReader from './MobileReader'

/** Must match the CSS breakpoint in globals.css (.mobile-reader / .app-desktop-only). */
const MOBILE_QUERY = '(max-width: 860px)'

/**
 * Viewport class for reader selection. CSS visibility alone is not enough:
 * a display:none component stays mounted, keeps running effects, and would
 * hydrate and play the same ?origami= session as the visible reader —
 * the document played twice.
 *
 * Returns null until the viewport has been measured. SSR and the first
 * client render then agree (both "unmeasured"), so there is no hydration
 * mismatch — and the desktop reader never flashes on a phone during the
 * frame before the matchMedia effect resolves, which left phone viewports
 * with no visible reader controls at all.
 */
function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const isMobile = useIsMobile()

  // Viewport not measured yet: neutral spinner only. SSR and the first
  // client render stay identical (no hydration mismatch), and neither the
  // desktop reader nor the mobile reader mounts until the viewport is known.
  if (isMobile === null) {
    return (
      <div className="h-screen overflow-hidden">
        <div className="app-mobile-gate">
          <span className="gate-loading" aria-label="Loading" />
        </div>
      </div>
    )
  }

  // While loading, show a minimal state. On mobile the desktop reader must
  // NOT mount even briefly: with ?origami= in the URL its load effect would
  // fetch and auto-play the stored fold, and MobileReader would then play
  // the same fold again — the document sounded twice.
  if (loading) {
    const spinner = (
      <div className="app-mobile-gate">
        <span className="gate-loading" aria-label="Loading" />
      </div>
    )
    if (isMobile) {
      return <div className="h-screen overflow-hidden">{spinner}</div>
    }
    return (
      <div className="h-screen overflow-hidden">
        {spinner}
        <div className="app-desktop-only h-full">{children}</div>
      </div>
    )
  }

  // Signed-in: mount exactly ONE reader. MobileReader and the desktop
  // TextReader used to both stay mounted (CSS hid one), so opening
  // ?origami= made both hydrate the session and play audio twice.
  if (user) {
    if (isMobile) {
      return (
        <div className="h-screen overflow-hidden">
          <Suspense
            fallback={
              <div className="mr-loading">
                <span className="mr-loading-text">Loading…</span>
              </div>
            }
          >
            <MobileReader />
          </Suspense>
        </div>
      )
    }
    return (
      <div className="h-screen overflow-hidden">
        <div className="app-desktop-only h-full">{children}</div>
      </div>
    )
  }

  // Signed-out: the gate on mobile, the desktop reader on desktop —
  // never both, so the hidden tree can't run reader effects either.
  if (isMobile) {
    return (
      <div className="h-screen overflow-hidden">
        <MobileGate>{children}</MobileGate>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden">
      <div className="app-desktop-only h-full">{children}</div>
    </div>
  )
}
