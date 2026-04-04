// src/components/layout/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../ui'

export default function ProtectedRoute({ children, requiredRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="text-center">
          <p className="font-display text-xl text-zinc-400 mb-2">Access Denied</p>
          <p className="text-zinc-600 text-sm">You don't have permission to view this page.</p>
        </div>
      </div>
    )
  }

  return children
}
