// src/pages/inventory/Inventory.jsx — 100% Complete
import { useState, useEffect } from 'react'
import { inventoryAPI } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Badge, StatCard, Modal, EmptyState, Pagination, PageLoader, currency, number } from '../../components/ui'
import { Plus, Search, AlertTriangle, Package, TrendingDown, BarChart3, Eye, RefreshCw, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH') : '—'
const CATS = ['FOOD_BEVERAGE','HOUSEKEEPING','MAINTENANCE','OFFICE_SUPPLIES','EQUIPMENT','SPARE_PARTS','CLEANING','LINEN','AMENITIES','OTHER']

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

export default function Inventory() {
  const { isManagerOrAbove } = useAuth()
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = () => setReload(r=>r+1)

  if (view==='detail') return <ItemDetail id={selectedId} onBack={()=>setView('list')} onRefresh={refresh} isManager={isManagerOrAbove()}/>

  return (
    <InventoryList
      reload={reload}
      onView={id=>{setSelectedId(id);setView('detail')}}
      isManager={isManagerOrAbove()}
      showCreate={showCreate} setShowCreate={setShowCreate}
      onCreated={refresh}
    />
  )
}

// ─── Inventory List ───────────────────────────────────────
function InventoryList({ reload, onView, isManager, showCreate, setShowCreate, onCreated }) {
  const [tab, setTab] = useState(0)
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [batches, setBatches] = useState([])
  const [lowStock, setLowStock] = useState(null)
  const [stats, setStats] = useState(null)
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [i, m, b, ls, st] = await Promise.all([
        inventoryAPI.getItems({ page, limit:15, search, category:categoryFilter||undefined }),
        inventoryAPI.getMovements({ page, limit:15 }),
        inventoryAPI.getBatches({ page, limit:15 }),
        inventoryAPI.getLowStock(),
        isManager ? inventoryAPI.getStats() : Promise.resolve(null),
      ])
      setItems(i.data.data.items)
      setMovements(m.data.data.movements)
      setBatches(b.data.data.batches)
      setLowStock(ls.data.data)
      if (st) setStats(st.data.data.stats)
      if (tab===0) setPagination(i.data.data.pagination)
      else if (tab===1) setPagination(m.data.data.pagination)
      else if (tab===2) setPagination(b.data.data.pagination)
    } catch {} finally { setLoading(false) }
  }
  useEffect(()=>{load()},[page,search,categoryFilter,tab,reload])

  const movColor = { IN:'text-emerald-400', OUT:'text-red-400', TRANSFER:'text-blue-400', ADJUSTMENT:'text-amber-400' }
  const TABS = ['Items','Movements','Batches','Low Stock',...(isManager?['Analytics']:[]) ]

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">Inventory</h1><p className="text-xs text-zinc-500 mt-1">Items · Batches · Stock Movements</p></div>
        <div className="flex gap-2">
          <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/> New Item</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Items" icon={Package} value={stats.items.active}/>
          <StatCard label="Stock Value" icon={BarChart3} color="text-emerald-400" value={currency(stats.stockValue)}/>
          <StatCard label="Low Stock" icon={AlertTriangle} color="text-red-400" value={stats.lowStock.lowStockCount}/>
          <StatCard label="Out of Stock" icon={TrendingDown} color="text-red-400" value={stats.lowStock.outOfStockCount}/>
        </div>
      )}

      <TabBar tabs={TABS} active={tab} onChange={i=>{setTab(i);setPage(1)}} />

      {tab<3 && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"/>
            <input className="input pl-9" placeholder="Search SKU or name..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
          </div>
          {tab===0 && (
            <select className="select w-44" value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPage(1)}}>
              <option value="">All Categories</option>
              {CATS.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
            </select>
          )}
        </div>
      )}

      {loading ? <PageLoader/> : (
        <>
          {/* Items */}
          {tab===0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Avg Cost</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {!items.length ? <tr><td colSpan={8}><EmptyState title="No items" message="Create an inventory item to start tracking stock."/></td></tr>
                  : items.map(item=>(
                    <tr key={item.id} className={item.isLowStock?'bg-red-500/5':item.currentStock===0?'bg-red-500/10':''}>
                      <td><span className="font-mono text-xs">{item.sku}</span></td>
                      <td>
                        <button onClick={()=>onView(item.id)} className="text-left hover:text-brand-400 transition-colors">
                          <p className="font-medium text-zinc-200">{item.name}</p>
                          <p className="text-xs text-zinc-500">{item.location||'No location'}</p>
                        </button>
                      </td>
                      <td><span className="text-xs text-zinc-400">{item.category.replace(/_/g,' ')}</span></td>
                      <td>
                        <span className={`font-mono font-semibold ${item.currentStock===0?'text-red-500':item.isLowStock?'text-red-400':'text-zinc-100'}`}>
                          {number(item.currentStock)}
                        </span>
                        <span className="text-zinc-500 text-xs ml-1">{item.unit}</span>
                      </td>
                      <td><span className="font-mono text-xs text-zinc-500">{item.reorderPoint} {item.unit}</span></td>
                      <td><span className="font-mono text-sm">{currency(item.averageCost)}</span></td>
                      <td>
                        {item.currentStock===0 ? <span className="badge badge-red">Out</span>
                        : item.isLowStock ? <span className="badge badge-red">Low Stock</span>
                        : <span className="badge badge-green">OK</span>}
                      </td>
                      <td>
                        <button onClick={()=>onView(item.id)} className="btn-ghost btn-sm"><Eye className="w-3 h-3"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage}/>
            </div>
          )}

          {/* Movements */}
          {tab===1 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Source</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th>By</th></tr></thead>
                <tbody>
                  {!movements.length ? <tr><td colSpan={8}><EmptyState title="No movements"/></td></tr>
                  : movements.map(m=>(
                    <tr key={m.id}>
                      <td className="text-xs text-zinc-500 whitespace-nowrap">{fmt(m.createdAt)}</td>
                      <td><p className="font-mono text-xs">{m.inventoryItem?.sku}</p><p className="text-xs text-zinc-500 truncate max-w-28">{m.inventoryItem?.name}</p></td>
                      <td><span className={`font-semibold text-xs ${movColor[m.movementType]||'text-zinc-400'}`}>{m.movementType}</span></td>
                      <td><span className="text-xs text-zinc-400">{m.source?.replace(/_/g,' ')}</span></td>
                      <td>
                        <span className={`font-mono font-semibold ${m.movementType==='IN'?'text-emerald-400':'text-red-400'}`}>
                          {m.movementType==='IN'?'+':'-'}{number(m.quantity)}
                        </span>
                        <span className="text-zinc-500 text-xs ml-1">{m.inventoryItem?.unit}</span>
                      </td>
                      <td><span className="font-mono text-sm">{currency(m.unitCost)}</span></td>
                      <td><span className="font-mono text-sm">{currency(m.totalCost)}</span></td>
                      <td><span className="text-xs text-zinc-500">{m.performedBy?.firstName} {m.performedBy?.lastName}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage}/>
            </div>
          )}

          {/* Batches */}
          {tab===2 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Batch #</th><th>Item</th><th>Qty</th><th>Remaining</th><th>Unit Cost</th><th>Expiry</th><th>Status</th></tr></thead>
                <tbody>
                  {!batches.length ? <tr><td colSpan={7}><EmptyState title="No batches"/></td></tr>
                  : batches.map(b=>(
                    <tr key={b.id} className={b.status==='EXPIRED'?'bg-red-500/5':''}>
                      <td><span className="font-mono text-xs">{b.batchNumber}</span></td>
                      <td><p className="text-sm text-zinc-200">{b.inventoryItem?.name}</p><p className="text-xs font-mono text-zinc-500">{b.inventoryItem?.sku}</p></td>
                      <td><span className="font-mono">{b.quantity} {b.inventoryItem?.unit}</span></td>
                      <td>
                        <span className={`font-mono font-semibold ${b.remainingQty===0?'text-zinc-600':b.remainingQty<b.quantity*0.2?'text-amber-400':'text-emerald-400'}`}>
                          {b.remainingQty}
                        </span>
                      </td>
                      <td><span className="font-mono text-sm">{currency(b.unitCost)}</span></td>
                      <td>
                        {b.expiryDate
                          ? <span className={`text-xs font-mono ${new Date(b.expiryDate)<new Date()?'text-red-400':''}`}>{fmt(b.expiryDate)}</span>
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td><Badge value={b.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pagination={pagination} onPageChange={setPage}/>
            </div>
          )}

          {/* Low Stock */}
          {tab===3 && lowStock && (
            <div className="space-y-4">
              {lowStock.outOfStock.length>0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  🚨 {lowStock.outOfStock.length} item(s) are <strong>completely out of stock</strong>!
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-red-400"/>
                    <h3 className="font-semibold text-sm text-red-400">Out of Stock ({lowStock.outOfStock.length})</h3>
                  </div>
                  {!lowStock.outOfStock.length && <p className="text-sm text-zinc-600 text-center py-4">All items have stock ✓</p>}
                  {lowStock.outOfStock.map(i=>(
                    <button key={i.id} onClick={()=>{setSelectedId(i.id);}} className="w-full flex justify-between py-2 border-b border-surface-700/40 hover:bg-surface-750 transition-colors -mx-2 px-2 rounded">
                      <div className="text-left">
                        <p className="text-sm font-mono text-zinc-300">{i.sku}</p>
                        <p className="text-xs text-zinc-500">{i.name}</p>
                      </div>
                      <span className="text-red-400 font-bold">0 {i.unit}</span>
                    </button>
                  ))}
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown className="w-4 h-4 text-amber-400"/>
                    <h3 className="font-semibold text-sm text-amber-400">Below Reorder Point ({lowStock.lowStock.length})</h3>
                  </div>
                  {!lowStock.lowStock.length && <p className="text-sm text-zinc-600 text-center py-4">All items above reorder point ✓</p>}
                  {lowStock.lowStock.map(i=>(
                    <div key={i.id} className="flex justify-between py-2 border-b border-surface-700/40">
                      <div>
                        <p className="text-sm font-mono text-zinc-300">{i.sku}</p>
                        <p className="text-xs text-zinc-500">{i.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-amber-400 font-bold font-mono">{i.currentStock} {i.unit}</p>
                        <p className="text-xs text-zinc-600">Reorder at {i.reorderPoint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Analytics */}
          {tab===4 && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">Stock by Category</h3>
                {stats.categoryBreakdown?.map(c=>(
                  <div key={c.category} className="flex justify-between py-2 border-b border-surface-700/40">
                    <span className="text-zinc-400 text-sm">{c.category?.replace(/_/g,' ')}</span>
                    <span className="font-mono text-zinc-300 text-sm">{c._count?.id} items</span>
                  </div>
                ))}
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-sm text-zinc-300 mb-4">Top Consumed (30 days)</h3>
                {stats.topConsumed?.map(t=>(
                  <div key={t.inventoryItemId} className="flex justify-between py-2 border-b border-surface-700/40">
                    <span className="text-zinc-400 text-sm truncate max-w-36">{t.item?.name}</span>
                    <div className="text-right">
                      <p className="font-mono text-zinc-300 text-sm">{number(t._sum?.quantity)} {t.item?.unit}</p>
                      <p className="font-mono text-zinc-500 text-xs">{currency(t._sum?.totalCost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreateItemModal open={showCreate} onClose={()=>setShowCreate(false)} onSaved={()=>{load();onCreated()}}/>
    </div>
  )
}

// ─── Item Detail Page ─────────────────────────────────────
function ItemDetail({ id, onBack, onRefresh, isManager }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [tab, setTab] = useState(0)

  const load = async () => {
    setLoading(true)
    try { const r = await inventoryAPI.getItem(id); setItem(r.data.data.item) } catch {}
    setLoading(false)
  }
  useEffect(()=>{load()},[id])

  if (loading) return <PageLoader/>
  if (!item) return <div className="text-zinc-500 p-8 text-center">Item not found.</div>

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center mt-0.5">
            <span className="text-zinc-400">←</span>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{item.name}</h1>
              {item.currentStock===0 && <span className="badge badge-red">Out of Stock</span>}
              {item.isLowStock && item.currentStock>0 && <span className="badge badge-red">Low Stock</span>}
              {!item.isActive && <span className="badge badge-gray">Inactive</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{item.sku} · {item.category.replace(/_/g,' ')} · {item.location||'No location'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <>
              <button onClick={()=>setShowAdjust(true)} className="btn-secondary">Adjust Stock</button>
              <button onClick={()=>setShowIssue(true)} className="btn-secondary">Issue Stock</button>
            </>
          )}
          <button onClick={()=>setShowEdit(true)} className="btn-secondary">Edit</button>
          <button onClick={load} className="btn-ghost p-2"><RefreshCw className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Current Stock" value={`${number(item.currentStock)} ${item.unit}`} color={item.isLowStock?'text-red-400':'text-emerald-400'}/>
        <StatCard label="Reserved" value={`${number(item.reservedStock)} ${item.unit}`}/>
        <StatCard label="Avg Cost" value={currency(item.averageCost)}/>
        <StatCard label="Active Batches" value={item._count?.batches||0}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Item Details</p>
            {[
              ['SKU', <span className="font-mono">{item.sku}</span>],
              ['Category', item.category.replace(/_/g,' ')],
              ['Unit', item.unit],
              ['Location', item.location],
              ['Reorder Point', `${item.reorderPoint} ${item.unit}`],
              ['Reorder Qty', `${item.reorderQty} ${item.unit}`],
              ['Serialized', item.isSerialized ? 'Yes' : 'No'],
              ['Expiry Tracked', item.expiryTracked ? 'Yes' : 'No'],
              ['Linked Assets', item._count?.assets||0],
            ].map(([l,v])=>(
              <div key={l} className="flex justify-between py-2 border-b border-surface-700/40 last:border-0">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">{l}</span>
                <span className="text-sm text-zinc-200">{v}</span>
              </div>
            ))}
          </div>
          {item.description && (
            <div className="card p-4">
              <p className="text-xs text-zinc-500 mb-1">Description</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{item.description}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <TabBar tabs={['Active Batches','Recent Movements']} active={tab} onChange={setTab}/>

          {tab===0 && (
            <div className="space-y-2">
              {!item.batches?.length && <EmptyState title="No active batches" message="Stock will appear here when goods are received."/>}
              {item.batches?.map(b=>(
                <div key={b.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-mono text-sm font-semibold text-zinc-200">{b.batchNumber}</p>
                      <div className="flex gap-4 mt-1 text-xs text-zinc-500">
                        <span>Remaining: <span className="font-mono text-zinc-300">{b.remainingQty} {item.unit}</span></span>
                        <span>Cost: <span className="font-mono text-zinc-300">{currency(b.unitCost)}/{item.unit}</span></span>
                        {b.expiryDate && <span className={`${new Date(b.expiryDate)<new Date()?'text-red-400':''}`}>Expires: {fmt(b.expiryDate)}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge value={b.status}/>
                      <p className="font-mono text-sm text-zinc-100 mt-1">{currency(b.remainingQty * b.unitCost)}</p>
                      <p className="text-xs text-zinc-500">value</p>
                    </div>
                  </div>
                  {b.supplierLot && <p className="text-xs text-zinc-600 mt-2">Lot: {b.supplierLot}</p>}
                </div>
              ))}
            </div>
          )}

          {tab===1 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Qty</th><th>By</th></tr></thead>
                <tbody>
                  {!item.stockMovements?.length ? <tr><td colSpan={5}><EmptyState title="No movements"/></td></tr>
                  : item.stockMovements?.map(m=>(
                    <tr key={m.id}>
                      <td className="text-xs text-zinc-500">{fmt(m.createdAt)}</td>
                      <td><span className={`font-semibold text-xs ${m.movementType==='IN'?'text-emerald-400':m.movementType==='OUT'?'text-red-400':'text-blue-400'}`}>{m.movementType}</span></td>
                      <td><span className="text-xs text-zinc-400">{m.source?.replace(/_/g,' ')}</span></td>
                      <td>
                        <span className={`font-mono font-semibold ${m.movementType==='IN'?'text-emerald-400':'text-red-400'}`}>
                          {m.movementType==='IN'?'+':'-'}{number(m.quantity)} {item.unit}
                        </span>
                      </td>
                      <td><span className="text-xs text-zinc-500">{m.performedBy?.firstName} {m.performedBy?.lastName}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAdjust && <AdjustModal item={item} onClose={()=>setShowAdjust(false)} onSaved={()=>{setShowAdjust(false);load();onRefresh()}}/>}
      {showIssue && <IssueModal item={item} onClose={()=>setShowIssue(false)} onSaved={()=>{setShowIssue(false);load();onRefresh()}}/>}
      {showEdit && <EditItemModal item={item} onClose={()=>setShowEdit(false)} onSaved={()=>{setShowEdit(false);load()}}/>}
    </div>
  )
}

// ─── Create Item Modal ────────────────────────────────────
function CreateItemModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ sku:'', name:'', description:'', category:'OTHER', unit:'', reorderPoint:0, reorderQty:0, location:'', isSerialized:false, expiryTracked:false })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await inventoryAPI.createItem({ ...f, sku:f.sku.toUpperCase(), reorderPoint:parseFloat(f.reorderPoint), reorderQty:parseFloat(f.reorderQty) })
      toast.success('Item created'); onSaved(); onClose()
      setF({ sku:'', name:'', description:'', category:'OTHER', unit:'', reorderPoint:0, reorderQty:0, location:'', isSerialized:false, expiryTracked:false })
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="New Inventory Item" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="form-grid">
          <div className="form-group"><label className="label">SKU *</label><input className="input" required placeholder="FB-005" value={f.sku} onChange={upd('sku')}/></div>
          <div className="form-group"><label className="label">Name *</label><input className="input" required value={f.name} onChange={upd('name')}/></div>
          <div className="form-group"><label className="label">Category</label>
            <select className="select" value={f.category} onChange={upd('category')}>
              {CATS.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Unit *</label><input className="input" required placeholder="Piece, Kg, Liter..." value={f.unit} onChange={upd('unit')}/></div>
          <div className="form-group"><label className="label">Reorder Point</label><input type="number" className="input" min={0} step={0.01} value={f.reorderPoint} onChange={upd('reorderPoint')}/></div>
          <div className="form-group"><label className="label">Reorder Qty</label><input type="number" className="input" min={0} step={0.01} value={f.reorderQty} onChange={upd('reorderQty')}/></div>
          <div className="form-group"><label className="label">Storage Location</label><input className="input" placeholder="Dry Storage A1" value={f.location} onChange={upd('location')}/></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[60px] resize-none" value={f.description} onChange={upd('description')}/></div>
        <div className="flex gap-6 text-sm text-zinc-300">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.isSerialized} onChange={upd('isSerialized')}/> Serialized</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.expiryTracked} onChange={upd('expiryTracked')}/> Track Expiry</label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating...':'Create Item'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Edit Item Modal ──────────────────────────────────────
function EditItemModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ name:item.name, description:item.description||'', category:item.category, unit:item.unit, reorderPoint:item.reorderPoint, reorderQty:item.reorderQty, location:item.location||'', isActive:item.isActive })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await inventoryAPI.updateItem(item.id, { ...f, reorderPoint:parseFloat(f.reorderPoint), reorderQty:parseFloat(f.reorderQty) })
      toast.success('Item updated'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title={`Edit — ${item.sku}`} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="form-grid">
          <div className="form-group"><label className="label">Name *</label><input className="input" required value={f.name} onChange={upd('name')}/></div>
          <div className="form-group"><label className="label">Category</label>
            <select className="select" value={f.category} onChange={upd('category')}>
              {CATS.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="label">Unit</label><input className="input" value={f.unit} onChange={upd('unit')}/></div>
          <div className="form-group"><label className="label">Reorder Point</label><input type="number" className="input" min={0} step={0.01} value={f.reorderPoint} onChange={upd('reorderPoint')}/></div>
          <div className="form-group"><label className="label">Reorder Qty</label><input type="number" className="input" min={0} step={0.01} value={f.reorderQty} onChange={upd('reorderQty')}/></div>
          <div className="form-group"><label className="label">Location</label><input className="input" value={f.location} onChange={upd('location')}/></div>
        </div>
        <div className="form-group"><label className="label">Description</label><textarea className="input min-h-[60px] resize-none" value={f.description} onChange={upd('description')}/></div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
          <input type="checkbox" checked={f.isActive} onChange={upd('isActive')}/> Item is Active
        </label>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Saving...':'Save Changes'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Adjust Stock Modal ───────────────────────────────────
function AdjustModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ adjustmentType:'ADD', quantity:'', reason:'', unitCost:'' })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const r = await inventoryAPI.adjustStock({ inventoryItemId:item.id, ...f, quantity:parseFloat(f.quantity), unitCost:f.unitCost?parseFloat(f.unitCost):undefined })
      toast.success(`Stock adjusted: ${item.sku} → ${r.data.data.item.newStock} ${item.unit}`)
      onSaved()
    } catch {} finally { setSaving(false) }
  }
  const preview = () => {
    const q = parseFloat(f.quantity||0)
    if (f.adjustmentType==='ADD') return item.currentStock + q
    if (f.adjustmentType==='REMOVE') return item.currentStock - q
    return q
  }
  return (
    <Modal open={true} onClose={onClose} title={`Adjust Stock — ${item.sku}`}>
      <form onSubmit={save} className="space-y-4">
        <div className="p-3 bg-surface-750 rounded-lg text-sm">
          Current Stock: <span className="font-mono font-bold text-zinc-100">{item.currentStock} {item.unit}</span>
          {f.quantity && <span className="text-zinc-500"> → Preview: <span className="font-mono text-brand-400">{preview()} {item.unit}</span></span>}
        </div>
        <div className="form-group"><label className="label">Adjustment Type *</label>
          <select className="select" value={f.adjustmentType} onChange={upd('adjustmentType')}>
            <option value="ADD">ADD — Increase stock</option>
            <option value="REMOVE">REMOVE — Decrease stock</option>
            <option value="SET">SET — Set exact quantity</option>
          </select>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="label">Quantity *</label><input type="number" className="input" required min={0.01} step={0.01} value={f.quantity} onChange={upd('quantity')}/></div>
          {f.adjustmentType==='ADD' && <div className="form-group"><label className="label">Unit Cost (₱)</label><input type="number" className="input" min={0} step={0.01} value={f.unitCost} onChange={upd('unitCost')}/></div>}
        </div>
        <div className="form-group"><label className="label">Reason *</label><textarea className="input min-h-[70px] resize-none" required placeholder="Physical count, damaged goods, initial stock load..." value={f.reason} onChange={upd('reason')}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Adjusting...':'Apply Adjustment'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Issue Stock Modal ────────────────────────────────────
function IssueModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ quantity:'', source:'MANUAL_ADJUSTMENT', referenceNumber:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const upd = k=>e=>setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const r = await inventoryAPI.issueStock({ inventoryItemId:item.id, ...f, quantity:parseFloat(f.quantity) })
      toast.success(`Issued ${f.quantity} ${item.unit} from ${item.sku}`)
      if (r.data.data.lowStockAlert) toast.error(`⚠️ Low stock alert: ${item.name}!`)
      onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={true} onClose={onClose} title={`Issue Stock — ${item.sku}`}>
      <form onSubmit={save} className="space-y-4">
        <div className="p-3 bg-surface-750 rounded-lg text-sm">
          Available: <span className="font-mono font-bold text-zinc-100">{item.currentStock - item.reservedStock} {item.unit}</span>
        </div>
        <div className="form-group"><label className="label">Quantity *</label><input type="number" className="input" required min={0.01} step={0.01} max={item.currentStock} value={f.quantity} onChange={upd('quantity')}/></div>
        <div className="form-group"><label className="label">Source *</label>
          <select className="select" value={f.source} onChange={upd('source')}>
            {['MANUAL_ADJUSTMENT','PROJECT','MRO_WORK_ORDER','TRANSFER','DISPOSAL'].map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="label">Reference Number</label><input className="input" placeholder="WO-2024-001" value={f.referenceNumber} onChange={upd('referenceNumber')}/></div>
        <div className="form-group"><label className="label">Notes</label><textarea className="input min-h-[60px] resize-none" value={f.notes} onChange={upd('notes')}/></div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving?'Issuing...':'Issue Stock'}</button>
        </div>
      </form>
    </Modal>
  )
}
