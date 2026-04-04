import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authAPI } from '../../api/client'
import toast from 'react-hot-toast'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState({ newPassword: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link — please request a new one.')
    }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (form.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await authAPI.resetPassword({ token, newPassword: form.newPassword })
      setDone(true)
      toast.success('Password reset successfully!')
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed — link may have expired')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
        <div className="card p-8 max-w-sm w-full text-center">
          <p className="text-red-400 mb-4">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="btn-primary px-6 py-2">
            Request New Link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
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
          {!done ? (
            <>
              <h2 className="text-2xl font-display font-semibold text-zinc-100 mb-1">
                Set New Password
              </h2>
              <p className="text-zinc-400 text-sm mb-6">
                Choose a strong password with uppercase, lowercase, and a number.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New Password</label>
                  <div className="relative mt-1">
                    <input
                      type={show ? 'text' : 'password'}
                      className="input w-full pr-10"
                      placeholder="Min. 8 characters"
                      value={form.newPassword}
                      onChange={(e) => setForm(f => ({ ...f, newPassword: e.target.value }))}
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    >
                      {show ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type={show ? 'text' : 'password'}
                    className="input w-full mt-1"
                    placeholder="Repeat password"
                    value={form.confirm}
                    onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))}
                    required
                  />
                </div>

                {/* Strength hints */}
                {form.newPassword && (
                  <ul className="text-xs space-y-1 mt-1">
                    {[
                      [/.{8,}/, 'At least 8 characters'],
                      [/[A-Z]/, 'Uppercase letter'],
                      [/[a-z]/, 'Lowercase letter'],
                      [/[0-9]/, 'Number'],
                    ].map(([re, label]) => (
                      <li key={label} className={re.test(form.newPassword) ? 'text-green-400' : 'text-zinc-500'}>
                        {re.test(form.newPassword) ? '✓' : '○'} {label}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-2.5 mt-2 disabled:opacity-60"
                >
                  {loading ? 'Resetting…' : 'Reset Password'}
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
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Password Reset!</h3>
              <p className="text-zinc-400 text-sm">Redirecting you to login…</p>
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
