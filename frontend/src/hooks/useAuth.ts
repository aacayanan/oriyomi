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
    const supabase = createClient()

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
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error: error?.message ?? null }
    },
    []
  )

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({ email, password })
      // session is null when email confirmation is required
      const needsVerification = !error && !data.session
      return { error: error?.message ?? null, needsVerification }
    },
    []
  )

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }, [])

  const signInWithOtp = useCallback(async (email: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error?.message ?? null }
  }, [])

  return { signInWithPassword, signUpWithPassword, signOut, signInWithOtp }
}