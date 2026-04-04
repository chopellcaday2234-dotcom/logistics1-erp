// src/components/ui/index.jsx
import { X, Loader2, AlertCircle, Inbox } from 'lucide-react'

// ── Spinner ────────────────────────────────────────────────
export const Spinner = ({ size = 'md', className = '' }) => {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return <Loader2 className={`${sz} animate-spin text-brand-500 ${className}`} />
}

export const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <Spinner size="lg" />
  </div>
)

// ── Badge ──────────────────────────────────────────────────
const BADGE_COLORS = {
  ACTIVE: 'badge-green', APPROVED: 'badge-green', COMPLETED: 'badge-green',
  RECEIVED: 'badge-green', DONE: 'badge-green', HEALTHY: 'badge-green',
  MITIGATED: 'badge-green', SUCCESS: 'badge-green',
  DRAFT: 'badge-gray', PLANNING: 'badge-gray', TODO: 'badge-gray',
  INACTIVE: 'badge-gray', LOW: 'badge-gray', INFO: 'badge-blue',
  PENDING_APPROVAL: 'badge-yellow', QUOTED: 'badge-yellow', UNDER_REVIEW: 'badge-yellow',
  IN_PROGRESS: 'badge-yellow', ON_HOLD: 'badge-yellow', AT_RISK: 'badge-yellow',
  OPEN: 'badge-yellow', WARNING: 'badge-yellow', MEDIUM: 'badge-yellow',
  SENT: 'badge-blue', PARTIALLY_RECEIVED: 'badge-blue', REVIEW: 'badge-blue',
  UNDER_MAINTENANCE: 'badge-purple',
  REJECTED: 'badge-red', CANCELLED: 'badge-red', CRITICAL: 'badge-red',
  RETIRED: 'badge-red', DISPOSED: 'badge-red', LOST: 'badge-red',
  ERROR: 'badge-red', ALERT: 'badge-red', HIGH: 'badge-orange',
  POOR: 'badge-red', FAIR: 'badge-yellow', GOOD: 'badge-blue',
  EXCELLENT: 'badge-green', EXPIRED: 'badge-red', QUARANTINED: 'badge-orange',
  DEPLETED: 'badge-gray', BLACKLISTED: 'badge-red',
  CORRECTIVE: 'badge-orange', PREVENTIVE: 'badge-blue',
  EMERGENCY: 'badge-red', INSPECTION: 'badge-purple',
}

export const Badge = ({ value, label }) => {
  const text = label || value
  const cls = BADGE_COLORS[value] || 'badge-gray'
  return <span className={cls}>{text}</span>
}

// ── Stat Card ──────────────────────────────────────────────
export const StatCard = ({ label, value, icon: Icon, color = 'text-brand-400', sub, trend }) => (
  <div className="stat-card">
    <div className="flex items-start justify-between">
      <span className="stat-label">{label}</span>
      {Icon && <Icon className={`w-5 h-5 ${color} opacity-80`} />}
    </div>
    <span className="stat-value">{value ?? '—'}</span>
    {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    {trend !== undefined && (
      <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
      </span>
    )}
  </div>
)

// ── Empty State ────────────────────────────────────────────
export const EmptyState = ({ icon: Icon = Inbox, title = 'No records', message = '' }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
    <Icon className="w-12 h-12 text-zinc-600" />
    <p className="font-semibold text-zinc-400">{title}</p>
    {message && <p className="text-sm text-zinc-600 max-w-xs">{message}</p>}
  </div>
)

// ── Alert Box ──────────────────────────────────────────────
export const AlertBox = ({ type = 'error', message }) => {
  const styles = {
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  }
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${styles[type]}`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} card animate-fadeIn`}>
        <div className="flex items-center justify-between p-5 border-b border-surface-600">
          <h2 className="font-display font-bold text-lg text-zinc-100">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────
export const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null
  const { page, totalPages, total, limit } = pagination
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-600 text-sm">
      <span className="text-zinc-500">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="btn-ghost btn-sm px-2">
          ←
        </button>
        {[...Array(Math.min(totalPages, 5))].map((_, i) => {
          const p = i + 1
          return (
            <button key={p} onClick={() => onPageChange(p)}
              className={`btn-sm px-3 rounded-lg ${p === page ? 'bg-brand-500 text-surface-900 font-bold' : 'btn-ghost'}`}>
              {p}
            </button>
          )
        })}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="btn-ghost btn-sm px-2">
          →
        </button>
      </div>
    </div>
  )
}

// ── Confirm Dialog ─────────────────────────────────────────
export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, danger = false }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm">
    <p className="text-zinc-400 text-sm mb-6">{message}</p>
    <div className="flex gap-3 justify-end">
      <button onClick={onClose} className="btn-secondary">Cancel</button>
      <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
        Confirm
      </button>
    </div>
  </Modal>
)

// ── Currency / Number formatters ───────────────────────────
export const currency = (v) => `₱${(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
export const number = (v) => (v || 0).toLocaleString()
export const pct = (v) => `${(v || 0).toFixed(1)}%`
