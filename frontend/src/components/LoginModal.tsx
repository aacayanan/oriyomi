'use client'

import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@/hooks/useAuth'

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

type Mode = 'login' | 'signup'

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const { signInWithPassword, signUpWithPassword, signInWithOtp } =
    useAuthActions()

  if (!open) return null

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const fn = mode === 'login' ? signInWithPassword : signUpWithPassword
    const { error: err } = await fn(email, password)
    if (err) {
      setError(err)
    } else {
      onClose()
    }
  }

  const handleMagicLink = async () => {
    if (!email) {
      setError('Enter your email first')
      return
    }
    setError(null)
    const { error: err } = await signInWithOtp(email)
    if (err) {
      setError(err)
    } else {
      setSent(true)
    }
  }

  return (
    <div
      className="login-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="login-modal" role="dialog" aria-modal="true">
        <button
          type="button"
          className="login-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="login-modal-title">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h2>

        {sent ? (
          <p className="login-modal-sent">
            Check your email for a magic link.
          </p>
        ) : (
          <form className="login-modal-form" onSubmit={handleSubmit}>
            <label className="login-modal-label">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-modal-input"
                autoComplete="email"
              />
            </label>

            <label className="login-modal-label">
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-modal-input"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
              />
            </label>

            {error && <p className="login-modal-error">{error}</p>}

            <button type="submit" className="login-modal-submit">
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>

            <button
              type="button"
              className="login-modal-otp"
              onClick={handleMagicLink}
            >
              Send magic link instead
            </button>
          </form>
        )}

        <p className="login-modal-toggle">
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}{' '}
          <button type="button" className="login-modal-toggle-btn" onClick={toggleMode}>
            {mode === 'login' ? 'Create one' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}