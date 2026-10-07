'use client'

import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'

interface AuthState {
  user: User | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch (e) {
      // Missing NEXT_PUBLIC_SUPABASE_* env vars — render signed-out
      // instead of crashing the page.
      console.error(e)
      setUser(null)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}

export function useAuthActions() {
  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error: error?.message ?? null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Sign-in failed" }
      }
    },
    []
  )

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signUp({ email, password })
        // session is null when email confirmation is required
        const needsVerification = !error && !data.session
        return { error: error?.message ?? null, needsVerification }
      } catch (e) {
        return {
          error: e instanceof Error ? e.message : "Sign-up failed",
          needsVerification: false,
        }
      }
    },
    []
  )

  const signOut = useCallback(async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (e) {
      console.error(e)
    }
  }, [])

  const signInWithOtp = useCallback(async (email: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ email })
      return { error: error?.message ?? null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Sign-in failed" }
    }
  }, [])

  return { signInWithPassword, signUpWithPassword, signOut, signInWithOtp }
}