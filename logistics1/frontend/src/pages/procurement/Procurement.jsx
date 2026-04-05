// src/pages/procurement/Procurement.jsx  — Full rewrite with all forms + detail views
import { useState, useEffect } from 'react'
import { procurementAPI, inventoryAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Badge, StatCard, Modal, EmptyState, Pagination, PageLoader, currency } from '../../components/ui'
import { Plus, Search, CheckCircle, XCircle, Package, ShoppingCart, Users, FileText, Eye, RefreshCw, Send, Truck, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Tabs helper ─────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-surface-600 flex-wrap">
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onChange(i)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${active===i ? 'bg-brand-500 text-surface-900' : 'text-zinc-400 hover:text-zinc-200'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

// ─── Detail row ───────────────────────────────────────────
function DR({ label, value }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-surface-700/40 last:border-0">
      <span className="text-xs text-zinc-500 uppercase tracking-wide shrink-0 mr-4">{label}</span>
      <span className="text-sm text-zinc-200 text-right">{value ?? '—'}</span>
    </div>
  )
}

// ─── Status steps ────────────────────────────────────────
function Steps({ steps, current }) {
  const idx = steps.indexOf(current)
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center shrink-0">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap
            ${i < idx ? 'bg-emerald-500/15 text-emerald-400' : i===idx ? 'bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40' : 'bg-surface-700 text-zinc-600'}`}>
            {i < idx ? '✓ ' : ''}{s.replace(/_/g,' ')}
          </div>
          {i < steps.length-1 && <div className={`h-px w-4 shrink-0 ${i < idx ? 'bg-emerald-500/40' : 'bg-surface-600'}`} />}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
export default function Procurement() {
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreateRFQ, setShowCreateRFQ] = useState(false)
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = () => setReload(r => r+1)

  if (view === 'rfq') return <RFQDetail id={selectedId} onBack={() => setView('list')} />
  if (view === 'po') return <PODetail id={selectedId} onBack={() => setView('list')} />

  return (
    <ProcurementList
      reload={reload}
      onViewRFQ={id => { setSelectedId(id); setView('rfq') }}
      onViewPO={id => { setSelectedId(id); setView('po') }}
      onCreateRFQ={() => setShowCreateRFQ(true)}
      onCreatePO={() => setShowCreatePO(true)}
      onCreateSupplier={() => setShowCreateSupplier(true)}
      modals={{ showCreateRFQ, setShowCreateRFQ, showCreatePO, setShowCreatePO, showCreateSupplier, setShowCreateSupplier, refresh }}
    />
  )
}

// ─── Procurement List ─────────────────────────────────────
function ProcurementList({ reload, onViewRFQ, onViewPO, onCreateRFQ, onCreatePO, onCreateSupplier, modals }) {
  const { isManagerOrAbove } = useAuth()
  const [tab, setTab] = useState(0)
  const [stats, setStats] = useState(null)
  const [data, setData] = useState({ suppliers:[], rfqs:[], pos:[] })
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const p = { page, limit: 12, search, status: statusFilter || undefined }
      const [s, r, po, st] = await Promise.all([
        procurementAPI.getSuppliers(p),
        procurementAPI.getRFQs(p),
        procurementAPI.getPOs(p),
        procurementAPI.getStats(),
      ])
      setData({ suppliers: s.data.data.suppliers, rfqs: r.data.data.rfqs, pos: po.data.data.pos })
      setStats(st.data.data.stats)
      if (tab===1) setPagination(s.data.data.pagination)
      else if (tab===2) setPagination(r.data.data.pagination)
      else setPagination(po.data.data.pagination || {})
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, statusFilter, tab, reload])

  const action = async (type, act, id) => {
    try {
      if (type==='rfq') {
        if (act==='submit') await procurementAPI.submitRFQ(id)
        if (act==='approve') await procurementAPI.approveRFQ(id, {})
        if (act==='reject') await procurementAPI.rejectRFQ(id, { notes:'Rejected' })
      } else {
        if (act==='submit') await procurementAPI.submitPO(id)
        if (act==='approve') await procurementAPI.approvePO(id, {})
        if (act==='reject') await procurementAPI.rejectPO(id, { notes:'Rejected' })
      }
      toast.success('Done'); load()
    } catch {}
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">Procurement</h1><p className="text-xs text-zinc-500 mt-1">Suppliers · RFQs · Purchase Orders</p></div>
        <div className="flex gap-2">
          <button onClick={onCreateSupplier} className="btn-secondary"><Users className="w-4 h-4" /> Supplier</button>
          <button onClick={onCreateRFQ} className="btn-secondary"><FileText className="w-4 h-4" /> RFQ</button>
          <button onClick={onCreatePO} className="btn-primary"><Plus className="w-4 h-4" /> New PO</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Suppliers" icon={Users} value={stats.suppliers.active} />
          <StatCard label="Pending RFQs" icon={FileText} color="text-amber-400" value={stats.rfqs.pending} />
          <StatCard label="POs Pending Approval" icon={ShoppingCart} color="text-orange-400" value={stats.purchaseOrders.pendingApproval} />
          <StatCard label="Total PO Value" icon={Package} color="text-emerald-400" value={currency(stats.purchaseOrders.totalValue)} />
        </div>
      )}

      <TabBar tabs={['Overview','Suppliers','RFQs','Purchase Orders']} active={tab} onChange={i => { setTab(i); setPage(1); setStatusFilter('') }} />

      {tab > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input className="input pl-9" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          {tab >= 2 && (
            <select className="select w-48" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">All Statuses</option>
              {(tab===2 ? ['DRAFT','SENT','QUOTED','APPROVED','REJECTED','CANCELLED'] : ['DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'])
                .map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          )}
        </div>
      )}

      {loading ? <PageLoader /> : (
        <>
          {/* Overview */}
          {tab===0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">Recent Purchase Orders</h3>
                <div className="space-y-1">
                  {data.pos.slice(0,6).map(po => (
                    <button key={po.id} onClick={() => onViewPO(po.id)}
                      className="w-full flex items-center justify-between py-2.5 px-3 -mx-3 border-b border-surface-700/40 hover:bg-surface-750 rounded transition-colors">
                      <div className="text-left">
                        <p className="text-sm font-mono text-zinc-300">{po.poNumber}</p>
                        <p className="text-xs text-zinc-500">{po.supplier?.name}</p>
                      </div>
                      <div className="text-right">
                        <Badge value={po.status} />
                        <p className="text-xs text-zinc-400 mt-1 font-mono">{currency(po.totalAmount)}</p>
                      </div>
                    </button>
                  ))}
                  {!data.pos.length && <EmptyState title="No POs yet" />}
                </div>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">Top Suppliers by PO Value</h3>
                <div className="space-y-2">
                  {(stats?.topSuppliers||[]).map(ts => (
                    <div key={ts.supplierId} className="flex justify-between py-2 border-b border-surface-700/40">
                      <div>
                        <p className="text-sm text-zinc-200">{ts.supplier?.name}</p>
                        <p className="text-xs text-zinc-500">{ts._count?.id||0} POs</p>
                      </div>
                      <p className="font-mono text-sm text-zinc-300">{currency(ts._sum?.totalAmount)}</p>
                    </div>
                  ))}
                  {!(stats?.topSuppliers?.length) && <EmptyState title="No data yet" />}
                </div>
              </div>
            </div>
          )}

          {/* Suppliers */}
          {tab===1 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Terms</th><th>Lead</th><th>Rating</th><th>Status</th></tr></thead>
                <tbody>
                  {!data.suppliers.length ? <tr><td colSpan={7}><EmptyState title="No suppliers" /></td></tr>
                  : data.suppliers.map(s => (
                    <tr key={s.id}>
                      <td><span className="font-mono text-xs">{s.code}</span></td>
                      <td><p className="font-medium text-zinc-200">{s.name}</p><p className="text-xs text-zinc-500">{s.email}</p></td>
                      <td><p className="text-sm">{s.contactPerson||'—'}</p><p className="text-xs text-zinc-500">{s.phone}</p></td>
                      <td><span className="text-xs text-zinc-400">{s.paymentTerms||'—'}</span></td>
                      <td><span className="text-xs text-zinc-400">{s.leadTimeDays}d</span></td>
                      <td><span className="text-brand-400 font-semibold">{s.rating?.toFixed(1)||'—'}</span></td>
                      <td><Badge value={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
          )}

          {/* RFQs */}
          {tab===2 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>RFQ #</th><th>Title</th><th>Due Date</th><th>Quotes</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!data.rfqs.length ? <tr><td colSpan={6}><EmptyState title="No RFQs" /></td></tr>
                  : data.rfqs.map(r => (
                    <tr key={r.id}>
                      <td><button onClick={() => onViewRFQ(r.id)} className="font-mono text-xs text-brand-400 hover:underline">{r.rfqNumber}</button></td>
                      <td><p className="text-sm text-zinc-200 max-w-xs truncate">{r.title}</p></td>
                      <td className="text-xs text-zinc-400">{new Date(r.dueDate).toLocaleDateString('en-PH')}</td>
                      <td>{r._count?.quotes||0}</td>
                      <td><Badge value={r.status} /></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => onViewRFQ(r.id)} className="btn-ghost btn-sm"><Eye className="w-3 h-3" /></button>
                          {r.status==='DRAFT' && <button onClick={() => action('rfq','submit',r.id)} className="btn-secondary btn-sm"><Send className="w-3 h-3" /></button>}
                          {['SENT','QUOTED','UNDER_REVIEW'].includes(r.status) && isManagerOrAbove() && (
                            <>
                              <button onClick={() => action('rfq','approve',r.id)} className="btn-ghost btn-sm text-emerald-400"><CheckCircle className="w-3 h-3" /></button>
                              <button onClick={() => action('rfq','reject',r.id)} className="btn-ghost btn-sm text-red-400"><XCircle className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
          )}

          {/* Purchase Orders */}
          {tab===3 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th>Expected</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!data.pos.length ? <tr><td colSpan={7}><EmptyState title="No purchase orders" /></td></tr>
                  : data.pos.map(po => (
                    <tr key={po.id}>
                      <td><button onClick={() => onViewPO(po.id)} className="font-mono text-xs text-brand-400 hover:underline">{po.poNumber}</button></td>
                      <td><p className="text-sm text-zinc-200">{po.supplier?.name}</p></td>
                      <td className="text-xs text-zinc-400">{new Date(po.orderDate).toLocaleDateString('en-PH')}</td>
                      <td className="text-xs text-zinc-400">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('en-PH') : '—'}</td>
                      <td><span className="font-mono text-sm">{currency(po.totalAmount)}</span></td>
                      <td><Badge value={po.status} /></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => onViewPO(po.id)} className="btn-ghost btn-sm"><Eye className="w-3 h-3" /></button>
                          {po.status==='DRAFT' && <button onClick={() => action('po','submit',po.id)} className="btn-secondary btn-sm text-xs">Submit</button>}
                          {po.status==='PENDING_APPROVAL' && isManagerOrAbove() && (
                            <>
                              <button onClick={() => action('po','approve',po.id)} className="btn-ghost btn-sm text-emerald-400"><CheckCircle className="w-3 h-3" /></button>
                              <button onClick={() => action('po','reject',po.id)} className="btn-ghost btn-sm text-red-400"><XCircle className="w-3 h-3" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      <CreateSupplierModal open={modals.showCreateSupplier} onClose={() => modals.setShowCreateSupplier(false)} onSaved={() => { load(); modals.refresh() }} />
      <CreateRFQModal open={modals.showCreateRFQ} onClose={() => modals.setShowCreateRFQ(false)} onSaved={() => { load(); modals.refresh() }} />
      <CreatePOModal open={modals.showCreatePO} onClose={() => modals.setShowCreatePO(false)} onSaved={() => { load(); modals.refresh() }} />
    </div>
  )
}

// ─── RFQ Detail Page ──────────────────────────────────────
function RFQDetail({ id, onBack }) {
  const { isManagerOrAbove } = useAuth()
  const [rfq, setRfq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)

  const load = async () => {
    setLoading(true)
    try { const r = await procurementAPI.getRFQ(id); setRfq(r.data.data.rfq) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const act = async (action) => {
    try {
      if (action==='submit') await procurementAPI.submitRFQ(id)
      if (action==='approve') await procurementAPI.approveRFQ(id, {})
      if (action==='reject') await procurementAPI.rejectRFQ(id, { notes:'Rejected' })
      toast.success('Done'); load()
    } catch {}
  }

  if (loading) return <PageLoader />
  if (!rfq) return <div className="text-zinc-500 p-8 text-center">RFQ not found.</div>

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <h1 className="page-title">{rfq.rfqNumber}</h1>
            <p className="text-xs text-zinc-500">{rfq.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {rfq.status==='DRAFT' && <button onClick={() => act('submit')} className="btn-secondary"><Send className="w-4 h-4" /> Send to Suppliers</button>}
          {['SENT','QUOTED','UNDER_REVIEW'].includes(rfq.status) && isManagerOrAbove() && (
            <>
              <button onClick={() => act('approve')} className="btn-primary"><CheckCircle className="w-4 h-4" /> Approve</button>
              <button onClick={() => act('reject')} className="btn-danger"><XCircle className="w-4 h-4" /> Reject</button>
            </>
          )}
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <Steps steps={['DRAFT','SENT','QUOTED','APPROVED']} current={rfq.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Details</p>
            <DR label="Status" value={<Badge value={rfq.status} />} />
            <DR label="Created By" value={`${rfq.createdBy?.firstName} ${rfq.createdBy?.lastName}`} />
            <DR label="Due Date" value={new Date(rfq.dueDate).toLocaleDateString('en-PH')} />
            {rfq.approvedBy && <DR label="Approved By" value={`${rfq.approvedBy.firstName} ${rfq.approvedBy.lastName}`} />}
            {rfq.project && <DR label="Project" value={rfq.project.name} />}
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Suppliers ({rfq.suppliers?.length})</p>
            {rfq.suppliers?.map(s => (
              <div key={s.supplier.id} className="flex justify-between py-2 border-b border-surface-700/40 last:border-0">
                <div>
                  <p className="text-sm text-zinc-200">{s.supplier.name}</p>
                  <p className="text-xs text-zinc-500 font-mono">{s.supplier.code}</p>
                </div>
                <span className="text-xs text-zinc-600">{s.sentAt ? '✓ Sent' : 'Pending'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <TabBar tabs={['Items','Quotes','Comparison']} active={tab} onChange={setTab} />

          {tab===0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th></tr></thead>
                <tbody>
                  {rfq.items?.map((item, i) => (
                    <tr key={item.id}>
                      <td className="text-zinc-500">{i+1}</td>
                      <td><p className="font-medium text-zinc-200">{item.description}</p>{item.inventoryItem && <p className="text-xs font-mono text-zinc-500">{item.inventoryItem.sku}</p>}</td>
                      <td><span className="font-mono">{item.quantity}</span></td>
                      <td><span className="text-zinc-400 text-xs">{item.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab===1 && (
            <div className="space-y-3">
              {!rfq.quotes?.length && <EmptyState title="No quotes yet" message="Waiting for supplier responses." />}
              {rfq.quotes?.map(q => (
                <div key={q.id} className={`card p-4 ${q.isSelected ? 'border-brand-500/40 bg-brand-500/5' : ''}`}>
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="font-semibold text-zinc-200">{q.supplier?.name}</p>
                      <p className="text-xs text-zinc-500">Delivery: {q.deliveryDays}d · Terms: {q.paymentTerms||'—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-xl text-zinc-100">{currency(q.totalAmount)}</p>
                      {q.isSelected && <span className="badge-green badge text-[10px]">SELECTED</span>}
                    </div>
                  </div>
                  {q.items?.map(qi => (
                    <div key={qi.id} className="flex justify-between text-xs py-1 border-t border-surface-700/30">
                      <span className="text-zinc-400">{qi.rfqItem?.description}</span>
                      <span className="font-mono text-zinc-300">{currency(qi.unitPrice)} × {qi.quantity}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab===2 && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm text-zinc-300 mb-4">Quote Comparison (lowest first)</h3>
              {!rfq.quotes?.length && <EmptyState title="No quotes to compare" />}
              {[...(rfq.quotes||[])].sort((a,b) => a.totalAmount - b.totalAmount).map((q, i) => {
                const lowest = rfq.quotes.reduce((m, x) => x.totalAmount < m ? x.totalAmount : m, Infinity)
                const savings = q.totalAmount - lowest
                return (
                  <div key={q.id} className="flex items-center gap-4 py-3 border-b border-surface-700/40 last:border-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                      ${i===0 ? 'bg-emerald-500 text-white' : 'bg-surface-600 text-zinc-400'}`}>{i+1}</span>
                    <span className="text-zinc-300 flex-1">{q.supplier?.name}</span>
                    <div className="text-right">
                      <p className="font-mono font-bold">{currency(q.totalAmount)}</p>
                      {savings > 0 && <p className="text-xs text-red-400">+{currency(savings)}</p>}
                      {i===0 && <p className="text-xs text-emerald-400">Lowest</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PO Detail Page ───────────────────────────────────────
function PODetail({ id, onBack }) {
  const { isManagerOrAbove } = useAuth()
  const [po, setPo] = useState(null)
  const [receivings, setReceivings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReceive, setShowReceive] = useState(false)
  const [tab, setTab] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const [pr, rr] = await Promise.all([procurementAPI.getPO(id), procurementAPI.getReceivings(id)])
      setPo(pr.data.data.po)
      setReceivings(rr.data.data.receivings)
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const act = async (action) => {
    try {
      if (action==='submit') await procurementAPI.submitPO(id)
      if (action==='approve') await procurementAPI.approvePO(id, {})
      if (action==='reject') await procurementAPI.rejectPO(id, { notes:'Rejected' })
      toast.success('Done'); load()
    } catch {}
  }

  if (loading) return <PageLoader />
  if (!po) return <div className="text-zinc-500 p-8 text-center">PO not found.</div>

  const canReceive = ['APPROVED','SENT','PARTIALLY_RECEIVED'].includes(po.status)

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <h1 className="page-title">{po.poNumber}</h1>
            <p className="text-xs text-zinc-500">{po.supplier?.name} · {currency(po.totalAmount)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {po.status==='DRAFT' && <button onClick={() => act('submit')} className="btn-secondary">Submit for Approval</button>}
          {po.status==='PENDING_APPROVAL' && isManagerOrAbove() && (
            <>
              <button onClick={() => act('approve')} className="btn-primary"><CheckCircle className="w-4 h-4" /> Approve</button>
              <button onClick={() => act('reject')} className="btn-danger">Reject</button>
            </>
          )}
          {canReceive && (
            <button onClick={() => setShowReceive(true)} className="btn-primary"><Truck className="w-4 h-4" /> Receive Goods</button>
          )}
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <Steps steps={['DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED']} current={po.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">PO Details</p>
            <DR label="Status" value={<Badge value={po.status} />} />
            <DR label="Supplier" value={po.supplier?.name} />
            <DR label="Order Date" value={new Date(po.orderDate).toLocaleDateString('en-PH')} />
            {po.expectedDate && <DR label="Expected" value={new Date(po.expectedDate).toLocaleDateString('en-PH')} />}
            <DR label="Payment Terms" value={po.paymentTerms||'—'} />
            {po.approvedBy && <DR label="Approved By" value={`${po.approvedBy.firstName} ${po.approvedBy.lastName}`} />}
            {po.project && <DR label="Project" value={po.project.name} />}
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Cost Summary</p>
            <DR label="Subtotal" value={currency(po.totalAmount - po.taxAmount)} />
            <DR label="Tax" value={currency(po.taxAmount)} />
            <div className="pt-2 border-t border-surface-600 mt-2 flex justify-between">
              <span className="text-sm font-semibold text-zinc-400">Total</span>
              <span className="font-mono font-bold text-lg text-brand-400">{currency(po.totalAmount)}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <TabBar tabs={['Line Items','Receiving History']} active={tab} onChange={setTab} />

          {tab===0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Description</th><th>Ordered</th><th>Received</th><th>Unit Price</th><th>Total</th></tr></thead>
                <tbody>
                  {po.items?.map(item => (
                    <tr key={item.id}>
                      <td>
                        <p className="font-medium text-zinc-200">{item.description}</p>
                        <p className="text-xs text-zinc-500">{item.unit} · Tax: {item.taxRate}%</p>
                      </td>
                      <td><span className="font-mono">{item.quantity}</span></td>
                      <td>
                        <span className={`font-mono font-semibold ${item.receivedQty >= item.quantity ? 'text-emerald-400' : item.receivedQty > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {item.receivedQty}
                        </span>
                        <span className="text-zinc-600 text-xs"> / {item.quantity}</span>
                      </td>
                      <td><span className="font-mono text-sm">{currency(item.unitPrice)}</span></td>
                      <td><span className="font-mono text-sm">{currency(item.totalPrice)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab===1 && (
            <div className="space-y-3">
              {!receivings.length && <EmptyState icon={Truck} title="No goods received yet" message="Click 'Receive Goods' when the supplier delivers." />}
              {receivings.map(rec => (
                <div key={rec.id} className="card p-4">
                  <div className="flex justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-mono text-sm font-semibold text-zinc-200">{rec.receiptNumber}</span>
                      <Badge value={rec.status} />
                    </div>
                    <span className="text-xs text-zinc-500">{new Date(rec.receivedDate).toLocaleDateString('en-PH')}</span>
                  </div>
                  {rec.items?.map(ri => (
                    <div key={ri.id} className="flex justify-between text-xs py-1.5 border-b border-surface-700/30">
                      <span className="text-zinc-400">{ri.poItem?.description}</span>
                      <span className="font-mono text-zinc-300">
                        ✓ {ri.acceptedQty} accepted
                        {ri.rejectedQty > 0 && <span className="text-red-400 ml-2">✗ {ri.rejectedQty} rejected</span>}
                        {ri.batch && <span className="text-zinc-500 ml-2">· {ri.batch.batchNumber}</span>}
                      </span>
                    </div>
                  ))}
                  {rec.notes && <p className="text-xs text-zinc-500 mt-2 italic">"{rec.notes}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showReceive && <ReceiveGoodsModal po={po} onClose={() => setShowReceive(false)} onSaved={() => { setShowReceive(false); load() }} />}
    </div>
  )
}

// ─── Create Supplier Modal ────────────────────────────────
function CreateSupplierModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ code:'', name:'', contactPerson:'', email:'', phone:'', address:'', city:'', paymentTerms:'', leadTimeDays:7 })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await procurementAPI.createSupplier({ ...f, code: f.code.toUpperCase(), leadTimeDays: parseInt(f.leadTimeDays) })
      toast.success('Supplier created'); onSaved(); onClose()
      setF({ code:'', name:'', contactPerson:'', email:'', phone:'', address:'', city:'', paymentTerms:'', leadTimeDays:7 })
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Supplier" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="form-grid">
          <div className="form-group"><label className="label">Code *</label><input className="input" required placeholder="SUP-001" value={f.code} onChange={upd('code')} /></div>
          <div className="form-group"><label className="label">Company Name *</label><input className="input" required value={f.name} onChange={upd('name')} /></div>
          <div className="form-group"><label className="label">Contact Person</label><input className="input" value={f.contactPerson} onChange={upd('contactPerson')} /></div>
          <div className="form-group"><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={upd('email')} /></div>
          <div className="form-group"><label className="label">Phone</label><input className="input" value={f.phone} onChange={upd('phone')} /></div>
          <div className="form-group"><label className="label">City</label><input className="input" value={f.city} onChange={upd('city')} /></div>
          <div className="form-group"><label className="label">Payment Terms</label><input className="input" placeholder="NET 30" value={f.paymentTerms} onChange={upd('paymentTerms')} /></div>
          <div className="form-group"><label className="label">Lead Time (days)</label><input type="number" className="input" min={0} value={f.leadTimeDays} onChange={upd('leadTimeDays')} /></div>
        </div>
        <div className="form-group"><label className="label">Address</label><textarea className="input min-h-[60px] resize-none" value={f.address} onChange={upd('address')} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Create Supplier'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Create RFQ Modal ─────────────────────────────────────
function CreateRFQModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ title:'', description:'', dueDate:'' })
  const [supplierIds, setSupplierIds] = useState([])
  const [items, setItems] = useState([{ description:'', quantity:'', unit:'' }])
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) procurementAPI.getSuppliers({ limit:100, status:'ACTIVE' }).then(r => setSuppliers(r.data.data.suppliers||[]))
  }, [open])

  const addItem = () => setItems([...items, { description:'', quantity:'', unit:'' }])
  const removeItem = i => setItems(items.filter((_,idx) => idx!==i))
  const updItem = (i,k,v) => setItems(items.map((it,idx) => idx===i ? { ...it,[k]:v } : it))

  const save = async (e) => {
    e.preventDefault()
    if (!supplierIds.length) { toast.error('Select at least one supplier'); return }
    setSaving(true)
    try {
      await procurementAPI.createRFQ({
        ...f,
        supplierIds,
        items: items.filter(it => it.description && it.quantity).map(it => ({ ...it, quantity: parseFloat(it.quantity) })),
      })
      toast.success('RFQ created'); onSaved(); onClose()
      setF({ title:'', description:'', dueDate:'' }); setSupplierIds([]); setItems([{ description:'', quantity:'', unit:'' }])
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create RFQ" size="xl">
      <form onSubmit={save} className="space-y-5">
        <div className="form-grid">
          <div className="form-group"><label className="label">Title *</label><input className="input" required value={f.title} onChange={e => setF({...f, title:e.target.value})} /></div>
          <div className="form-group">
            <label className="label">Due Date *</label>
            <input type="date" className="input" required min={new Date().toISOString().split('T')[0]} value={f.dueDate} onChange={e => setF({...f, dueDate:e.target.value})} />
          </div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[70px] resize-none" value={f.description} onChange={e => setF({...f, description:e.target.value})} /></div>

        <div>
          <label className="label">Select Suppliers * ({supplierIds.length} selected)</label>
          <div className="max-h-36 overflow-y-auto card-sm p-2 space-y-1">
            {suppliers.map(s => (
              <label key={s.id} className="flex items-center gap-2 p-2 rounded hover:bg-surface-700 cursor-pointer">
                <input type="checkbox" checked={supplierIds.includes(s.id)} onChange={e => setSupplierIds(e.target.checked ? [...supplierIds, s.id] : supplierIds.filter(id => id!==s.id))} />
                <span className="text-sm text-zinc-200">{s.name}</span>
                <span className="text-xs text-zinc-500 ml-auto">{s.code}</span>
              </label>
            ))}
            {!suppliers.length && <p className="text-xs text-zinc-600 p-2">No active suppliers found.</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label">Items *</label>
            <button type="button" onClick={addItem} className="btn-ghost btn-sm"><Plus className="w-3 h-3" /> Add</button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1"><input className="input text-sm" required placeholder="Description" value={it.description} onChange={e => updItem(i,'description',e.target.value)} /></div>
                <div className="w-24"><input type="number" className="input text-sm" required min={0.01} placeholder="Qty" value={it.quantity} onChange={e => updItem(i,'quantity',e.target.value)} /></div>
                <div className="w-24"><input className="input text-sm" required placeholder="Unit" value={it.unit} onChange={e => updItem(i,'unit',e.target.value)} /></div>
                {items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-zinc-600 hover:text-red-400 p-2"><XCircle className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create RFQ'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Create PO Modal ──────────────────────────────────────
function CreatePOModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ supplierId:'', paymentTerms:'', expectedDate:'', deliveryAddress:'', notes:'' })
  const [items, setItems] = useState([{ description:'', quantity:'', unitPrice:'', unit:'', taxRate:'12', inventoryItemId:'' }])
  const [suppliers, setSuppliers] = useState([])
  const [invItems, setInvItems] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      procurementAPI.getSuppliers({ limit:100, status:'ACTIVE' }).then(r => setSuppliers(r.data.data.suppliers||[]))
      inventoryAPI.getItems({ limit:200 }).then(r => setInvItems(r.data.data.items||[]))
    }
  }, [open])

  const addItem = () => setItems([...items, { description:'', quantity:'', unitPrice:'', unit:'', taxRate:'12', inventoryItemId:'' }])
  const removeItem = i => setItems(items.filter((_,idx) => idx!==i))
  const updItem = (i,k,v) => {
    const updated = items.map((it,idx) => idx===i ? { ...it,[k]:v } : it)
    if (k==='inventoryItemId' && v) {
      const inv = invItems.find(x => x.id===v)
      if (inv) updated[i] = { ...updated[i], description: inv.name, unit: inv.unit }
    }
    setItems(updated)
  }

  const total = items.reduce((sum, it) => {
    const sub = parseFloat(it.quantity||0) * parseFloat(it.unitPrice||0)
    return sum + sub + sub*(parseFloat(it.taxRate||0)/100)
  }, 0)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await procurementAPI.createPO({
        ...f,
        items: items.filter(it => it.description && it.quantity && it.unitPrice).map(it => ({
          description: it.description,
          quantity: parseFloat(it.quantity),
          unitPrice: parseFloat(it.unitPrice),
          unit: it.unit,
          taxRate: parseFloat(it.taxRate||0),
          inventoryItemId: it.inventoryItemId||null,
        })),
      })
      toast.success('Purchase Order created'); onSaved(); onClose()
    } catch {} finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Purchase Order" size="xl">
      <form onSubmit={save} className="space-y-5">
        <div className="form-grid">
          <div className="form-group">
            <label className="label">Supplier *</label>
            <select className="select" required value={f.supplierId} onChange={e => setF({...f, supplierId:e.target.value})}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Expected Delivery</label><input type="date" className="input" value={f.expectedDate} onChange={e => setF({...f, expectedDate:e.target.value})} /></div>
          <div className="form-group"><label className="label">Payment Terms</label><input className="input" placeholder="NET 30" value={f.paymentTerms} onChange={e => setF({...f, paymentTerms:e.target.value})} /></div>
        </div>
        <div className="form-group"><label className="label">Delivery Address</label><textarea className="input min-h-[60px] resize-none" value={f.deliveryAddress} onChange={e => setF({...f, deliveryAddress:e.target.value})} /></div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label">Line Items *</label>
            <button type="button" onClick={addItem} className="btn-ghost btn-sm"><Plus className="w-3 h-3" /> Add Item</button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="p-3 bg-surface-750 rounded-lg border border-surface-600 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="md:col-span-2">
                    <label className="label text-[10px]">Inventory Item (optional)</label>
                    <select className="select text-xs" value={it.inventoryItemId} onChange={e => updItem(i,'inventoryItemId',e.target.value)}>
                      <option value="">Custom / non-stock</option>
                      {invItems.map(x => <option key={x.id} value={x.id}>{x.name} ({x.sku})</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label text-[10px]">Description *</label>
                    <input className="input text-sm" required value={it.description} onChange={e => updItem(i,'description',e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div><label className="label text-[10px]">Qty *</label><input type="number" className="input text-sm" required min={0.01} step={0.01} value={it.quantity} onChange={e => updItem(i,'quantity',e.target.value)} /></div>
                  <div><label className="label text-[10px]">Unit *</label><input className="input text-sm" required placeholder="Piece" value={it.unit} onChange={e => updItem(i,'unit',e.target.value)} /></div>
                  <div><label className="label text-[10px]">Unit Price (₱) *</label><input type="number" className="input text-sm" required min={0} step={0.01} value={it.unitPrice} onChange={e => updItem(i,'unitPrice',e.target.value)} /></div>
                  <div><label className="label text-[10px]">Tax %</label><input type="number" className="input text-sm" min={0} max={100} value={it.taxRate} onChange={e => updItem(i,'taxRate',e.target.value)} /></div>
                </div>
                {items.length > 1 && (
                  <div className="text-right">
                    <button type="button" onClick={() => removeItem(i)} className="text-xs text-zinc-600 hover:text-red-400">Remove item</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2">
            <span className="text-sm font-mono">Total: <span className="font-bold text-brand-400 text-lg">{currency(total)}</span></span>
          </div>
        </div>

        <div className="form-group"><label className="label">Notes</label><textarea className="input min-h-[60px] resize-none" value={f.notes} onChange={e => setF({...f, notes:e.target.value})} /></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Purchase Order'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Receive Goods Modal ──────────────────────────────────
function ReceiveGoodsModal({ po, onClose, onSaved }) {
  const pending = po.items?.filter(i => i.receivedQty < i.quantity) || []
  const [items, setItems] = useState(pending.map(i => ({
    poItemId: i.id, description: i.description,
    remainingQty: i.quantity - i.receivedQty,
    receivedQty: String(i.quantity - i.receivedQty),
    acceptedQty: String(i.quantity - i.receivedQty),
    rejectedQty: '0', unitCost: String(i.unitPrice),
  })))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const upd = (i,k,v) => setItems(items.map((it,idx) => idx===i ? { ...it,[k]:v } : it))

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await procurementAPI.receivePO(po.id, {
        receivedDate: new Date().toISOString(), notes,
        items: items.map(it => ({
          poItemId: it.poItemId,
          receivedQty: parseFloat(it.receivedQty),
          acceptedQty: parseFloat(it.acceptedQty),
          rejectedQty: parseFloat(it.rejectedQty||0),
          unitCost: parseFloat(it.unitCost),
        })),
      })
      toast.success('Goods received! Inventory batches created.'); onSaved()
    } catch {} finally { setSaving(false) }
  }

  if (!pending.length) return (
    <Modal open={true} onClose={onClose} title="Receive Goods">
      <div className="text-center py-8">
        <ClipboardCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="font-semibold text-zinc-300">All items fully received!</p>
        <p className="text-sm text-zinc-500 mt-1">This PO has no pending items to receive.</p>
        <button onClick={onClose} className="btn-primary mt-4">Close</button>
      </div>
    </Modal>
  )

  return (
    <Modal open={true} onClose={onClose} title={`Receive Goods — ${po.poNumber}`} size="xl">
      <form onSubmit={save} className="space-y-4">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
          ⚠️ Receiving will create inventory batches and update stock levels automatically.
        </div>
        {items.map((it, i) => (
          <div key={it.poItemId} className="p-3 bg-surface-750 rounded-lg border border-surface-600">
            <div className="flex justify-between mb-2">
              <p className="font-medium text-zinc-200 text-sm">{it.description}</p>
              <span className="text-xs text-zinc-500">Remaining: {it.remainingQty}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[['Received Qty','receivedQty'],['Accepted','acceptedQty'],['Rejected','rejectedQty'],['Unit Cost ₱','unitCost']].map(([label,key]) => (
                <div key={key}>
                  <label className="label text-[10px]">{label}</label>
                  <input type="number" className="input text-sm" min={0} step={0.01}
                    value={it[key]} onChange={e => upd(i, key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="form-group">
          <label className="label">Notes</label>
          <textarea className="input min-h-[70px] resize-none" placeholder="Condition of goods, any issues..."
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Truck className="w-4 h-4" /> {saving ? 'Processing...' : 'Confirm Receipt (GRN)'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
