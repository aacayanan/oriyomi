'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthActions } from '@/hooks/useAuth'

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

type Mode = 'login' | 'signup'

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [verifyNotice, setVerifyNotice] = useState(false)
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

    if (mode === 'signup') {
      const { error: err, needsVerification } = await signUpWithPassword(
        email,
        password
      )
      if (err) {
        setError(err)
      } else if (needsVerification) {
        setVerifyNotice(true)
      } else {
        // auto-confirm enabled — signed in immediately
        onClose()
        router.push('/library')
      }
    } else {
      const { error: err } = await signInWithPassword(email, password)
      if (err) {
        setError(err)
      } else {
        onClose()
        router.push('/library')
      }
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

        {verifyNotice ? (
          <>
            <h2 className="login-modal-title">Verify your email</h2>
            <div className="login-modal-verify">
              <svg
                className="login-modal-verify-mark"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path
                  d="M2 30 L20 17 L32 5 L44 17 L62 30 L44 31 L32 45 L20 31 Z M27 31 L32 60 L37 31 Z"
                  fill="currentColor"
                />
              </svg>
              <p>
                We sent a verification link to <strong>{email}</strong>.
                Check your inbox and confirm your email to start using oriyomi.
              </p>
              <p className="login-modal-verify-fine">
                The link expires in 24 hours. Check spam if you don&apos;t see it.
              </p>
            </div>
            <button
              type="button"
              className="login-modal-submit"
              onClick={onClose}
            >
              Back to sign in
            </button>
          </>
        ) : sent ? (
          <p className="login-modal-sent">
            Check your email for a magic link.
          </p>
        ) : (
          <>
            <h2 className="login-modal-title">
              {mode === 'login' ? 'Log in' : 'Create account'}
            </h2>

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

            <p className="login-modal-toggle">
              {mode === 'login'
                ? "Don't have an account?"
                : 'Already have an account?'}{' '}
              <button type="button" className="login-modal-toggle-btn" onClick={toggleMode}>
                {mode === 'login' ? 'Create one' : 'Log in'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
