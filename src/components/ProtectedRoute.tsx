import { type ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types'

interface Props {
  children: ReactElement
  roles?: UserRole[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/products" replace />
  }

  return children
}
