import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthResponse, User } from '../types'
import { login as apiLogin } from '../api/client'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'mingzi-auth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: AuthResponse = JSON.parse(raw)
      setUser(parsed.user)
      setToken(parsed.token)
    }
  }, [])

  const value = useMemo(() => {
    return {
      user,
      token,
      async login(username: string, password: string) {
        const data = await apiLogin(username, password)
        setUser(data.user)
        setToken(data.token)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      },
      logout() {
        setUser(null)
        setToken(null)
        localStorage.removeItem(STORAGE_KEY)
      },
    }
  }, [user, token])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
