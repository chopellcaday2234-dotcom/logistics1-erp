// src/components/ui/FormComponents.jsx
import { useState } from 'react'
import { ChevronDown, X, Search, Check } from 'lucide-react'

// ── Section wrapper ────────────────────────────────────────
export const FormSection = ({ title, children }) => (
  <div className="space-y-4">
    {title && (
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">{title}</span>
        <div className="flex-1 h-px bg-surface-600" />
      </div>
    )}
    {children}
  </div>
)

// ── Field wrapper ──────────────────────────────────────────
export const Field = ({ label, error, required, children, hint }) => (
  <div className="form-group">
    {label && (
      <label className="label">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="text-xs text-zinc-600 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
)

// ── Multi-select with search ────────────────────────────────
export const MultiSelect = ({ label, options, value = [], onChange, placeholder = 'Select...', required }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id) => {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    onChange(next)
  }

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label)

  return (
    <Field label={label} required={required}>
      <div className="relative">
        <button type="button" onClick={() => setOpen(!open)}
          className="input text-left flex items-center justify-between">
          <span className={value.length ? 'text-zinc-100' : 'text-zinc-500'}>
            {value.length ? `${value.length} selected: ${selectedLabels.slice(0,2).join(', ')}${value.length > 2 ? '...' : ''}` : placeholder}
          </span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 card shadow-2xl max-h-52 overflow-hidden">
            <div className="p-2 border-b border-surface-600">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                <input className="input py-1 pl-7 text-xs" placeholder="Search..."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto max-h-40">
              {filtered.map((o) => (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-700 flex items-center gap-2 transition-colors">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${value.includes(o.value) ? 'bg-brand-500 border-brand-500' : 'border-surface-400'}`}>
                    {value.includes(o.value) && <Check className="w-3 h-3 text-surface-900" />}
                  </div>
                  <span className="text-zinc-300">{o.label}</span>
                  {o.sub && <span className="text-zinc-600 text-xs ml-auto">{o.sub}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-center text-zinc-600 text-xs py-4">No results</p>}
            </div>
          </div>
        )}
      </div>
    </Field>
  )
}

// ── Tag list display ────────────────────────────────────────
export const TagList = ({ items, onRemove, color = 'bg-brand-500/15 text-brand-400' }) => (
  <div className="flex flex-wrap gap-2 mt-2">
    {items.map((item, i) => (
      <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${color}`}>
        {item}
        {onRemove && (
          <button type="button" onClick={() => onRemove(i)}>
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    ))}
  </div>
)

// ── Item row in a dynamic list ──────────────────────────────
export const ItemRow = ({ children, onRemove, className = '' }) => (
  <div className={`flex items-start gap-3 p-3 bg-surface-750 rounded-lg border border-surface-600 ${className}`}>
    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>
    {onRemove && (
      <button type="button" onClick={onRemove}
        className="mt-1 p-1 text-zinc-600 hover:text-red-400 transition-colors shrink-0">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
)

// ── Detail row (label + value pairs) ───────────────────────
export const DetailRow = ({ label, value, mono = false }) => (
  <div className="flex justify-between items-start py-2.5 border-b border-surface-700/50 last:border-0">
    <span className="text-xs text-zinc-500 uppercase tracking-wider shrink-0 mr-4">{label}</span>
    <span className={`text-sm text-zinc-200 text-right ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
  </div>
)

// ── Detail card ─────────────────────────────────────────────
export const DetailCard = ({ title, children, actions }) => (
  <div className="card">
    <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
      <h3 className="font-semibold text-zinc-200 text-sm">{title}</h3>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
    <div className="p-5">{children}</div>
  </div>
)

// ── Page back header ────────────────────────────────────────
export const PageBack = ({ title, subtitle, onBack, actions }) => (
  <div className="flex items-start justify-between mb-6">
    <div className="flex items-center gap-3">
      <button onClick={onBack}
        className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center transition-colors">
        <span className="text-zinc-400 text-lg leading-none">←</span>
      </button>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
)

// ── Tabs component ──────────────────────────────────────────
export const Tabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-surface-600 mb-5 flex-wrap">
    {tabs.map((t, i) => (
      <button key={t} onClick={() => onChange(i)}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
          ${active === i ? 'bg-brand-500 text-surface-900' : 'text-zinc-400 hover:text-zinc-200'}`}>
        {t}
      </button>
    ))}
  </div>
)

// ── Status timeline ─────────────────────────────────────────
export const StatusTimeline = ({ steps, current }) => {
  const idx = steps.indexOf(current)
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
            ${i < idx ? 'bg-emerald-500/15 text-emerald-400' :
              i === idx ? 'bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40' :
              'bg-surface-700 text-zinc-600'}`}>
            {i < idx && <Check className="w-3 h-3" />}
            {step.replace(/_/g, ' ')}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px w-4 ${i < idx ? 'bg-emerald-500/40' : 'bg-surface-600'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
