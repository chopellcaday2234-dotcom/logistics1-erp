// src/components/layout/AppLayout.jsx
import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { notificationsAPI } from '../../api/client'
import {
  LayoutDashboard, ShoppingCart, Package, Cpu, Wrench,
  FolderKanban, BarChart3, ShieldCheck, Bell, LogOut,
  Menu, X, User, Boxes, Users,
} from 'lucide-react'

const NAV = [
  { to:'/dashboard',   label:'Dashboard',   icon:LayoutDashboard, roles:null },
  { to:'/procurement', label:'Procurement', icon:ShoppingCart,    roles:null },
  { to:'/inventory',   label:'Inventory',   icon:Package,         roles:null },
  { to:'/assets',      label:'Assets',      icon:Cpu,             roles:null },
  { to:'/mro',         label:'MRO',         icon:Wrench,          roles:null },
  { to:'/projects',    label:'Projects',    icon:FolderKanban,    roles:null },
  { to:'/reports',     label:'Reports',     icon:BarChart3,       roles:['ADMIN','MANAGER'] },
  { to:'/validation',  label:'Validation',  icon:ShieldCheck,     roles:['ADMIN','MANAGER'] },
  { to:'/users',       label:'Users',       icon:Users,           roles:['ADMIN'] },
]

const ROLE_BADGE = { ADMIN:'bg-red-500/15 text-red-400', MANAGER:'bg-blue-500/15 text-blue-400', STAFF:'bg-emerald-500/15 text-emerald-400', TECHNICIAN:'bg-purple-500/15 text-purple-400' }
const NOTIF_DOT = { INFO:'bg-blue-500', WARNING:'bg-amber-500', ALERT:'bg-orange-500', SUCCESS:'bg-emerald-500', ERROR:'bg-red-500' }

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)

  const loadNotifs = async () => {
    try {
      const [n, c] = await Promise.all([notificationsAPI.getAll({ limit:8 }), notificationsAPI.getUnreadCount()])
      setNotifs(n.data.data.notifications || [])
      setUnread(c.data.data.unreadCount || 0)
    } catch {}
  }

  useEffect(() => {
    loadNotifs()
    const id = setInterval(loadNotifs, 30000)
    return () => clearInterval(id)
  }, [])

  const markRead = async (id) => {
    await notificationsAPI.markRead(id).catch(()=>{})
    loadNotifs()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV.filter(item => !item.roles || hasRole(item.roles))

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col w-[var(--sidebar-w)] bg-surface-800 border-r border-surface-600 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-600">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5 text-surface-900" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-zinc-100 leading-none">Logistics 1</p>
            <p className="text-xs text-zinc-500 mt-0.5">Hotel & Restaurant ERP</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all
                ${isActive ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'}`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-surface-600">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-200 truncate">{user?.firstName} {user?.lastName}</p>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${ROLE_BADGE[user?.role]||''}`}>
                {user?.role}
              </span>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-700 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[var(--sidebar-w)]">
        {/* Topbar */}
        <header className="flex items-center justify-between px-5 py-3 bg-surface-800 border-b border-surface-600 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-surface-700">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />

          {/* Notification Bell */}
          <div className="relative">
            <button onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-surface-700 transition-colors">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-500 text-surface-900 text-[10px] font-bold rounded-full flex items-center justify-center pulse-ring">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 card shadow-2xl z-50 animate-fadeIn">
                <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600">
                  <span className="font-semibold text-sm text-zinc-200">Notifications</span>
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <button onClick={async () => { await notificationsAPI.markAllRead(); loadNotifs() }}
                        className="text-xs text-brand-400 hover:text-brand-300">Mark all read</button>
                    )}
                    <button onClick={() => setNotifOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!notifs.length
                    ? <p className="text-center text-zinc-500 text-sm py-8">No notifications</p>
                    : notifs.map(n => (
                      <button key={n.id} onClick={() => markRead(n.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-surface-750 border-b border-surface-700/50 transition-colors ${!n.isRead ? 'bg-surface-750' : ''}`}>
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${NOTIF_DOT[n.type]||'bg-zinc-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${!n.isRead ? 'text-zinc-100' : 'text-zinc-400'}`}>{n.title}</p>
                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">{new Date(n.createdAt).toLocaleString('en-PH',{dateStyle:'short',timeStyle:'short'})}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
