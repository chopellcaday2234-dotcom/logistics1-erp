// src/pages/reports/Reports.jsx
import { useState, useEffect } from 'react'
import { reportsAPI, validationAPI } from '../../api/client'
import { StatCard, PageLoader, Badge, currency, number } from '../../components/ui'
import { BarChart3, Shield, RefreshCw, AlertTriangle, CheckCircle2, Info, Download, Calendar } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import toast from 'react-hot-toast'

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg p-3 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? currency(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useState(0)
  const [dashboard, setDashboard] = useState(null)
  const [invReport, setInvReport] = useState(null)
  const [supplierReport, setSupplierReport] = useState(null)
  const [mroReport, setMroReport] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const TABS = ['Dashboard', 'Inventory', 'Suppliers', 'Maintenance', 'Audit Log']

  const load = async () => {
    setLoading(true)
    try {
      const params = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }
      const [d, i, s, m, a] = await Promise.all([
        reportsAPI.getDashboard(),
        reportsAPI.getInventory(params),
        reportsAPI.getSupplierPerformance(params),
        reportsAPI.getAssetMaintenance(params),
        reportsAPI.getAudit({ limit: 20, ...params }),
      ])
      setDashboard(d.data.data.report)
      setInvReport(i.data.data.report)
      setSupplierReport(s.data.data.report)
      setMroReport(m.data.data.report)
      setAuditLogs(a.data.data.logs)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleExport = async (type) => {
    setExportLoading(true)
    try {
      await reportsAPI.exportCSV(type, { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
      toast.success('CSV downloaded!')
    } catch {
      toast.error('Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const actionColor = { CREATE: 'text-emerald-400', UPDATE: 'text-blue-400', DELETE: 'text-red-400', APPROVE: 'text-brand-400', REJECT: 'text-red-400', WORKFLOW_CHANGE: 'text-purple-400', LOGIN: 'text-zinc-400', LOGOUT: 'text-zinc-500' }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="text-xs text-zinc-500 mt-1">Cross-module insights and audit trail</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-surface-800 border border-surface-600 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-zinc-300 text-sm outline-none w-32" />
            <span className="text-zinc-500 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-zinc-300 text-sm outline-none w-32" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-zinc-500 hover:text-zinc-300 text-xs ml-1">✕</button>
            )}
          </div>
          <button onClick={load} className="btn-secondary">
            <RefreshCw className="w-4 h-4" /> Apply
          </button>
          {tab > 0 && (
            <button
              onClick={() => handleExport(['inventory','supplier-performance','asset-maintenance','project-materials','audit'][tab-1] || 'audit')}
              disabled={exportLoading}
              className="btn-secondary text-green-400 border-green-500/30 hover:border-green-500/60"
            >
              <Download className="w-4 h-4" />
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-surface-600 flex-wrap">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === i ? 'bg-brand-500 text-surface-900' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <>
          {/* Dashboard Overview */}
          {tab === 0 && dashboard && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Stock Value" value={currency(dashboard.inventory.totalStockValue)} />
                <StatCard label="PO Value (30d)" value={currency(dashboard.procurement.poValueThisMonth)} />
                <StatCard label="Maint. Cost (30d)" value={currency(dashboard.mro.maintenanceCostThisMonth)} />
                <StatCard label="Project Spend" value={currency(dashboard.projects.totalSpend)} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Low Stock Items" value={dashboard.inventory.lowStockItems} color="text-red-400" />
                <StatCard label="Pending PO Approvals" value={dashboard.procurement.pendingApprovals} color="text-amber-400" />
                <StatCard label="Overdue WOs" value={dashboard.mro.overdueWorkOrders} color="text-red-400" />
                <StatCard label="Over-Budget Projects" value={dashboard.projects.overBudgetProjects} color="text-orange-400" />
              </div>
            </div>
          )}

          {/* Inventory Report */}
          {tab === 1 && invReport && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Items" value={invReport.summary.totalItems} />
                <StatCard label="Stock Value" value={currency(invReport.summary.totalStockValue)} />
                <StatCard label="Total IN (units)" value={number(invReport.summary.totalIN)} />
                <StatCard label="Total OUT (units)" value={number(invReport.summary.totalOUT)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-5">
                  <h3 className="font-semibold text-sm text-zinc-300 mb-4">Stock by Category</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={invReport.byCategory.map((c) => ({ name: c.category?.replace('_',' ').slice(0,10), items: c._count.id }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                      <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="items" name="Items" fill="#f59e0b" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card p-5">
                  <h3 className="font-semibold text-sm text-zinc-300 mb-4">Top Consumed Items</h3>
                  <div className="space-y-2">
                    {(invReport.topMovers || []).slice(0, 8).map((m) => (
                      <div key={m.inventoryItemId} className="flex justify-between text-xs py-1 border-b border-surface-700/50">
                        <span className="text-zinc-400 truncate max-w-40">{m.item?.name || m.inventoryItemId}</span>
                        <div className="text-right">
                          <p className="font-mono text-zinc-300">{number(m._sum.quantity)} {m.item?.unit}</p>
                          <p className="font-mono text-zinc-500">{currency(m._sum.totalCost)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Supplier Performance */}
          {tab === 2 && supplierReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Suppliers Evaluated" value={supplierReport.summary.totalSuppliers} />
                <StatCard label="Total PO Value" value={currency(supplierReport.summary.totalPOValue)} />
                <StatCard label="Avg On-Time Rate" value={supplierReport.summary.avgOnTimeRate != null ? `${supplierReport.summary.avgOnTimeRate}%` : '—'} color="text-emerald-400" />
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Supplier</th><th>Total POs</th><th>PO Value</th><th>Fulfillment</th><th>On-Time Rate</th><th>Rating</th></tr></thead>
                  <tbody>
                    {supplierReport.suppliers.map((s) => (
                      <tr key={s.supplier?.id}>
                        <td><p className="font-medium text-zinc-200">{s.supplier?.name}</p><p className="text-xs text-zinc-500 font-mono">{s.supplier?.code}</p></td>
                        <td>{s.totalPOs}</td>
                        <td><span className="font-mono text-sm">{currency(s.totalValue)}</span></td>
                        <td>
                          {s.fulfillmentRate != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-surface-700 rounded-full">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.fulfillmentRate}%` }} />
                              </div>
                              <span className="text-xs text-zinc-300">{s.fulfillmentRate}%</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          {s.onTimeRate != null
                            ? <span className={s.onTimeRate >= 80 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>{s.onTimeRate}%</span>
                            : '—'}
                        </td>
                        <td><span className="text-brand-400 font-semibold">{s.supplier?.rating?.toFixed(1) || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Maintenance Report */}
          {tab === 3 && mroReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total WOs" value={mroReport.summary.totalWorkOrders} />
                <StatCard label="Total Cost" value={currency(mroReport.summary.totalCost)} />
                <StatCard label="Total Hours" value={`${mroReport.summary.totalHours?.toFixed(1)}h`} />
                <StatCard label="Parts Cost" value={currency(mroReport.summary.totalPartsCost)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-5">
                  <h3 className="font-semibold text-sm text-zinc-300 mb-4">WOs by Type</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={mroReport.byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70}>
                        {mroReport.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend formatter={(v) => <span className="text-xs text-zinc-400">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card p-5">
                  <h3 className="font-semibold text-sm text-zinc-300 mb-4">Highest Maintenance Cost Assets</h3>
                  <div className="space-y-2">
                    {mroReport.topAssetsByCost.slice(0, 6).map((a) => (
                      <div key={a.assetId} className="flex justify-between py-1 border-b border-surface-700/50">
                        <div>
                          <p className="text-xs font-mono text-zinc-300">{a.asset?.assetCode}</p>
                          <p className="text-xs text-zinc-500">{a.asset?.name}</p>
                        </div>
                        <p className="text-sm font-mono text-zinc-300">{currency(a._sum.totalCost)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit Log */}
          {tab === 4 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date/Time</th><th>User</th><th>Action</th><th>Module</th><th>Description</th></tr></thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>
                        <p className="text-xs font-medium text-zinc-300">{log.user?.firstName} {log.user?.lastName}</p>
                        <p className="text-xs text-zinc-600">{log.user?.role}</p>
                      </td>
                      <td><span className={`text-xs font-semibold ${actionColor[log.action] || 'text-zinc-400'}`}>{log.action}</span></td>
                      <td><span className="badge badge-gray text-[10px]">{log.module}</span></td>
                      <td><p className="text-xs text-zinc-400 max-w-xs truncate">{log.description || '—'}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
