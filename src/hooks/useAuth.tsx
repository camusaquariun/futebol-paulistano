import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null; isAdmin?: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchAdminStatus(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.role === 'admin'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('fp_is_admin') === '1')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Restore session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        setUser(session.user)
        const admin = await fetchAdminStatus(session.user.id)
        if (!cancelled) {
          setIsAdmin(admin)
          localStorage.setItem('fp_is_admin', admin ? '1' : '0')
        }
      }
      if (!cancelled) setLoading(false)
    })

    // Listen for ALL auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
        localStorage.removeItem('fp_is_admin')
      } else if (session?.user) {
        // Handles SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION
        setUser(session.user)
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const admin = await fetchAdminStatus(session.user.id)
          if (!cancelled) {
            setIsAdmin(admin)
            localStorage.setItem('fp_is_admin', admin ? '1' : '0')
          }
        }
      }
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: string | null; isAdmin?: boolean }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    setUser(data.user)
    const admin = await fetchAdminStatus(data.user.id)
    setIsAdmin(admin)
    localStorage.setItem('fp_is_admin', admin ? '1' : '0')
    setLoading(false)

    return { error: null, isAdmin: admin }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    localStorage.removeItem('fp_is_admin')
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
