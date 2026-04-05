// src/pages/assets/Assets.jsx — 100% Complete
import { useState, useEffect } from 'react'
import { assetsAPI, inventoryAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Badge, StatCard, Modal, EmptyState, Pagination, PageLoader, currency } from '../../components/ui'
import { Cpu, Plus, Wrench, AlertTriangle, CheckCircle2, Search, RefreshCw, ChevronRight, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH') : '—'
const TRANSITIONS = { ACTIVE:['UNDER_MAINTENANCE','RETIRED','LOST'], UNDER_MAINTENANCE:['ACTIVE','RETIRED'], RETIRED:['DISPOSED'], LOST:['ACTIVE'], DISPOSED:[] }

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
function DR({ label, value }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-surface-700/40 last:border-0">
      <span className="text-xs text-zinc-500 uppercase tracking-wide shrink-0 mr-4">{label}</span>
      <span className="text-sm text-zinc-200 text-right">{value??'—'}</span>
    </div>
  )
}

export default function Assets() {
  const { isManagerOrAbove } = useAuth()
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showConvert, setShowConvert] = useState(false)
  const [showCreateSchedule, setShowCreateSchedule] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = () => setReload(r=>r+1)

  if (view==='detail') return <AssetDetail id={selectedId} onBack={()=>setView('list')} onRefresh={refresh} />

  return (
    <AssetList
      reload={reload}
      onView={id=>{setSelectedId(id);setView('detail')}}
      isManager={isManagerOrAbove()}
      showCreate={showCreate} setShowCreate={setShowCreate}
      showConvert={showConvert} setShowConvert={setShowConvert}
      showCreateSchedule={showCreateSchedule} setShowCreateSchedule={setShowCreateSchedule}
      onCreated={refresh}
    />
  )
}

