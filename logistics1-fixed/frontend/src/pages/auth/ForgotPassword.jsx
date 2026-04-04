import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '../../api/client'
import toast from 'react-hot-toast'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      await authAPI.forgotPassword({ email })
      setSent(true)
      toast.success('Reset link sent — check your email (or server console in dev mode)')
    } catch {
      // Always show success to prevent email enumeration
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-black font-bold text-lg font-display">L1</span>
            </div>
            <span className="text-xl font-display font-semibold text-zinc-100 tracking-tight">
              Logistics 1 ERP
            </span>
          </div>
        </div>

        <div className="card p-8">
          {!sent ? (
            <>
              <h2 className="text-2xl font-display font-semibold text-zinc-100 mb-1">
                Forgot Password
              </h2>
              <p className="text-zinc-400 text-sm mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input w-full mt-1"
                    placeholder="you@logistics1.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-2.5 mt-2 disabled:opacity-60"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Check your inbox</h3>
              <p className="text-zinc-400 text-sm mb-1">
                If <span className="text-zinc-200">{email}</span> is registered, a reset link has been sent.
              </p>
              <p className="text-zinc-500 text-xs mb-6">
                In development mode, the link is printed in the server console.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="btn-ghost text-sm text-zinc-400 hover:text-zinc-200"
              >
                Try a different email
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-surface-600 text-center">
            <Link to="/login" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
