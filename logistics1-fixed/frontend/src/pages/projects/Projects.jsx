// src/pages/projects/Projects.jsx — Full rewrite with detail view + forms
import { useState, useEffect } from 'react'
import { projectsAPI, inventoryAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Badge, StatCard, Modal, EmptyState, Pagination, PageLoader, currency, number } from '../../components/ui'
import { Plus, Search, FolderKanban, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight, Package, Users, FileText, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-surface-600 flex-wrap mb-4">
      {tabs.map((t,i) => (
        <button key={t} onClick={() => onChange(i)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${active===i ? 'bg-brand-500 text-surface-900' : 'text-zinc-400 hover:text-zinc-200'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

export default function Projects() {
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reload, setReload] = useState(0)

  if (view==='detail') return <ProjectDetail id={selectedId} onBack={() => setView('list')} onReload={() => setReload(r=>r+1)} />

  return (
    <ProjectList reload={reload}
      onView={id => { setSelectedId(id); setView('detail') }}
      onCreate={() => setShowCreate(true)}
      showCreate={showCreate} setShowCreate={setShowCreate}
      onCreated={() => setReload(r=>r+1)}
    />
  )
}

// ─── Project List ─────────────────────────────────────────
function ProjectList({ reload, onView, onCreate, showCreate, setShowCreate, onCreated }) {
  const { isManagerOrAbove } = useAuth()
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState(null)
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [pr, st] = await Promise.all([
        projectsAPI.getProjects({ page, limit:10, search, status:statusFilter||undefined }),
        isManagerOrAbove() ? projectsAPI.getStats() : Promise.resolve(null),
      ])
      setProjects(pr.data.data.projects)
      setPagination(pr.data.data.pagination)
      if (st) setStats(st.data.data.stats)
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [page, search, statusFilter, reload])

  const statusColors = {
    PLANNING:'border-l-blue-500', ACTIVE:'border-l-emerald-500',
    ON_HOLD:'border-l-amber-500', COMPLETED:'border-l-zinc-500', CANCELLED:'border-l-red-500',
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">Project Management</h1><p className="text-xs text-zinc-500 mt-1">Projects · Tasks · Risks · Materials</p></div>
        {isManagerOrAbove() && <button onClick={onCreate} className="btn-primary"><Plus className="w-4 h-4" /> New Project</button>}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Projects" icon={FolderKanban} value={stats.totalProjects} />
          <StatCard label="Active" icon={TrendingUp} color="text-blue-400" value={stats.activeProjects} />
          <StatCard label="Over Budget" icon={AlertTriangle} color="text-red-400" value={stats.overBudgetProjects} />
          <StatCard label="Total Budget" icon={BarChart3} color="text-emerald-400" value={currency(stats.totalBudget)} />
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input className="input pl-9" placeholder="Search projects..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select w-44" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Statuses</option>
          {['PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <PageLoader /> : (
        <div className="space-y-3">
          {!projects.length ? <EmptyState icon={FolderKanban} title="No projects" message="Create a project to get started." />
          : projects.map(p => (
            <button key={p.id} onClick={() => onView(p.id)}
              className={`w-full card p-5 border-l-4 ${statusColors[p.status]||'border-l-zinc-600'} hover:bg-surface-750 transition-colors text-left`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-zinc-500">{p.projectCode}</span>
                    <Badge value={p.status} />
                    {p.isOverBudget && <span className="badge-red badge">OVER BUDGET</span>}
                    {p.isPastEndDate && <span className="badge-red badge">PAST END DATE</span>}
                  </div>
                  <p className="font-semibold text-zinc-100 text-lg">{p.name}</p>
                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-zinc-500">
                    {p.location && <span>📍 {p.location}</span>}
                    {p.department && <span>🏢 {p.department}</span>}
                    {p.endDate && <span>📅 {new Date(p.endDate).toLocaleDateString('en-PH')}</span>}
                    {p.budget && <span>💰 {currency(p.budget)}</span>}
                    <span>📋 {p._count?.tasks||0} tasks</span>
                    <span>⚠️ {p._count?.risks||0} risks</span>
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  {p.budget > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 mb-1">Budget</p>
                      <p className={`font-mono font-bold text-lg ${p.isOverBudget ? 'text-red-400' : 'text-zinc-100'}`}>{p.budgetUsedPct}%</p>
                      <div className="w-20 h-1.5 bg-surface-700 rounded-full mt-1">
                        <div className={`h-full rounded-full ${p.isOverBudget ? 'bg-red-500' : 'bg-brand-500'}`}
                          style={{ width:`${Math.min(100,p.budgetUsedPct||0)}%` }} />
                      </div>
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </div>
              </div>
            </button>
          ))}
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => { load(); onCreated() }} />
    </div>
  )
}

// ─── Project Detail Page ──────────────────────────────────
function ProjectDetail({ id, onBack, onReload }) {
  const { isManagerOrAbove, user } = useAuth()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showTask, setShowTask] = useState(false)
  const [showRisk, setShowRisk] = useState(false)
  const [showMaterial, setShowMaterial] = useState(false)
  const [showComm, setShowComm] = useState(false)
  const [editTask, setEditTask] = useState(null)

  const load = async () => {
    setLoading(true)
    try { const r = await projectsAPI.getProject(id); setProject(r.data.data.project) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const updateStatus = async (status) => {
    try { await projectsAPI.updateProject(id, { status }); toast.success(`Status → ${status}`); load() } catch {}
  }

  if (loading) return <PageLoader />
  if (!project) return <div className="text-zinc-500 p-8 text-center">Project not found.</div>

  const h = project.health
  const healthStyle = { HEALTHY:'text-emerald-400', AT_RISK:'text-amber-400', CRITICAL:'text-red-400' }
  const canEdit = isManagerOrAbove() || project.createdById === user?.id

  const nextStatuses = {
    PLANNING:['ACTIVE','CANCELLED'],
    ACTIVE:['ON_HOLD','COMPLETED','CANCELLED'],
    ON_HOLD:['ACTIVE','CANCELLED'],
    COMPLETED:[], CANCELLED:[],
  }[project.status] || []

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center mt-1">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{project.name}</h1>
              <Badge value={project.status} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{project.projectCode} · {project.department}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && nextStatuses.map(s => (
            <button key={s} onClick={() => updateStatus(s)}
              className={`btn-sm ${s==='COMPLETED' ? 'btn-primary' : s==='CANCELLED' ? 'btn-danger' : 'btn-secondary'}`}>
              → {s.replace(/_/g,' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className={`font-display font-bold text-3xl ${healthStyle[h?.status]||'text-zinc-400'}`}>{h?.score}</p>
          <p className="text-xs text-zinc-500 mt-1">Health Score</p>
          <p className={`text-xs font-semibold mt-0.5 ${healthStyle[h?.status]||'text-zinc-400'}`}>{h?.status}</p>
        </div>
        <StatCard label="Tasks Done" value={`${project.taskSummary?.done||0}/${project.taskSummary?.total||0}`}
          sub={`${project.taskSummary?.completionPct||0}% complete`} />
        <StatCard label="Budget Used" value={project.budget ? `${project.budgetUsedPct||0}%` : '—'}
          sub={`₱${((project.actualCost||0)/1000).toFixed(0)}K spent`}
          color={project.isOverBudget ? 'text-red-400' : 'text-brand-400'} />
        <StatCard label="Open Risks" value={project.risks?.filter(r=>r.status==='OPEN').length||0}
          color={project.risks?.some(r=>r.level==='CRITICAL'&&r.status==='OPEN') ? 'text-red-400' : 'text-amber-400'} />
      </div>

      {h?.issues?.length > 0 && (
        <div className="card border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-400 mb-1">⚠️ Health Issues</p>
          {h.issues.map((issue,i) => <p key={i} className="text-xs text-amber-300/80">• {issue}</p>)}
        </div>
      )}

      <TabBar tabs={['Overview','Tasks','Risks','Materials','Communications']} active={tab} onChange={setTab} />

      {/* Overview */}
      {tab===0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5 space-y-1">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Project Info</p>
            {[
              ['Status', <Badge value={project.status} />],
              ['Start Date', project.startDate ? new Date(project.startDate).toLocaleDateString('en-PH') : null],
              ['End Date', project.endDate ? new Date(project.endDate).toLocaleDateString('en-PH') : null],
              ['Budget', project.budget ? currency(project.budget) : null],
              ['Actual Cost', currency(project.actualCost||0)],
              ['Location', project.location],
              ['Department', project.department],
              ['Created By', `${project.createdBy?.firstName} ${project.createdBy?.lastName}`],
            ].map(([label, val]) => val !== null && val !== undefined ? (
              <div key={label} className="flex justify-between py-2 border-b border-surface-700/40 last:border-0">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
                <span className="text-sm text-zinc-200">{val}</span>
              </div>
            ) : null)}
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Description</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{project.description || 'No description provided.'}</p>
            {project.budget > 0 && (
              <div className="mt-4 pt-4 border-t border-surface-600">
                <div className="flex justify-between text-xs text-zinc-500 mb-2">
                  <span>Budget Utilization</span>
                  <span className={project.isOverBudget ? 'text-red-400 font-bold' : 'text-zinc-300'}>{project.budgetUsedPct}%</span>
                </div>
                <div className="w-full h-3 bg-surface-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${project.isOverBudget ? 'bg-red-500' : 'bg-brand-500'}`}
                    style={{ width:`${Math.min(100,project.budgetUsedPct||0)}%` }} />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-zinc-600">₱0</span>
                  <span className="text-zinc-600">{currency(project.budget)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tasks */}
      {tab===1 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex gap-3 text-xs text-zinc-500">
              {Object.entries({TODO:'zinc',IN_PROGRESS:'amber',REVIEW:'blue',DONE:'emerald',CANCELLED:'zinc'}).map(([s,c]) => (
                <span key={s}>{s.replace('_',' ')}: <span className={`font-semibold text-${c}-400`}>{project.tasks?.filter(t=>t.status===s).length||0}</span></span>
              ))}
            </div>
            <button onClick={() => setShowTask(true)} className="btn-primary btn-sm"><Plus className="w-3 h-3" /> Add Task</button>
          </div>
          <div className="space-y-2">
            {!project.tasks?.length && <EmptyState title="No tasks yet" message="Add tasks to track project progress." />}
            {project.tasks?.map(task => (
              <div key={task.id} className="card p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-1.5 h-8 rounded-full shrink-0 ${
                    task.priority==='CRITICAL'?'bg-red-500':task.priority==='HIGH'?'bg-orange-500':task.priority==='MEDIUM'?'bg-blue-500':'bg-zinc-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status==='DONE'?'line-through text-zinc-500':'text-zinc-200'}`}>{task.title}</p>
                    <div className="flex gap-3 text-xs text-zinc-500 mt-0.5">
                      {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString('en-PH')}</span>}
                      {task.completedAt && <span className="text-emerald-400">✓ Done {new Date(task.completedAt).toLocaleDateString('en-PH')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge value={task.status} />
                  <Badge value={task.priority} />
                  {!['DONE','CANCELLED'].includes(task.status) && (
                    <button onClick={() => setEditTask(task)} className="btn-ghost btn-sm text-xs">Edit</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {tab===2 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-zinc-400">{project.risks?.filter(r=>r.status==='OPEN').length||0} open risks</p>
            <button onClick={() => setShowRisk(true)} className="btn-primary btn-sm"><Plus className="w-3 h-3" /> Add Risk</button>
          </div>
          <div className="space-y-2">
            {!project.risks?.length && <EmptyState title="No risks logged" message="Log risks to track project health." />}
            {project.risks?.map(risk => (
              <div key={risk.id} className={`card p-4 border-l-4 ${
                risk.level==='CRITICAL'?'border-l-red-500':risk.level==='HIGH'?'border-l-orange-500':risk.level==='MEDIUM'?'border-l-amber-500':'border-l-zinc-500'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge value={risk.level} />
                      <Badge value={risk.status} />
                    </div>
                    <p className="font-medium text-zinc-200">{risk.title}</p>
                    {risk.description && <p className="text-sm text-zinc-500 mt-1">{risk.description}</p>}
                    {risk.mitigation && <p className="text-xs text-zinc-400 mt-1">🛡 {risk.mitigation}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {tab===3 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-zinc-400">Total material cost: <span className="font-mono font-semibold text-zinc-200">{currency(project.materialUsages?.reduce((s,m)=>s+m.totalCost,0)||0)}</span></p>
            <button onClick={() => setShowMaterial(true)} className="btn-primary btn-sm"><Plus className="w-3 h-3" /> Consume Material</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Material</th><th>Batch</th><th>Qty Used</th><th>Unit Cost</th><th>Total</th></tr></thead>
              <tbody>
                {!project.materialUsages?.length && <tr><td colSpan={6}><EmptyState title="No materials consumed yet" /></td></tr>}
                {project.materialUsages?.map(m => (
                  <tr key={m.id}>
                    <td className="text-xs text-zinc-500">{new Date(m.usedAt).toLocaleDateString('en-PH')}</td>
                    <td><p className="text-sm text-zinc-200">{m.inventoryItemId}</p></td>
                    <td className="font-mono text-xs text-zinc-500">{m.batchId?.slice(0,8)||'—'}</td>
                    <td className="font-mono">{m.quantityUsed}</td>
                    <td className="font-mono text-sm">{currency(m.unitCost)}</td>
                    <td className="font-mono text-sm font-semibold">{currency(m.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Communications */}
      {tab===4 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowComm(true)} className="btn-primary btn-sm"><Plus className="w-3 h-3" /> Log Communication</button>
          </div>
          <div className="space-y-3">
            {!project.communications?.length && <EmptyState title="No communications logged" />}
            {project.communications?.map(c => (
              <div key={c.id} className="card p-4">
                <div className="flex justify-between mb-2">
                  <p className="font-semibold text-zinc-200">{c.subject}</p>
                  <span className="text-xs text-zinc-500">{new Date(c.createdAt).toLocaleDateString('en-PH')}</span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{c.message}</p>
                {c.recipients && <p className="text-xs text-zinc-600 mt-2">To: {c.recipients}</p>}
                <p className="text-xs text-zinc-600 mt-1">By: {c.sentBy}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showTask && <TaskModal projectId={id} onClose={() => setShowTask(false)} onSaved={() => { setShowTask(false); load() }} />}
      {editTask && <TaskModal projectId={id} task={editTask} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); load() }} />}
      {showRisk && <RiskModal projectId={id} onClose={() => setShowRisk(false)} onSaved={() => { setShowRisk(false); load() }} />}
      {showMaterial && <MaterialModal projectId={id} onClose={() => setShowMaterial(false)} onSaved={() => { setShowMaterial(false); load() }} />}
      {showComm && <CommModal projectId={id} onClose={() => setShowComm(false)} onSaved={() => { setShowComm(false); load() }} />}
    </div>
  )
}

// ─── Create Project Modal ─────────────────────────────────
function CreateProjectModal({ open, onClose, onSaved }) {
  const { user } = useAuth()
  const [f, setF] = useState({ projectCode:'', name:'', description:'', status:'PLANNING', budget:'', startDate:'', endDate:'', location:'', department:'' })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({...f, [k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await projectsAPI.createProject({ ...f, budget: f.budget ? parseFloat(f.budget) : undefined })
      toast.success('Project created'); onSaved(); onClose()
      setF({ projectCode:'', name:'', description:'', status:'PLANNING', budget:'', startDate:'', endDate:'', location:'', department:'' })
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="New Project" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="form-grid">
          <div className="form-group"><label className="label">Project Code *</label><input className="input" required placeholder="PROJ-2024-001" value={f.projectCode} onChange={upd('projectCode')} /></div>
          <div className="form-group"><label className="label">Name *</label><input className="input" required value={f.name} onChange={upd('name')} /></div>
          <div className="form-group"><label className="label">Status</label>
            <select className="select" value={f.status} onChange={upd('status')}>
              {['PLANNING','ACTIVE'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Budget (₱)</label><input type="number" className="input" min={0} placeholder="500000" value={f.budget} onChange={upd('budget')} /></div>
          <div className="form-group"><label className="label">Start Date</label><input type="date" className="input" value={f.startDate} onChange={upd('startDate')} /></div>
          <div className="form-group"><label className="label">End Date</label><input type="date" className="input" value={f.endDate} onChange={upd('endDate')} /></div>
          <div className="form-group"><label className="label">Location</label><input className="input" value={f.location} onChange={upd('location')} /></div>
          <div className="form-group"><label className="label">Department</label><input className="input" value={f.department} onChange={upd('department')} /></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[80px] resize-none" value={f.description} onChange={upd('description')} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Project'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Task Modal ───────────────────────────────────────────
function TaskModal({ projectId, task, onClose, onSaved }) {
  const [f, setF] = useState(task ? { title:task.title, description:task.description||'', status:task.status, priority:task.priority, dueDate:task.dueDate?.split('T')[0]||'' }
    : { title:'', description:'', status:'TODO', priority:'MEDIUM', dueDate:'' })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({...f, [k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (task) await projectsAPI.updateTask(projectId, task.id, f)
      else await projectsAPI.createTask(projectId, f)
      toast.success(task ? 'Task updated' : 'Task created'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title={task ? 'Edit Task' : 'Add Task'}>
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Title *</label><input className="input" required value={f.title} onChange={upd('title')} /></div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Status</label>
            <select className="select" value={f.status} onChange={upd('status')}>
              {['TODO','IN_PROGRESS','REVIEW','DONE','CANCELLED'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Priority</label>
            <select className="select" value={f.priority} onChange={upd('priority')}>
              {['LOW','MEDIUM','HIGH','CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Due Date</label><input type="date" className="input" value={f.dueDate} onChange={upd('dueDate')} /></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={upd('description')} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : task ? 'Update Task' : 'Add Task'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Risk Modal ───────────────────────────────────────────
function RiskModal({ projectId, onClose, onSaved }) {
  const [f, setF] = useState({ title:'', description:'', level:'MEDIUM', mitigation:'', status:'OPEN' })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await projectsAPI.createRisk(projectId, f); toast.success('Risk logged'); onSaved() }
    catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title="Log Risk">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Title *</label><input className="input" required value={f.title} onChange={upd('title')} /></div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Risk Level</label>
            <select className="select" value={f.level} onChange={upd('level')}>
              {['LOW','MEDIUM','HIGH','CRITICAL'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Status</label>
            <select className="select" value={f.status} onChange={upd('status')}>
              {['OPEN','MITIGATED','CLOSED','ACCEPTED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={upd('description')} /></div>
        <div className="form-group"><label className="label">Mitigation Plan</label><textarea className="input min-h-[70px] resize-none" value={f.mitigation} onChange={upd('mitigation')} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Log Risk'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Material Consumption Modal ───────────────────────────
function MaterialModal({ projectId, onClose, onSaved }) {
  const [f, setF] = useState({ inventoryItemId:'', quantityUsed:'', notes:'' })
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { inventoryAPI.getItems({ limit:200 }).then(r => setItems(r.data.data.items||[])) }, [])

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const res = await projectsAPI.consumeMaterial(projectId, { ...f, quantityUsed: parseFloat(f.quantityUsed) })
      toast.success('Material consumed')
      if (res.data.data.lowStockAlert) toast.error(`⚠️ Low stock alert for ${res.data.data.item?.name}!`)
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  const selected = items.find(i => i.id === f.inventoryItemId)

  return (
    <Modal open={true} onClose={onClose} title="Consume Material">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group">
          <label className="label">Inventory Item *</label>
          <select className="select" required value={f.inventoryItemId} onChange={e => setF({...f, inventoryItemId:e.target.value})}>
            <option value="">Select item...</option>
            {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.sku}) — {number(it.currentStock)} {it.unit} available</option>)}
          </select>
        </div>
        {selected && (
          <div className="p-3 bg-surface-750 rounded-lg border border-surface-600 text-xs text-zinc-400">
            Current Stock: <span className="font-mono font-semibold text-zinc-200">{number(selected.currentStock)} {selected.unit}</span>
            &nbsp;· Avg Cost: <span className="font-mono text-zinc-300">{currency(selected.averageCost)}/{selected.unit}</span>
            &nbsp;· Est. Total: <span className="font-mono text-brand-400">{currency((parseFloat(f.quantityUsed)||0) * selected.averageCost)}</span>
          </div>
        )}
        <div className="form-group">
          <label className="label">Quantity *</label>
          <input type="number" className="input" required min={0.01} step={0.01}
            max={selected?.currentStock} value={f.quantityUsed} onChange={e => setF({...f, quantityUsed:e.target.value})} />
        </div>
        <div className="form-group"><label className="label">Notes</label><textarea className="input min-h-[70px] resize-none" value={f.notes} onChange={e => setF({...f, notes:e.target.value})} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary"><Package className="w-4 h-4" /> {saving ? 'Processing...' : 'Consume'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Communication Modal ──────────────────────────────────
function CommModal({ projectId, onClose, onSaved }) {
  const [f, setF] = useState({ subject:'', message:'', recipients:'' })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await projectsAPI.createCommunication(projectId, f); toast.success('Communication logged'); onSaved() }
    catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title="Log Communication">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Subject *</label><input className="input" required value={f.subject} onChange={upd('subject')} /></div>
        <div className="form-group"><label className="label">Message *</label><textarea className="input min-h-[100px] resize-none" required value={f.message} onChange={upd('message')} /></div>
        <div className="form-group"><label className="label">Recipients</label><input className="input" placeholder="email1@hotel.com, email2@hotel.com" value={f.recipients} onChange={upd('recipients')} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Log Communication'}</button>
        </div>
      </form>
    </Modal>
  )
}
