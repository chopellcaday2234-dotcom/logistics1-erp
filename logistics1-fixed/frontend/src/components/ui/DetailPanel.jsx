// src/components/ui/DetailPanel.jsx
// Full-screen slide-over panel for showing entity details

export default function DetailPanel({ open, onClose, title, subtitle, children, width = 'max-w-2xl' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className={`relative ml-auto h-full ${width} w-full bg-surface-900 border-l border-surface-600 shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-surface-700 shrink-0">
          <div>
            <h2 className="text-lg font-display font-semibold text-zinc-100">{title}</h2>
            {subtitle && <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 ml-4">
            ✕
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}

export function DetailRow({ label, value, mono }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-zinc-500 uppercase tracking-wider w-36 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-zinc-200 break-words ${mono ? 'font-mono' : ''}`}>
        {value ?? <span className="text-zinc-600 italic">—</span>}
      </span>
    </div>
  )
}

export function DetailSection({ title, children }) {
  return (
    <div className="card p-4 space-y-3">
      {title && <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-surface-600 pb-2">{title}</h3>}
      {children}
    </div>
  )
}
