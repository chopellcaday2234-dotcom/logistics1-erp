// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

import Login          from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword  from './pages/auth/ResetPassword'
import Dashboard      from './pages/dashboard/Dashboard'
import Procurement    from './pages/procurement/Procurement'
import Inventory      from './pages/inventory/Inventory'
import Assets         from './pages/assets/Assets'
import MRO            from './pages/mro/MRO'
import Projects       from './pages/projects/Projects'
import Reports        from './pages/reports/Reports'
import Validation     from './pages/reports/Validation'
import UserManagement from './pages/users/UserManagement'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: { background:'#1a1a26', color:'#e4e4e7', border:'1px solid #2a2a3a', borderRadius:'10px', fontSize:'14px' },
          success: { iconTheme:{ primary:'#10b981', secondary:'#1a1a26' } },
          error:   { iconTheme:{ primary:'#ef4444', secondary:'#1a1a26' } },
        }} />
        <Routes>
          <Route path="/login"           element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/inventory"   element={<Inventory />} />
            <Route path="/assets"      element={<Assets />} />
            <Route path="/mro"         element={<MRO />} />
            <Route path="/projects"    element={<Projects />} />
            <Route path="/reports"     element={<ProtectedRoute requiredRoles={['ADMIN','MANAGER']}><Reports /></ProtectedRoute>} />
            <Route path="/validation"  element={<ProtectedRoute requiredRoles={['ADMIN','MANAGER']}><Validation /></ProtectedRoute>} />
            <Route path="/users"       element={<ProtectedRoute requiredRoles={['ADMIN']}><UserManagement /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
