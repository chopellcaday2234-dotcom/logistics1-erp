// src/pages/mro/MRO.jsx — 100% Complete
import { useState, useEffect } from 'react'
import { mroAPI, assetsAPI, inventoryAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Badge, StatCard, Modal, EmptyState, Pagination, PageLoader, currency, number } from '../../components/ui'
import { Wrench, Plus, Clock, CheckCircle2, AlertTriangle, Search, Eye, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH') : '—'
const PRIORITY_BORDER = { LOW:'border-l-zinc-500', MEDIUM:'border-l-blue-500', HIGH:'border-l-amber-500', CRITICAL:'border-l-red-500' }

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-surface-600 flex-wrap mb-4">
      {tabs.map((t,i)=>(
        <button key={t} onClick={()=>onChange(i)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${active===i?'bg-brand-500 text-surface-900':'text-zinc-400 hover:text-zinc-200'}`}>{t}</button>
      ))}
    </div>
  )
}

export default function MRO() {
  const { isManagerOrAbove } = useAuth()
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = () => setReload(r=>r+1)

  if (view==='detail') return <WODetail id={selectedId} onBack={()=>setView('list')} onRefresh={refresh} isManager={isManagerOrAbove()}/>

  return (
    <WOList
      reload={reload}
      onView={id=>{setSelectedId(id);setView('detail')}}
      isManager={isManagerOrAbove()}
      showCreate={showCreate} setShowCreate={setShowCreate}
      onCreated={refresh}
    />
  )
}

// ─── Work Order List ──────────────────────────────────────
function WOList({ reload, onView, isManager, showCreate, setShowCreate, onCreated }) {
  const [workOrders, setWorkOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [w, s] = await Promise.all([
        mroAPI.getWorkOrders({ page, limit:12, search, status:statusFilter||undefined, type:typeFilter||undefined }),
        isManager ? mroAPI.getStats() : Promise.resolve(null),
      ])
      setWorkOrders(w.data.data.workOrders)
      setPagination(w.data.data.pagination)
      if (s) setStats(s.data.data.stats)
    } catch {} finally { setLoading(false) }
  }
  useEffect(()=>{load()},[page,search,statusFilter,typeFilter,reload])

  const quickAction = async (action, id, data={}) => {
    try {
      if (action==='open') await mroAPI.openWO(id)
      if (action==='start') await mroAPI.startWO(id)
      if (action==='cancel') await mroAPI.cancelWO(id, data)
      toast.success('Done'); load()
    } catch {}
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">MRO — Maintenance, Repair & Operations</h1><p className="text-xs text-zinc-500 mt-1">Work Orders · Parts · Maintenance Logs</p></div>
        <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/> New Work Order</button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Open WOs" icon={Wrench} value={(stats.byStatus?.OPEN||0)+(stats.byStatus?.IN_PROGRESS||0)+(stats.byStatus?.ON_HOLD||0)}/>
          <StatCard label="In Progress" icon={Clock} color="text-amber-400" value={stats.byStatus?.IN_PROGRESS||0}/>
          <StatCard label="Overdue" icon={AlertTriangle} color="text-red-400" value={stats.overdueCount||0}/>
          <StatCard label="Completed (30d)" icon={CheckCircle2} color="text-emerald-400" value={stats.completedThisMonth||0}
            sub={`Avg ${stats.avgCompletionHours}h per WO`}/>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"/>
          <input className="input pl-9" placeholder="Search work orders..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
        </div>
        <select className="select w-44" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}>
          <option value="">All Statuses</option>
          {['DRAFT','OPEN','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'].map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <select className="select w-40" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1)}}>
          <option value="">All Types</option>
          {['CORRECTIVE','PREVENTIVE','EMERGENCY','INSPECTION'].map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <PageLoader/> : (
        <div className="space-y-3">
          {!workOrders.length && <EmptyState icon={Wrench} title="No work orders" message="Create a work order to start tracking maintenance."/>}
          {workOrders.map(wo=>(
            <div key={wo.id} className={`card p-4 border-l-4 ${PRIORITY_BORDER[wo.priority]||'border-l-zinc-600'} ${wo.isOverdue?'bg-red-500/5':''}`}>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-zinc-500">{wo.woNumber}</span>
                    <Badge value={wo.type}/>
                    <Badge value={wo.priority}/>
                    <Badge value={wo.status}/>
                    {wo.isOverdue && <span className="badge badge-red">OVERDUE</span>}
                  </div>
                  <p className="font-semibold text-zinc-100">{wo.title}</p>
                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-zinc-500">
                    {wo.asset && <span>📍 {wo.asset.assetCode} — {wo.asset.name}</span>}
                    {wo.assignedTo && <span>👤 {wo.assignedTo.firstName} {wo.assignedTo.lastName}</span>}
                    {wo.dueDate && <span className={wo.isOverdue?'text-red-400':''}>📅 Due: {fmt(wo.dueDate)}</span>}
                    <span>🔩 {wo._count?.partsUsed||0} parts · 📋 {wo._count?.maintenanceLogs||0} logs</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap items-start">
                  <button onClick={()=>onView(wo.id)} className="btn-ghost btn-sm"><Eye className="w-3 h-3"/> View</button>
                  {wo.status==='DRAFT' && <button onClick={()=>quickAction('open',wo.id)} className="btn-secondary btn-sm">Open</button>}
                  {wo.status==='OPEN' && <button onClick={()=>quickAction('start',wo.id)} className="btn-secondary btn-sm">Start</button>}
                  {wo.totalCost > 0 && <span className="font-mono text-sm text-zinc-400 self-center">{currency(wo.totalCost)}</span>}
                </div>
              </div>
            </div>
          ))}
          <Pagination pagination={pagination} onPageChange={setPage}/>
        </div>
      )}

      <CreateWOModal open={showCreate} onClose={()=>setShowCreate(false)} onSaved={()=>{load();onCreated()}}/>
    </div>
  )
}

// ─── Work Order Detail Page ───────────────────────────────
function WODetail({ id, onBack, onRefresh, isManager }) {
  const { user } = useAuth()
  const [wo, setWo] = useState(null)
  const [logs, setLogs] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [showHold, setShowHold] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showPart, setShowPart] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [w, l, p] = await Promise.all([mroAPI.getWorkOrder(id), mroAPI.getLogs(id), mroAPI.getParts(id)])
      setWo(w.data.data.workOrder)
      setLogs(l.data.data.logs||[])
      setParts(p.data.data.parts||[])
    } catch {} finally { setLoading(false) }
  }
  useEffect(()=>{load()},[id])

  const quickAction = async (action, data={}) => {
    try {
      if (action==='open') await mroAPI.openWO(id)
      if (action==='start') await mroAPI.startWO(id)
      if (action==='cancel') await mroAPI.cancelWO(id, data)
      toast.success('Done'); load(); onRefresh()
    } catch {}
  }

  const removePart = async (partId) => {
    try { await mroAPI.removePart(id, partId); toast.success('Part removed — inventory restored'); load() } catch {}
  }

  if (loading) return <PageLoader/>
  if (!wo) return <div className="text-zinc-500 p-8 text-center">Work order not found.</div>

  const canEdit = !['COMPLETED','CANCELLED'].includes(wo.status)
  const canComplete = wo.status === 'IN_PROGRESS'
  const canStart = wo.status === 'OPEN'
  const canOpen = wo.status === 'DRAFT'
  const canHold = wo.status === 'IN_PROGRESS'
  const canResume = wo.status === 'ON_HOLD'

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center mt-0.5">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{wo.woNumber}</h1>
              <Badge value={wo.type}/><Badge value={wo.priority}/><Badge value={wo.status}/>
              {wo.isOverdue && <span className="badge badge-red">OVERDUE</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{wo.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canOpen && <button onClick={()=>quickAction('open')} className="btn-secondary">Open WO</button>}
          {canStart && <button onClick={()=>quickAction('start')} className="btn-secondary">Start Work</button>}
          {canResume && <button onClick={()=>quickAction('start')} className="btn-secondary">Resume</button>}
          {canHold && <button onClick={()=>setShowHold(true)} className="btn-secondary">Hold</button>}
          {canComplete && <button onClick={()=>setShowComplete(true)} className="btn-primary"><CheckCircle2 className="w-4 h-4"/> Complete</button>}
          {canEdit && !canComplete && <button onClick={()=>quickAction('cancel',{reason:'Cancelled by user'})} className="btn-danger">Cancel</button>}
          <button onClick={load} className="btn-ghost p-2"><RefreshCw className="w-4 h-4"/></button>
        </div>
      </div>

      {wo.safetyNotes && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
          ⚠️ Safety: {wo.safetyNotes}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">WO Details</p>
            {[
              ['Type', <Badge value={wo.type}/>],
              ['Priority', <Badge value={wo.priority}/>],
              ['Status', <Badge value={wo.status}/>],
              ['Created By', `${wo.createdBy?.firstName} ${wo.createdBy?.lastName}`],
              ['Assigned To', wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : null],
              ['Start Date', fmt(wo.startDate)],
              ['Due Date', wo.dueDate ? <span className={wo.isOverdue?'text-red-400 font-bold':''} >{fmt(wo.dueDate)}</span> : null],
              ['Est. Hours', wo.estimatedHours ? `${wo.estimatedHours}h` : null],
              ['Actual Hours', wo.actualHours ? `${wo.actualHours}h` : null],
              ['Completed', fmt(wo.completedDate)],
            ].map(([l,v])=>v!==null&&v!==undefined?(
              <div key={l} className="flex justify-between py-2 border-b border-surface-700/40 last:border-0">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">{l}</span>
                <span className="text-sm text-zinc-200">{v}</span>
              </div>
            ):null)}
          </div>
          {wo.asset && (
            <div className="card p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Asset</p>
              <p className="font-semibold text-zinc-200">{wo.asset.name}</p>
              <p className="text-xs font-mono text-zinc-500 mt-0.5">{wo.asset.assetCode}</p>
              <p className="text-xs text-zinc-500 mt-1">{wo.asset.location}</p>
              <div className="flex gap-2 mt-2"><Badge value={wo.asset.status}/><Badge value={wo.asset.condition}/></div>
            </div>
          )}
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Cost Summary</p>
            <div className="space-y-1">
              {[['Parts Cost',currency(wo.partsCost||0)],['Labor Cost',currency(wo.laborCost||0)],].map(([l,v])=>(
                <div key={l} className="flex justify-between py-1"><span className="text-sm text-zinc-500">{l}</span><span className="font-mono text-sm text-zinc-300">{v}</span></div>
              ))}
              <div className="flex justify-between py-2 border-t border-surface-600 mt-1">
                <span className="font-semibold text-zinc-400">Total</span>
                <span className="font-mono font-bold text-lg text-brand-400">{currency(wo.totalCost||0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <TabBar tabs={[`Maintenance Logs (${logs.length})`,`Parts Used (${parts.length})`,'Completion Notes']} active={tab} onChange={setTab}/>

          {/* Logs */}
          {tab===0 && (
            <div>
              {canEdit && (
                <button onClick={()=>setShowLog(true)} className="btn-primary btn-sm mb-3"><Plus className="w-3 h-3"/> Add Log Entry</button>
              )}
              <div className="space-y-2">
                {!logs.length && <EmptyState title="No maintenance logs" message="Add logs to document what was done."/>}
                {logs.map(log=>(
                  <div key={log.id} className="card p-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-zinc-500">{fmt(log.logDate)}</span>
                      {log.hoursSpent && <span className="text-xs text-zinc-400 font-mono">{log.hoursSpent}h</span>}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed">{log.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parts */}
          {tab===1 && (
            <div>
              {canEdit && (
                <button onClick={()=>setShowPart(true)} className="btn-primary btn-sm mb-3"><Plus className="w-3 h-3"/> Add Part</button>
              )}
              <div className="space-y-2">
                {!parts.length && <EmptyState title="No parts used" message="Add parts to track inventory consumption and costs."/>}
                {parts.map(part=>(
                  <div key={part.id} className="card p-4 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-zinc-200">{part.partName}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{number(part.quantity)} × {currency(part.unitCost)} = {currency(part.totalCost)}</p>
                      {part.notes && <p className="text-xs text-zinc-600 mt-0.5">{part.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-zinc-100">{currency(part.totalCost)}</span>
                      {canEdit && <button onClick={()=>removePart(part.id)} className="btn-danger btn-sm text-xs">Remove</button>}
                    </div>
                  </div>
                ))}
                {parts.length > 0 && (
                  <div className="flex justify-end mt-2">
                    <span className="text-sm font-mono">Parts Total: <span className="font-bold text-brand-400">{currency(parts.reduce((s,p)=>s+p.totalCost,0))}</span></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Completion Notes */}
          {tab===2 && (
            <div className="card p-5">
              {wo.completionNotes
                ? <><p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Completion Notes</p><p className="text-sm text-zinc-200 leading-relaxed">{wo.completionNotes}</p></>
                : <EmptyState title="No completion notes yet" message="Notes will appear here when the work order is completed."/>}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showComplete && <CompleteWOModal wo={wo} onClose={()=>setShowComplete(false)} onSaved={()=>{setShowComplete(false);load();onRefresh()}}/>}
      {showHold && <HoldWOModal woId={id} onClose={()=>setShowHold(false)} onSaved={()=>{setShowHold(false);load()}}/>}
      {showLog && <AddLogModal woId={id} onClose={()=>setShowLog(false)} onSaved={()=>{setShowLog(false);load()}}/>}
      {showPart && <AddPartModal wo={wo} onClose={()=>setShowPart(false)} onSaved={()=>{setShowPart(false);load()}}/>}
    </div>
  )
}

// ─── Create WO Modal ──────────────────────────────────────
function CreateWOModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ title:'', description:'', type:'CORRECTIVE', priority:'MEDIUM', assetId:'', assignedToId:'', startDate:'', dueDate:'', estimatedHours:'', safetyNotes:'' })
  const [assets, setAssets] = useState([])
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})

  useEffect(()=>{
    if (open) {
      assetsAPI.getAssets({ limit:200 }).then(r=>setAssets(r.data.data.assets||[]))
      import('../../api/client').then(({authAPI})=>authAPI.getUsers({limit:50}).then(r=>setUsers(r.data.data?.users||[])).catch(()=>{}))
    }
  },[open])

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await mroAPI.createWorkOrder({ ...f, estimatedHours:f.estimatedHours?parseFloat(f.estimatedHours):null, assetId:f.assetId||null, assignedToId:f.assignedToId||null, startDate:f.startDate||null, dueDate:f.dueDate||null })
      toast.success('Work order created'); onSaved(); onClose()
      setF({ title:'', description:'', type:'CORRECTIVE', priority:'MEDIUM', assetId:'', assignedToId:'', startDate:'', dueDate:'', estimatedHours:'', safetyNotes:'' })
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Work Order" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Title *</label><input className="input" required placeholder="Describe the work required..." value={f.title} onChange={upd('title')}/></div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Type</label>
            <select className="select" value={f.type} onChange={upd('type')}>
              {['CORRECTIVE','PREVENTIVE','EMERGENCY','INSPECTION'].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Priority</label>
            <select className="select" value={f.priority} onChange={upd('priority')}>
              {['LOW','MEDIUM','HIGH','CRITICAL'].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Asset</label>
            <select className="select" value={f.assetId} onChange={upd('assetId')}>
              <option value="">No asset / General</option>
              {assets.filter(a=>!['RETIRED','DISPOSED'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Assign To</label>
            <select className="select" value={f.assignedToId} onChange={upd('assignedToId')}>
              <option value="">Unassigned</option>
              {users.filter(u=>['TECHNICIAN','MANAGER','ADMIN'].includes(u.role)).map(u=><option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Start Date</label><input type="date" className="input" value={f.startDate} onChange={upd('startDate')}/></div>
          <div className="form-group"><label className="label">Due Date</label><input type="date" className="input" value={f.dueDate} onChange={upd('dueDate')}/></div>
          <div className="form-group"><label className="label">Est. Hours</label><input type="number" className="input" min={0} step={0.5} value={f.estimatedHours} onChange={upd('estimatedHours')}/></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={upd('description')}/></div>
        <div className="form-group">
          <label className="label">Safety Notes</label>
          <textarea className="input min-h-[60px] resize-none" placeholder="PPE requirements, lockout procedures..." value={f.safetyNotes} onChange={upd('safetyNotes')}/>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating...':'Create Work Order'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Complete WO Modal ────────────────────────────────────
function CompleteWOModal({ wo, onClose, onSaved }) {
  const [f, setF] = useState({ completionNotes:'', actualHours:'', laborCost:'', advanceSchedule:true })
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await mroAPI.completeWO(wo.id, { ...f, actualHours:parseFloat(f.actualHours), laborCost:parseFloat(f.laborCost||0) })
      toast.success('Work order completed!')
      onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title={`Complete — ${wo.woNumber}`}>
      <form onSubmit={save} className="space-y-4">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
          ✓ Completing this WO will restore the linked asset to ACTIVE status{wo.scheduleId?' and advance the maintenance schedule':''}
        </div>
        <div className="form-group">
          <label className="label">Completion Notes *</label>
          <textarea className="input min-h-[100px] resize-none" required placeholder="Describe what was done, test results, parts used..." value={f.completionNotes} onChange={e=>setF({...f,completionNotes:e.target.value})}/>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Actual Hours *</label><input type="number" className="input" required min={0.1} step={0.5} placeholder="3.5" value={f.actualHours} onChange={e=>setF({...f,actualHours:e.target.value})}/></div>
          <div className="form-group"><label className="label">Labor Cost (₱)</label><input type="number" className="input" min={0} placeholder="1200" value={f.laborCost} onChange={e=>setF({...f,laborCost:e.target.value})}/></div>
        </div>
        {wo.scheduleId && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
            <input type="checkbox" checked={f.advanceSchedule} onChange={e=>setF({...f,advanceSchedule:e.target.checked})}/>
            Advance maintenance schedule next due date
          </label>
        )}
        {wo.partsCost > 0 && <p className="text-xs text-zinc-500">Parts cost already recorded: {currency(wo.partsCost)}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary"><CheckCircle2 className="w-4 h-4"/> {saving?'Completing...':'Mark Completed'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Hold WO Modal ────────────────────────────────────────
function HoldWOModal({ woId, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await mroAPI.holdWO(woId, { reason }); toast.success('Work order on hold'); onSaved() }
    catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title="Place On Hold">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Reason *</label><textarea className="input min-h-[80px] resize-none" required placeholder="Waiting for parts delivery, schedule conflict..." value={reason} onChange={e=>setReason(e.target.value)}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving...':'Place On Hold'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Add Log Modal ────────────────────────────────────────
function AddLogModal({ woId, onClose, onSaved }) {
  const [f, setF] = useState({ description:'', hoursSpent:'' })
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await mroAPI.addLog(woId, { ...f, hoursSpent:f.hoursSpent?parseFloat(f.hoursSpent):null })
      toast.success('Log entry added'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title="Add Maintenance Log">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group"><label className="label">Description *</label><textarea className="input min-h-[100px] resize-none" required placeholder="Describe what was observed, done, or measured..." value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
        <div className="form-group"><label className="label">Hours Spent</label><input type="number" className="input" min={0} step={0.5} value={f.hoursSpent} onChange={e=>setF({...f,hoursSpent:e.target.value})}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Adding...':'Add Log Entry'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Add Part Modal ───────────────────────────────────────
function AddPartModal({ wo, onClose, onSaved }) {
  const [f, setF] = useState({ inventoryItemId:'', partName:'', quantity:'', unitCost:'', notes:'' })
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})

  useEffect(()=>{ inventoryAPI.getItems({ limit:200 }).then(r=>setItems(r.data.data.items||[])) },[])

  const selectedItem = items.find(i=>i.id===f.inventoryItemId)
  const handleItemSelect = (e) => {
    const item = items.find(i=>i.id===e.target.value)
    setF({ ...f, inventoryItemId:e.target.value, partName:item?.name||f.partName, unitCost:item?String(item.averageCost):f.unitCost })
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await mroAPI.addPart(wo.id, { ...f, quantity:parseFloat(f.quantity), unitCost:parseFloat(f.unitCost), inventoryItemId:f.inventoryItemId||null })
      toast.success('Part added')
      if (f.inventoryItemId) toast.success('Inventory stock updated automatically')
      onSaved()
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add Part / Material Used">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group">
          <label className="label">Inventory Item (optional)</label>
          <select className="select" value={f.inventoryItemId} onChange={handleItemSelect}>
            <option value="">Non-stock / external part</option>
            {items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku}) — {number(i.currentStock)} {i.unit} available</option>)}
          </select>
        </div>
        {selectedItem && (
          <div className="p-3 bg-surface-750 rounded-lg text-xs text-zinc-400">
            Stock: <span className="font-mono text-zinc-200">{number(selectedItem.currentStock)} {selectedItem.unit}</span> ·
            Avg cost: <span className="font-mono text-zinc-200">{currency(selectedItem.averageCost)}/{selectedItem.unit}</span>
          </div>
        )}
        <div className="form-group"><label className="label">Part Name *</label><input className="input" required placeholder="HVAC Filter 16x20, Bearing Set..." value={f.partName} onChange={upd('partName')}/></div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Quantity *</label><input type="number" className="input" required min={0.01} step={0.01} value={f.quantity} onChange={upd('quantity')}/></div>
          <div className="form-group"><label className="label">Unit Cost (₱) *</label><input type="number" className="input" required min={0} step={0.01} value={f.unitCost} onChange={upd('unitCost')}/></div>
        </div>
        {f.quantity && f.unitCost && (
          <p className="text-sm text-zinc-400">Total: <span className="font-mono font-bold text-brand-400">{currency(parseFloat(f.quantity)*parseFloat(f.unitCost))}</span></p>
        )}
        <div className="form-group"><label className="label">Notes</label><input className="input" placeholder="OEM part, sourced locally..." value={f.notes} onChange={upd('notes')}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Adding...':'Add Part'}</button>
        </div>
      </form>
    </Modal>
  )
}