// ─── Asset List ───────────────────────────────────────────
function AssetList({ reload, onView, isManager, showCreate, setShowCreate, showConvert, setShowConvert, showCreateSchedule, setShowCreateSchedule, onCreated }) {
  const [tab, setTab] = useState(0)
  const [assets, setAssets] = useState([])
  const [schedules, setSchedules] = useState([])
  const [stats, setStats] = useState(null)
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [a, s, st] = await Promise.all([
        assetsAPI.getAssets({ page, limit:15, search }),
        assetsAPI.getSchedules({ page, limit:15, overdue: tab===2 ? 'true' : undefined }),
        assetsAPI.getStats(),
      ])
      setAssets(a.data.data.assets)
      setSchedules(s.data.data.schedules)
      setStats(st.data.data.stats)
      setPagination(tab===1 ? s.data.data.pagination : a.data.data.pagination)
    } catch {} finally { setLoading(false) }
  }
  useEffect(()=>{load()},[page,search,tab,reload])

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">Asset Management</h1><p className="text-xs text-zinc-500 mt-1">Lifecycle · Maintenance · Schedules</p></div>
        {isManager && (
          <div className="flex gap-2">
            <button onClick={()=>setShowCreateSchedule(true)} className="btn-secondary"><Wrench className="w-4 h-4"/> Schedule</button>
            <button onClick={()=>setShowConvert(true)} className="btn-secondary"><Cpu className="w-4 h-4"/> Convert</button>
            <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/> New Asset</button>
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Assets" icon={Cpu} value={stats.totalAssets}/>
          <StatCard label="Under Maintenance" icon={Wrench} color="text-purple-400" value={stats.byStatus?.UNDER_MAINTENANCE||0}/>
          <StatCard label="Maintenance Overdue" icon={AlertTriangle} color="text-red-400" value={stats.maintenance?.overdue||0}/>
          <StatCard label="Current Value" icon={CheckCircle2} color="text-emerald-400" value={currency(stats.totalCurrentValue)}/>
        </div>
      )}

      <TabBar tabs={['Assets','Schedules','Overdue','Analytics']} active={tab} onChange={i=>{setTab(i);setPage(1)}} />

      {tab<3 && (
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"/>
          <input className="input pl-9" placeholder="Search..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
        </div>
      )}

      {loading ? <PageLoader/> : (
        <>
          {/* Assets tab */}
          {tab===0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Location</th><th>Condition</th><th>Status</th><th>Next Maint.</th><th></th></tr></thead>
                <tbody>
                  {!assets.length ? <tr><td colSpan={8}><EmptyState title="No assets" message="Create or convert inventory items to assets."/></td></tr>
                  : assets.map(a=>(
                    <tr key={a.id} className={a.maintenanceOverdue?'bg-red-500/5':''}>
                      <td><span className="font-mono text-xs">{a.assetCode}</span></td>
                      <td><p className="font-medium text-zinc-200">{a.name}</p><p className="text-xs text-zinc-500">{a.manufacturer} {a.model}</p></td>
                      <td><span className="text-xs text-zinc-400">{a.category}</span></td>
                      <td><span className="text-xs text-zinc-400">{a.location||'—'}</span></td>
                      <td><Badge value={a.condition}/></td>
                      <td><Badge value={a.status}/></td>
                      <td>
                        {a.nextMaintenance
                          ? <span className={`text-xs font-mono ${a.maintenanceOverdue?'text-red-400 font-bold':a.maintenanceDueSoon?'text-amber-400':'text-zinc-400'}`}>
                              {fmt(a.nextMaintenance)}{a.maintenanceOverdue?' ⚠️':''}
                            </span>
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td>
                        <button onClick={()=>onView(a.id)} className="btn-ghost btn-sm"><Eye className="w-3 h-3"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage}/>
            </div>
          )}

          {/* Schedules tab */}
          {tab===1 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Asset</th><th>Schedule</th><th>Frequency</th><th>Last Done</th><th>Next Due</th><th>Status</th></tr></thead>
                <tbody>
                  {!schedules.length ? <tr><td colSpan={6}><EmptyState title="No schedules"/></td></tr>
                  : schedules.map(s=>(
                    <tr key={s.id} className={s.isOverdue?'bg-red-500/5':''}>
                      <td><p className="font-mono text-xs">{s.asset?.assetCode}</p><p className="text-xs text-zinc-500">{s.asset?.name}</p></td>
                      <td><p className="text-sm text-zinc-200">{s.title}</p></td>
                      <td><span className="text-xs text-zinc-400">Every {s.frequencyDays}d</span></td>
                      <td><span className="text-xs text-zinc-400">{s.lastPerformed?fmt(s.lastPerformed):'Never'}</span></td>
                      <td>
                        <span className={`text-xs font-mono ${s.isOverdue?'text-red-400 font-bold':s.daysUntilDue<=7?'text-amber-400':'text-zinc-400'}`}>
                          {fmt(s.nextDue)} {s.isOverdue?`(${Math.abs(s.daysUntilDue)}d overdue)`:s.daysUntilDue<=7?`(${s.daysUntilDue}d)`:''}
                        </span>
                      </td>
                      <td><Badge value={s.isActive?'ACTIVE':'INACTIVE'}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage}/>
            </div>
          )}

          {/* Overdue tab */}
          {tab===2 && (
            <div className="space-y-3">
              {!schedules.length && <EmptyState icon={CheckCircle2} title="No overdue maintenance!" message="All schedules are up to date." />}
              {schedules.filter(s=>s.isOverdue).map(s=>(
                <div key={s.id} className="card p-4 border-l-4 border-l-red-500">
                  <div className="flex justify-between">
                    <div>
                      <div className="flex gap-2 items-center mb-1">
                        <span className="font-mono text-xs text-zinc-500">{s.asset?.assetCode}</span>
                        <Badge value={s.asset?.status}/>
                      </div>
                      <p className="font-semibold text-zinc-200">{s.title}</p>
                      <p className="text-sm text-zinc-400">{s.asset?.name} · {s.asset?.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 font-bold text-lg">{Math.abs(s.daysUntilDue)}d</p>
                      <p className="text-xs text-red-400">overdue</p>
                      <p className="text-xs text-zinc-500 mt-1">Due: {fmt(s.nextDue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Analytics tab */}
          {tab===3 && stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="card p-5">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">By Status</p>
                {Object.entries(stats.byStatus||{}).map(([s,c])=>(
                  <div key={s} className="flex justify-between items-center py-2 border-b border-surface-700/40 last:border-0">
                    <Badge value={s}/><span className="font-bold text-zinc-100 font-mono">{c}</span>
                  </div>
                ))}
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">By Condition</p>
                {Object.entries(stats.byCondition||{}).map(([c,n])=>(
                  <div key={c} className="flex justify-between items-center py-2 border-b border-surface-700/40 last:border-0">
                    <Badge value={c}/><span className="font-bold text-zinc-100 font-mono">{n}</span>
                  </div>
                ))}
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Financials</p>
                {[
                  ['Purchase Cost', currency(stats.totalPurchaseCost)],
                  ['Current Value', currency(stats.totalCurrentValue)],
                  ['Depreciation', currency(stats.depreciationValue)],
                  ['Warranty Expiring (30d)', stats.warrantyExpiringSoon],
                  ['Maintenance Due Soon', stats.maintenance?.dueSoon],
                  ['Maintenance Overdue', stats.maintenance?.overdue],
                ].map(([l,v])=>(
                  <div key={l} className="flex justify-between py-2 border-b border-surface-700/40 last:border-0">
                    <span className="text-xs text-zinc-500">{l}</span>
                    <span className="text-sm font-mono text-zinc-200">{v??'—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreateAssetModal open={showCreate} onClose={()=>setShowCreate(false)} onSaved={()=>{load();onCreated()}}/>
      <ConvertBatchModal open={showConvert} onClose={()=>setShowConvert(false)} onSaved={()=>{load();onCreated()}}/>
      <CreateScheduleModal open={showCreateSchedule} assets={assets} onClose={()=>setShowCreateSchedule(false)} onSaved={()=>{load();onCreated()}}/>
    </div>
  )
}

// ─── Asset Detail Page ────────────────────────────────────
function AssetDetail({ id, onBack, onRefresh }) {
  const { isManagerOrAbove } = useAuth()
  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showStatus, setShowStatus] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [statusForm, setStatusForm] = useState({ status:'', reason:'' })

  const load = async () => {
    setLoading(true)
    try { const r = await assetsAPI.getAsset(id); setAsset(r.data.data.asset) } catch {}
    setLoading(false)
  }
  useEffect(()=>{load()},[id])

  const handleStatusChange = async (e) => {
    e.preventDefault()
    try {
      await assetsAPI.changeStatus(id, statusForm)
      toast.success(`Status → ${statusForm.status}`)
      setShowStatus(false)
      load(); onRefresh()
    } catch {}
  }

  const handleAdvanceSchedule = async (scheduleId) => {
    try {
      await assetsAPI.advanceSchedule(scheduleId, { completedDate: new Date().toISOString() })
      toast.success('Schedule advanced — next due updated')
      load()
    } catch {}
  }

  if (loading) return <PageLoader/>
  if (!asset) return <div className="text-zinc-500 p-8 text-center">Asset not found.</div>

  const nextStatuses = TRANSITIONS[asset.status] || []
  const isManager = isManagerOrAbove()

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center mt-0.5">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{asset.name}</h1>
              <Badge value={asset.status}/>
              <Badge value={asset.condition}/>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{asset.assetCode} · {asset.category} · {asset.location||'No location'}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isManager && nextStatuses.length>0 && (
            <button onClick={()=>{setStatusForm({status:nextStatuses[0],reason:''});setShowStatus(true)}} className="btn-secondary">
              Change Status
            </button>
          )}
          <button onClick={()=>setShowLog(true)} className="btn-secondary">Add Log</button>
          {isManager && <button onClick={()=>setShowSchedule(true)} className="btn-primary">+ Schedule</button>}
          <button onClick={load} className="btn-ghost p-2"><RefreshCw className="w-4 h-4"/></button>
        </div>
      </div>

      {/* Alert banners */}
      {asset.maintenanceOverdue && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-semibold">
          ⚠️ Maintenance is OVERDUE — Last performed: {asset.lastMaintenance ? fmt(asset.lastMaintenance) : 'Never'}
        </div>
      )}
      {asset.warrantyExpired && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          ⚠️ Warranty expired: {fmt(asset.warrantyExpiry)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: info */}
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Asset Info</p>
            <DR label="Code" value={<span className="font-mono">{asset.assetCode}</span>}/>
            <DR label="Category" value={asset.category}/>
            <DR label="Location" value={asset.location}/>
            <DR label="Department" value={asset.department}/>
            <DR label="Manufacturer" value={asset.manufacturer}/>
            <DR label="Model" value={asset.model}/>
            <DR label="Serial Number" value={asset.serialNumber}/>
            <DR label="Purchase Date" value={fmt(asset.purchaseDate)}/>
            <DR label="Purchase Cost" value={asset.purchaseCost ? currency(asset.purchaseCost) : null}/>
            <DR label="Current Value" value={asset.currentValue ? currency(asset.currentValue) : null}/>
            <DR label="Warranty Expiry" value={fmt(asset.warrantyExpiry)}/>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Maintenance</p>
            <DR label="Last Maintenance" value={fmt(asset.lastMaintenance)}/>
            <DR label="Next Due" value={<span className={asset.maintenanceOverdue?'text-red-400 font-bold':asset.maintenanceDueSoon?'text-amber-400':'text-zinc-200'}>{fmt(asset.nextMaintenance)}</span>}/>
            <DR label="Total WO Cost" value={currency(asset.totalMaintenanceCost||0)}/>
            <DR label="Work Orders" value={asset.workOrderCount||0}/>
            {asset.inventoryItem && <DR label="Source Item" value={`${asset.inventoryItem.sku} — ${asset.inventoryItem.name}`}/>}
            {asset.batch && <DR label="Batch" value={<span className="font-mono text-xs">{asset.batch.batchNumber}</span>}/>}
          </div>
          {asset.notes && (
            <div className="card p-4">
              <p className="text-xs text-zinc-500 mb-1">Notes</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{asset.notes}</p>
            </div>
          )}
        </div>

        {/* Right column: tabs */}
        <div className="lg:col-span-2">
          <TabBar tabs={['Maintenance Schedules','Work Orders','Activity Log']} active={tab} onChange={setTab}/>

          {tab===0 && (
            <div className="space-y-3">
              {!asset.maintenanceSchedules?.length && <EmptyState icon={Wrench} title="No schedules" message="Add a maintenance schedule to track preventive maintenance."/>}
              {asset.maintenanceSchedules?.map(s=>(
                <div key={s.id} className={`card p-4 ${s.nextDue < new Date() ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-zinc-200">{s.title}</p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-zinc-500">
                        <span>Every {s.frequencyDays} days</span>
                        <span>Est: {s.estimatedHours||'—'}h</span>
                        <span>Last: {s.lastPerformed ? fmt(s.lastPerformed) : 'Never'}</span>
                        <span className={new Date(s.nextDue) < new Date() ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                          Next: {fmt(s.nextDue)}
                        </span>
                      </div>
                      {s.description && <p className="text-xs text-zinc-500 mt-2">{s.description}</p>}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Badge value={s.isActive?'ACTIVE':'INACTIVE'}/>
                      {s.isActive && isManager && (
                        <button onClick={()=>handleAdvanceSchedule(s.id)} className="btn-secondary btn-sm text-xs">
                          ✓ Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                  {s.workOrders?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-600">
                      <p className="text-xs text-zinc-500 mb-1">Recent Work Orders:</p>
                      {s.workOrders.slice(0,2).map(wo=>(
                        <div key={wo.id} className="flex justify-between text-xs py-1">
                          <span className="font-mono text-zinc-400">{wo.woNumber}</span>
                          <Badge value={wo.status}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab===1 && (
            <div className="space-y-2">
              {!asset.workOrders?.length && <EmptyState icon={Wrench} title="No work orders" message="Work orders linked to this asset will appear here."/>}
              {asset.workOrders?.map(wo=>(
                <div key={wo.id} className="card p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-zinc-500">{wo.woNumber}</span>
                      <Badge value={wo.type}/>
                      <Badge value={wo.status}/>
                    </div>
                    <p className="text-sm text-zinc-200">{wo.title}</p>
                    {wo.completedDate && <p className="text-xs text-zinc-500 mt-0.5">Completed: {fmt(wo.completedDate)}</p>}
                  </div>
                  {wo.totalCost > 0 && <span className="font-mono text-sm text-zinc-300 shrink-0">{currency(wo.totalCost)}</span>}
                </div>
              ))}
            </div>
          )}

          {tab===2 && (
            <div className="space-y-2">
              {!asset.assetLogs?.length && <EmptyState title="No activity logs"/>}
              {asset.assetLogs?.map(log=>(
                <div key={log.id} className="flex items-start gap-3 p-3 card">
                  <div className="w-2 h-2 bg-brand-500/60 rounded-full mt-2 shrink-0"/>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{log.action}</span>
                      <span className="text-xs text-zinc-600">{fmt(log.createdAt)}</span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-0.5">{log.description}</p>
                    {log.oldStatus && log.newStatus && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        <Badge value={log.oldStatus}/> → <Badge value={log.newStatus}/>
                      </p>
                    )}
                    {log.performedBy && <p className="text-xs text-zinc-600 mt-0.5">By: {log.performedBy}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status change modal */}
      <Modal open={showStatus} onClose={()=>setShowStatus(false)} title="Change Asset Status">
        <form onSubmit={handleStatusChange} className="space-y-4">
          <div className="form-group">
            <label className="label">New Status *</label>
            <select className="select" value={statusForm.status} onChange={e=>setStatusForm({...statusForm,status:e.target.value})}>
              <option value="">Select status...</option>
              {nextStatuses.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Reason *</label>
            <textarea className="input min-h-[80px] resize-none" required placeholder="Explain why..." value={statusForm.reason} onChange={e=>setStatusForm({...statusForm,reason:e.target.value})}/>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={()=>setShowStatus(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={!statusForm.status||!statusForm.reason} className="btn-primary">Confirm Change</button>
          </div>
        </form>
      </Modal>

      {/* Add log modal */}
      <Modal open={showLog} onClose={()=>setShowLog(false)} title="Add Activity Log">
        <LogForm assetId={id} onClose={()=>setShowLog(false)} onSaved={()=>{setShowLog(false);load()}}/>
      </Modal>

      {/* Add schedule modal */}
      <Modal open={showSchedule} onClose={()=>setShowSchedule(false)} title="Add Maintenance Schedule">
        <ScheduleForm assetId={id} onClose={()=>setShowSchedule(false)} onSaved={()=>{setShowSchedule(false);load()}}/>
      </Modal>
    </div>
  )
}

// ─── Create Asset Modal ───────────────────────────────────
function CreateAssetModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ assetCode:'', name:'', description:'', category:'', location:'', department:'',
    manufacturer:'', model:'', serialNumber:'', purchaseCost:'', currentValue:'',
    purchaseDate:'', warrantyExpiry:'', nextMaintenance:'', condition:'GOOD', notes:'' })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await assetsAPI.createAsset({
        ...f, assetCode:f.assetCode.toUpperCase(),
        purchaseCost:f.purchaseCost?parseFloat(f.purchaseCost):undefined,
        currentValue:f.currentValue?parseFloat(f.currentValue):undefined,
        purchaseDate:f.purchaseDate||null, warrantyExpiry:f.warrantyExpiry||null, nextMaintenance:f.nextMaintenance||null,
      })
      toast.success('Asset created'); onSaved(); onClose()
      setF({ assetCode:'', name:'', description:'', category:'', location:'', department:'', manufacturer:'', model:'', serialNumber:'', purchaseCost:'', currentValue:'', purchaseDate:'', warrantyExpiry:'', nextMaintenance:'', condition:'GOOD', notes:'' })
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="New Asset" size="xl">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="form-group"><label className="label">Asset Code *</label><input className="input" required placeholder="ASSET-010" value={f.assetCode} onChange={upd('assetCode')}/></div>
          <div className="form-group"><label className="label">Name *</label><input className="input" required value={f.name} onChange={upd('name')}/></div>
          <div className="form-group"><label className="label">Category *</label><input className="input" required placeholder="HVAC Equipment" value={f.category} onChange={upd('category')}/></div>
          <div className="form-group"><label className="label">Condition</label>
            <select className="select" value={f.condition} onChange={upd('condition')}>
              {['EXCELLENT','GOOD','FAIR','POOR','CRITICAL'].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Location</label><input className="input" placeholder="Floor 2 — Kitchen" value={f.location} onChange={upd('location')}/></div>
          <div className="form-group"><label className="label">Department</label><input className="input" placeholder="F&B" value={f.department} onChange={upd('department')}/></div>
          <div className="form-group"><label className="label">Manufacturer</label><input className="input" value={f.manufacturer} onChange={upd('manufacturer')}/></div>
          <div className="form-group"><label className="label">Model</label><input className="input" value={f.model} onChange={upd('model')}/></div>
          <div className="form-group"><label className="label">Serial Number</label><input className="input" value={f.serialNumber} onChange={upd('serialNumber')}/></div>
          <div className="form-group"><label className="label">Purchase Cost (₱)</label><input type="number" className="input" min={0} value={f.purchaseCost} onChange={upd('purchaseCost')}/></div>
          <div className="form-group"><label className="label">Current Value (₱)</label><input type="number" className="input" min={0} value={f.currentValue} onChange={upd('currentValue')}/></div>
          <div className="form-group"><label className="label">Purchase Date</label><input type="date" className="input" value={f.purchaseDate} onChange={upd('purchaseDate')}/></div>
          <div className="form-group"><label className="label">Warranty Expiry</label><input type="date" className="input" value={f.warrantyExpiry} onChange={upd('warrantyExpiry')}/></div>
          <div className="form-group"><label className="label">Next Maintenance</label><input type="date" className="input" value={f.nextMaintenance} onChange={upd('nextMaintenance')}/></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={upd('description')}/></div>
        <div className="form-group"><label className="label">Notes</label><textarea className="input min-h-[60px] resize-none" value={f.notes} onChange={upd('notes')}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating...':'Create Asset'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Convert Batch to Asset Modal ─────────────────────────
function ConvertBatchModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ inventoryItemId:'', batchId:'', assetCode:'', name:'', category:'', location:'', department:'', serialNumber:'', warrantyExpiry:'', nextMaintenance:'' })
  const [items, setItems] = useState([])
  const [batches, setBatches] = useState([])
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})

  useEffect(()=>{ if(open) inventoryAPI.getItems({limit:200}).then(r=>setItems(r.data.data.items||[])) },[open])

  useEffect(()=>{
    if (f.inventoryItemId) {
      inventoryAPI.getBatches({ inventoryItemId:f.inventoryItemId, status:'ACTIVE' }).then(r=>setBatches(r.data.data.batches||[]))
    } else { setBatches([]) }
  },[f.inventoryItemId])

  const selectedItem = items.find(i=>i.id===f.inventoryItemId)
  const selectedBatch = batches.find(b=>b.id===f.batchId)

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await assetsAPI.convertBatch({ ...f, assetCode:f.assetCode.toUpperCase(), warrantyExpiry:f.warrantyExpiry||null, nextMaintenance:f.nextMaintenance||null })
      toast.success('Asset created from inventory batch — stock updated'); onSaved(); onClose()
      setF({ inventoryItemId:'', batchId:'', assetCode:'', name:'', category:'', location:'', department:'', serialNumber:'', warrantyExpiry:'', nextMaintenance:'' })
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Convert Inventory Batch → Asset" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
          ℹ️ This will deduct 1 unit from the selected batch and create an asset record linked to the inventory item.
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="label">Inventory Item *</label>
            <select className="select" required value={f.inventoryItemId} onChange={upd('inventoryItemId')}>
              <option value="">Select item...</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku}) — {i.currentStock} {i.unit}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Batch *</label>
            <select className="select" required value={f.batchId} onChange={upd('batchId')} disabled={!f.inventoryItemId}>
              <option value="">Select batch...</option>
              {batches.map(b=><option key={b.id} value={b.id}>{b.batchNumber} — {b.remainingQty} remaining @ {currency(b.unitCost)}</option>)}
            </select>
          </div>
        </div>
        {selectedBatch && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
            ✓ Will deduct 1 {selectedItem?.unit} from batch {selectedBatch.batchNumber}. Remaining after: {selectedBatch.remainingQty - 1}. Asset purchase cost: {currency(selectedBatch.unitCost)}
          </div>
        )}
        <div className="form-grid">
          <div className="form-group"><label className="label">Asset Code *</label><input className="input" required placeholder="ASSET-NEW-01" value={f.assetCode} onChange={upd('assetCode')}/></div>
          <div className="form-group"><label className="label">Asset Name *</label><input className="input" required value={f.name} onChange={upd('name')}/></div>
          <div className="form-group"><label className="label">Category *</label><input className="input" required placeholder="Kitchen Equipment" value={f.category} onChange={upd('category')}/></div>
          <div className="form-group"><label className="label">Location</label><input className="input" value={f.location} onChange={upd('location')}/></div>
          <div className="form-group"><label className="label">Department</label><input className="input" value={f.department} onChange={upd('department')}/></div>
          <div className="form-group"><label className="label">Serial Number</label><input className="input" value={f.serialNumber} onChange={upd('serialNumber')}/></div>
          <div className="form-group"><label className="label">Warranty Expiry</label><input type="date" className="input" value={f.warrantyExpiry} onChange={upd('warrantyExpiry')}/></div>
          <div className="form-group"><label className="label">Next Maintenance</label><input type="date" className="input" value={f.nextMaintenance} onChange={upd('nextMaintenance')}/></div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving||!f.batchId} className="btn-primary">{saving?'Converting...':'Convert to Asset'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Create Schedule Modal ────────────────────────────────
function CreateScheduleModal({ open, assets, onClose, onSaved }) {
  const [f, setF] = useState({ assetId:'', title:'', description:'', frequencyDays:90, nextDue:'', estimatedHours:'' })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await assetsAPI.createSchedule({ ...f, frequencyDays:parseInt(f.frequencyDays), estimatedHours:f.estimatedHours?parseFloat(f.estimatedHours):null })
      toast.success('Maintenance schedule created'); onSaved(); onClose()
      setF({ assetId:'', title:'', description:'', frequencyDays:90, nextDue:'', estimatedHours:'' })
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="New Maintenance Schedule">
      <form onSubmit={save} className="space-y-4">
        <div className="form-group">
          <label className="label">Asset *</label>
          <select className="select" required value={f.assetId} onChange={upd('assetId')}>
            <option value="">Select asset...</option>
            {assets.filter(a=>!['RETIRED','DISPOSED'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="label">Title *</label><input className="input" required placeholder="Quarterly HVAC Service" value={f.title} onChange={upd('title')}/></div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Frequency (days) *</label><input type="number" className="input" required min={1} value={f.frequencyDays} onChange={upd('frequencyDays')}/></div>
          <div className="form-group"><label className="label">Next Due Date *</label><input type="date" className="input" required min={new Date().toISOString().split('T')[0]} value={f.nextDue} onChange={upd('nextDue')}/></div>
          <div className="form-group"><label className="label">Estimated Hours</label><input type="number" className="input" min={0} step={0.5} value={f.estimatedHours} onChange={upd('estimatedHours')}/></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={upd('description')}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating...':'Create Schedule'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Reusable Schedule Form (inside detail) ───────────────
function ScheduleForm({ assetId, onClose, onSaved }) {
  const [f, setF] = useState({ title:'', description:'', frequencyDays:90, nextDue:'', estimatedHours:'' })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await assetsAPI.createSchedule({ ...f, assetId, frequencyDays:parseInt(f.frequencyDays), estimatedHours:f.estimatedHours?parseFloat(f.estimatedHours):null })
      toast.success('Schedule created'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="form-group"><label className="label">Title *</label><input className="input" required value={f.title} onChange={upd('title')}/></div>
      <div className="form-grid">
        <div className="form-group"><label className="label">Frequency (days) *</label><input type="number" className="input" required min={1} value={f.frequencyDays} onChange={upd('frequencyDays')}/></div>
        <div className="form-group"><label className="label">Next Due *</label><input type="date" className="input" required min={new Date().toISOString().split('T')[0]} value={f.nextDue} onChange={upd('nextDue')}/></div>
        <div className="form-group"><label className="label">Est. Hours</label><input type="number" className="input" min={0} step={0.5} value={f.estimatedHours} onChange={upd('estimatedHours')}/></div>
      </div>
      <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[60px] resize-none" value={f.description} onChange={upd('description')}/></div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating...':'Create'}</button>
      </div>
    </form>
  )
}

// ─── Log Form ─────────────────────────────────────────────
function LogForm({ assetId, onClose, onSaved }) {
  const [f, setF] = useState({ action:'NOTE', description:'' })
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await assetsAPI.addLog(assetId, f)
      toast.success('Log entry added'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="form-group">
        <label className="label">Action Type</label>
        <select className="select" value={f.action} onChange={e=>setF({...f,action:e.target.value})}>
          {['NOTE','INSPECTION','REPAIR','CLEANING','CALIBRATION','OTHER'].map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="label">Description *</label>
        <textarea className="input min-h-[80px] resize-none" required placeholder="What was observed or done..." value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>
      </div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving...':'Add Log'}</button>
      </div>
    </form>
  )
}
