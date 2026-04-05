// src/pages/reports/Validation.jsx
import { useState } from 'react'
import { validationAPI } from '../../api/client'
import { PageLoader, Badge } from '../../components/ui'
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'
import toast from 'react-hot-toast'

const SEVERITY_STYLE = {
  CRITICAL: { bar: 'bg-red-500', text: 'text-red-400', badge: 'badge-red', icon: XCircle },
  HIGH:     { bar: 'bg-orange-500', text: 'text-orange-400', badge: 'badge-orange', icon: AlertTriangle },
  MEDIUM:   { bar: 'bg-amber-500', text: 'text-amber-400', badge: 'badge-yellow', icon: AlertTriangle },
  LOW:      { bar: 'bg-blue-500', text: 'text-blue-400', badge: 'badge-blue', icon: Info },
}

const MODULES = ['procurement', 'inventory', 'assets', 'mro', 'projects']

export default function Validation() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [moduleResult, setModuleResult] = useState(null)
  const [activeModule, setActiveModule] = useState(null)

  const runFull = async () => {
    setLoading(true)
    setModuleResult(null)
    setActiveModule(null)
    try {
      const { data } = await validationAPI.runFull()
      setResult(data.data)
      toast.success(`Validation complete — ${data.data.summary.totalIssues} issue(s) found`)
    } catch {}
    setLoading(false)
  }

  const runModule = async (mod) => {
    setLoading(true)
    setActiveModule(mod)
    try {
      const { data } = await validationAPI.runModule(mod)
      setModuleResult(data.data)
      toast(data.message)
    } catch {}
    setLoading(false)
  }

  const healthColor = {
    HEALTHY: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    AT_RISK: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    CRITICAL: 'text-red-400 border-red-500/30 bg-red-500/5',
  }

  const allIssues = result ? [
    ...result.issues.procurement,
    ...result.issues.inventory,
    ...result.issues.assets,
    ...result.issues.mro,
    ...result.issues.projects,
  ].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return order[a.severity] - order[b.severity]
  }) : []

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title">Validation Engine</h1>
          <p className="text-xs text-zinc-500 mt-1">End-to-end workflow integrity checks across all modules</p>
        </div>
        <button onClick={runFull} disabled={loading} className="btn-primary">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Run Full Validation
        </button>
      </div>

      {/* Module Quick-Scan buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-zinc-500 self-center mr-1">Quick scan:</span>
        {MODULES.map((mod) => (
          <button key={mod} onClick={() => runModule(mod)} disabled={loading}
            className={`btn-secondary btn-sm capitalize ${activeModule === mod ? 'border-brand-500 text-brand-400' : ''}`}>
            {mod}
          </button>
        ))}
      </div>

      {loading && <PageLoader />}

      {/* Module result */}
      {!loading && moduleResult && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-brand-400" />
            <h2 className="font-semibold text-zinc-200 capitalize">{moduleResult.module} Validation</h2>
            <span className={`badge ${moduleResult.issueCount === 0 ? 'badge-green' : 'badge-red'}`}>
              {moduleResult.issueCount} issue(s)
            </span>
          </div>
          {moduleResult.issues.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">No issues found — this module is clean.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {moduleResult.issues.map((issue, i) => {
                const s = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.LOW
                const Icon = s.icon
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${issue.severity === 'CRITICAL' ? 'bg-red-500/5 border-red-500/20' : 'bg-surface-750 border-surface-600'}`}>
                    <Icon className={`w-4 h-4 ${s.text} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`${s.badge} badge text-[10px]`}>{issue.severity}</span>
                        <span className="text-[10px] font-mono text-zinc-600">{issue.code}</span>
                      </div>
                      <p className="text-sm text-zinc-300">{issue.message}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Full validation result */}
      {!loading && result && (
        <div className="space-y-5">
          {/* System health card */}
          <div className={`card p-6 border ${healthColor[result.systemHealth.status]}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6" />
                <div>
                  <p className="font-display font-bold text-xl">{result.systemHealth.status}</p>
                  <p className="text-xs opacity-70">System Health Status</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-4xl">{result.systemHealth.score}</p>
                <p className="text-xs opacity-70">/ 100</p>
              </div>
            </div>
            {/* Health bar */}
            <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${
                result.systemHealth.score >= 90 ? 'bg-emerald-500' :
                result.systemHealth.score >= 70 ? 'bg-amber-500' : 'bg-red-500'
              }`} style={{ width: `${result.systemHealth.score}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs opacity-70">
              <span>Validated in {result.executionTimeMs}ms</span>
              <span>·</span>
              <span>{result.summary.totalIssues} total issue(s)</span>
            </div>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(result.summary.bySeverity).map(([sev, count]) => {
              const s = SEVERITY_STYLE[sev] || SEVERITY_STYLE.LOW
              return (
                <div key={sev} className="card-sm p-4">
                  <div className={`flex items-center gap-2 mb-2 ${s.text}`}>
                    <div className={`w-2 h-2 rounded-full ${s.bar}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider">{sev}</span>
                  </div>
                  <p className="font-display font-bold text-2xl text-zinc-100">{count}</p>
                </div>
              )
            })}
          </div>

          {/* Issues by module */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(result.summary.byModule).map(([mod, count]) => (
              <div key={mod} className="card-sm p-3 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{mod}</p>
                <p className={`font-display font-bold text-xl ${count > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{count}</p>
              </div>
            ))}
          </div>

          {/* All issues */}
          {allIssues.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-surface-600">
                <h3 className="font-semibold text-zinc-300">All Issues ({allIssues.length})</h3>
              </div>
              <div className="divide-y divide-surface-700/50 max-h-[500px] overflow-y-auto">
                {allIssues.map((issue, i) => {
                  const s = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.LOW
                  const Icon = s.icon
                  return (
                    <div key={i} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-750 transition-colors">
                      <Icon className={`w-4 h-4 ${s.text} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`${s.badge} badge text-[10px]`}>{issue.severity}</span>
                          <span className="badge badge-gray text-[10px]">{issue.module}</span>
                          <span className="text-[10px] font-mono text-zinc-600">{issue.code}</span>
                        </div>
                        <p className="text-sm text-zinc-300">{issue.message}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allIssues.length === 0 && (
            <div className="card p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold text-emerald-400 text-lg">All Clear!</p>
              <p className="text-sm text-zinc-500 mt-1">No workflow integrity issues detected across all modules.</p>
            </div>
          )}
        </div>
      )}

      {/* Initial state */}
      {!loading && !result && !moduleResult && (
        <div className="card p-16 text-center">
          <ShieldCheck className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <p className="font-display font-bold text-xl text-zinc-400">Run a Validation</p>
          <p className="text-sm text-zinc-600 mt-2 max-w-md mx-auto">
            Click "Run Full Validation" to check data integrity across all modules, or use Quick Scan to check a specific module.
          </p>
        </div>
      )}
    </div>
  )
}
