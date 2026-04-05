// src/pages/dashboard/Dashboard.jsx
import { useState, useEffect } from 'react'
import { reportsAPI, mroAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { StatCard, PageLoader, Badge, currency, number } from '../../components/ui'
import {
  ShoppingCart, Package, Cpu, Wrench, FolderKanban,
  AlertTriangle, CheckCircle2, TrendingUp, Clock
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg p-3 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user, isManagerOrAbove } = useAuth()
  const [report, setReport] = useState(null)
  const [mroStats, setMroStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        if (isManagerOrAbove()) {
          const [r, m] = await Promise.all([
            reportsAPI.getDashboard(),
            mroAPI.getStats(),
          ])
          setReport(r.data.data.report)
          setMroStats(m.data.data?.stats)
        }
      } catch {}
      finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <PageLoader />

  const d = report

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-zinc-100">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},
          {' '}{user?.firstName} 👋
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {!isManagerOrAbove() ? (
        <div className="card p-8 text-center">
          <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="font-semibold text-zinc-300">Welcome to Logistics 1 ERP</p>
          <p className="text-sm text-zinc-500 mt-1">Use the sidebar to navigate to your modules.</p>
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="POs Pending Approval" icon={ShoppingCart} color="text-amber-400"
              value={d?.procurement.pendingApprovals ?? 0}
              sub={`₱${((d?.procurement.poValueThisMonth || 0) / 1000).toFixed(0)}K this month`} />
            <StatCard label="Low Stock Items" icon={AlertTriangle} color="text-red-400"
              value={d?.inventory.lowStockItems ?? 0}
              sub={`₱${((d?.inventory.totalStockValue || 0) / 1000).toFixed(0)}K stock value`} />
            <StatCard label="Open Work Orders" icon={Wrench} color="text-purple-400"
              value={d?.mro.openWorkOrders ?? 0}
              sub={`${d?.mro.overdueWorkOrders ?? 0} overdue`} />
            <StatCard label="Active Projects" icon={FolderKanban} color="text-blue-400"
              value={d?.projects.activeProjects ?? 0}
              sub={`₱${((d?.projects.totalBudget || 0) / 1000000).toFixed(1)}M total budget`} />
          </div>

          {/* Second KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active Suppliers" icon={TrendingUp} color="text-emerald-400"
              value={d?.procurement.activeSuppliers ?? 0} />
            <StatCard label="Assets Under Maint." icon={Cpu} color="text-orange-400"
              value={d?.assets.underMaintenance ?? 0}
              sub={`${d?.assets.maintenanceSchedulesOverdue ?? 0} schedules overdue`} />
            <StatCard label="WOs Completed (30d)" icon={CheckCircle2} color="text-emerald-400"
              value={d?.mro.completedThisMonth ?? 0}
              sub={`₱${((d?.mro.maintenanceCostThisMonth || 0) / 1000).toFixed(0)}K cost`} />
            <StatCard label="Expiring Batches (30d)" icon={Clock} color="text-red-400"
              value={d?.inventory.expiringBatchesSoon ?? 0} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* WO Monthly Trend */}
            {mroStats?.monthlyTrend && (
              <div className="card p-5 col-span-2">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">Work Orders — 6 Month Trend</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mroStats.monthlyTrend}>
                    <defs>
                      <linearGradient id="woGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                    <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" name="WOs" stroke="#f59e0b" fill="url(#woGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="cost" name="Cost ₱" stroke="#3b82f6" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* WO by Status */}
            {mroStats?.byStatus && (
              <div className="card p-5">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">WOs by Status</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={Object.entries(mroStats.byStatus).map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" nameKey="name">
                      {Object.entries(mroStats.byStatus).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8}
                      formatter={(v) => <span className="text-xs text-zinc-400">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Projects Budget Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <h3 className="font-semibold text-sm text-zinc-300 mb-2">Project Budget vs Spend</h3>
              <div className="space-y-1 mb-4">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Total Budget</span>
                  <span className="text-zinc-300 font-mono">{currency(d?.projects.totalBudget)}</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Total Spent</span>
                  <span className="text-zinc-300 font-mono">{currency(d?.projects.totalSpend)}</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Variance</span>
                  <span className={`font-mono font-semibold ${(d?.projects.budgetVariance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {currency(Math.abs(d?.projects.budgetVariance || 0))}
                    {(d?.projects.budgetVariance || 0) < 0 ? ' over' : ' remaining'}
                  </span>
                </div>
              </div>
              {/* Budget progress bar */}
              <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, d?.projects.totalBudget > 0 ? (d.projects.totalSpend / d.projects.totalBudget) * 100 : 0)}%` }} />
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                {d?.projects.totalBudget > 0
                  ? `${((d.projects.totalSpend / d.projects.totalBudget) * 100).toFixed(1)}% utilized`
                  : 'No budget set'}
              </p>
            </div>

            {/* Recent Activity */}
            <div className="card p-5">
              <h3 className="font-semibold text-sm text-zinc-300 mb-4">Recent Activity</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(d?.system.recentActivity || []).slice(0, 6).map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 bg-brand-500/60 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-400">{log.description || `${log.action} on ${log.module}`}</span>
                    </div>
                    <span className="text-zinc-600 shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Alerts banner */}
          {((d?.mro.overdueWorkOrders || 0) > 0 || (d?.inventory.lowStockItems || 0) > 0 || (d?.projects.overBudgetProjects || 0) > 0) && (
            <div className="card border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
                <AlertTriangle className="w-4 h-4" />
                Action Required
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {(d?.mro.overdueWorkOrders || 0) > 0 && (
                  <p className="text-xs text-amber-300/80">• {d.mro.overdueWorkOrders} overdue work order(s)</p>
                )}
                {(d?.inventory.lowStockItems || 0) > 0 && (
                  <p className="text-xs text-amber-300/80">• {d.inventory.lowStockItems} low stock item(s)</p>
                )}
                {(d?.projects.overBudgetProjects || 0) > 0 && (
                  <p className="text-xs text-amber-300/80">• {d.projects.overBudgetProjects} project(s) over budget</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
