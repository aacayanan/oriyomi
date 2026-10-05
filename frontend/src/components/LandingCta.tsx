"use client"

import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"

interface LandingCtaProps {
  className: string
  children: React.ReactNode
}

/**
 * Auth-aware CTA link on the landing page.
 * Signed in → /library (their origami shelf).
 * Signed out → /app (the reader).
 */
export default function LandingCta({ className, children }: LandingCtaProps) {
  const { user, loading } = useAuth()
  const href = user ? "/library" : "/app"
  // While auth resolves, keep the signed-out destination so there's no flash.
  return (
    <Link className={className} href={loading ? "/app" : href}>
      {children}
    </Link>
  )
}
