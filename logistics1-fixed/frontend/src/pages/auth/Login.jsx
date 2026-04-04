// src/pages/auth/Login.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Boxes, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (email, password) => setForm({ email, password })

  return (
    <div className="min-h-screen flex bg-surface-900">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-surface-800 border-r border-surface-600 p-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
            <Boxes className="w-6 h-6 text-surface-900" />
          </div>
          <div>
            <p className="font-display font-bold text-xl text-zinc-100">Logistics 1</p>
            <p className="text-xs text-zinc-500">Hotel & Restaurant ERP</p>
          </div>
        </div>

        <div>
          <h1 className="font-display font-bold text-3xl text-zinc-100 leading-tight mb-4">
            Complete Logistics Control
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8">
            Manage procurement, inventory, assets, maintenance, and projects — all in one place.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {['Procurement', 'Inventory', 'Asset Management', 'MRO', 'Projects', 'Analytics'].map((m) => (
              <div key={m} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
                {m}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-zinc-600">© 2024 Logistics 1 ERP System</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Boxes className="w-6 h-6 text-brand-500" />
            <span className="font-display font-bold text-zinc-100">Logistics 1</span>
          </div>

          <h2 className="font-display font-bold text-2xl text-zinc-100 mb-1">Sign in</h2>
          <p className="text-zinc-500 text-sm mb-8">Access the ERP dashboard</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input type="email" className="input" placeholder="you@example.com" required
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input pr-10" placeholder="••••••••" required
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end -mt-1">
              <Link to="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                Forgot password?
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-8 p-4 card-sm">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Demo Accounts</p>
            <div className="space-y-2">
              {[
                { role: 'Admin', email: 'admin@logistics1.com', pw: 'Admin@1234' },
                { role: 'Manager', email: 'manager@logistics1.com', pw: 'Manager@1234' },
                { role: 'Staff', email: 'staff@logistics1.com', pw: 'Staff@1234' },
                { role: 'Technician', email: 'technician@logistics1.com', pw: 'Tech@1234' },
              ].map(({ role, email, pw }) => (
                <button key={role} onClick={() => fillDemo(email, pw)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-700 transition-colors flex items-center justify-between group">
                  <span className="text-xs font-medium text-zinc-300">{role}</span>
                  <span className="text-xs text-zinc-600 group-hover:text-zinc-400 font-mono">{email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
