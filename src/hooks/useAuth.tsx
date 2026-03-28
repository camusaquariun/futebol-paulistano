import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // On mount: check existing session
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        setUser(session.user)
        const admin = await fetchAdminStatus(session.user.id)
        if (!cancelled) setIsAdmin(admin)
      }
      if (!cancelled) setLoading(false)
    })

    // Listen for auth changes (token refresh, sign out from other tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsAdmin(false)
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user)
      }
      // SIGNED_IN is handled by signIn() directly — don't duplicate here
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    // Set user and admin status BEFORE returning, so the navigate happens after state is ready
    setUser(data.user)
    const admin = await fetchAdminStatus(data.user.id)
    setIsAdmin(admin)
    setLoading(false)

    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
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
