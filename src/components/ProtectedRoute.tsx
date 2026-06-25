import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth()

  if (session === undefined || (session && profile === undefined)) {
    return <div className="loading">טוען...</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
