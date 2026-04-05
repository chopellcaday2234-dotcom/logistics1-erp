// src/pages/users/UserManagement.jsx
import { useState, useEffect } from 'react'
import { authAPI } from '../../api/client'
import { Badge, Modal, EmptyState, Pagination, PageLoader } from '../../components/ui'
import { Users, Plus, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_COLORS = { ADMIN:'text-red-400', MANAGER:'text-blue-400', STAFF:'text-emerald-400', TECHNICIAN:'text-purple-400' }

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await authAPI.getUsers({ page, limit:15, search, role:roleFilter||undefined })
      setUsers(r.data.data.users)
      setPagination(r.data.data.pagination)
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [page, search, roleFilter])

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="page-header">
        <div><h1 className="page-title">User Management</h1><p className="text-xs text-zinc-500 mt-1">Accounts · Roles · Permissions</p></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New User</button>
      </div>
      <div className="flex gap-3">
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input className="input pl-9" placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select w-40" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}>
          <option value="">All Roles</option>
          {['ADMIN','MANAGER','STAFF','TECHNICIAN'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {loading ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {!users.length ? <tr><td colSpan={7}><EmptyState icon={Users} title="No users found" /></td></tr>
              : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-surface-600 flex items-center justify-center text-xs font-bold text-zinc-300">{u.firstName[0]}{u.lastName[0]}</div>
                      <p className="font-medium text-zinc-200">{u.firstName} {u.lastName}</p>
                    </div>
                  </td>
                  <td><span className="text-sm text-zinc-400">{u.email}</span></td>
                  <td><span className={`text-xs font-bold uppercase ${ROLE_COLORS[u.role]||'text-zinc-400'}`}>{u.role}</span></td>
                  <td><span className="text-sm text-zinc-400">{u.department||'—'}</span></td>
                  <td><span className="text-xs text-zinc-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-PH') : 'Never'}</span></td>
                  <td><Badge value={u.status} /></td>
                  <td><button onClick={() => setEditUser(u)} className="btn-ghost btn-sm">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}
      <UserFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => { load(); setShowCreate(false) }} />
      {editUser && <UserFormModal open={true} user={editUser} onClose={() => setEditUser(null)} onSaved={() => { load(); setEditUser(null) }} />}
    </div>
  )
}

function UserFormModal({ open, user, onClose, onSaved }) {
  const isEdit = !!user
  const [f, setF] = useState(user
    ? { firstName:user.firstName, lastName:user.lastName, role:user.role, status:user.status, department:user.department||'', phone:user.phone||'' }
    : { email:'', password:'', firstName:'', lastName:'', role:'STAFF', department:'', phone:'' })
  const [saving, setSaving] = useState(false)
  const upd = k => e => setF({...f,[k]:e.target.value})
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (isEdit) await authAPI.updateUser(user.id, f)
      else await authAPI.register(f)
      toast.success(isEdit ? 'User updated' : 'User created'); onSaved()
    } catch {} finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit — ${user?.firstName} ${user?.lastName}` : 'New User'}>
      <form onSubmit={save} className="space-y-4">
        {!isEdit && (
          <div className="form-grid">
            <div className="form-group"><label className="label">Email *</label><input type="email" className="input" required value={f.email} onChange={upd('email')} /></div>
            <div className="form-group"><label className="label">Password *</label><input type="password" className="input" required minLength={8} value={f.password} onChange={upd('password')} placeholder="Min 8 chars, uppercase, number" /></div>
          </div>
        )}
        <div className="form-grid">
          <div className="form-group"><label className="label">First Name *</label><input className="input" required value={f.firstName} onChange={upd('firstName')} /></div>
          <div className="form-group"><label className="label">Last Name *</label><input className="input" required value={f.lastName} onChange={upd('lastName')} /></div>
          <div className="form-group"><label className="label">Role</label>
            <select className="select" value={f.role} onChange={upd('role')}>
              {['ADMIN','MANAGER','STAFF','TECHNICIAN'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div className="form-group"><label className="label">Status</label>
              <select className="select" value={f.status} onChange={upd('status')}>
                {['ACTIVE','INACTIVE','SUSPENDED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="form-group"><label className="label">Department</label><input className="input" value={f.department} onChange={upd('department')} /></div>
          <div className="form-group"><label className="label">Phone</label><input className="input" value={f.phone} onChange={upd('phone')} /></div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}</button>
        </div>
      </form>
    </Modal>
  )
}
