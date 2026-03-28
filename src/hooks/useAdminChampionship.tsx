import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useChampionships } from '@/hooks/useSupabase'
import type { Championship } from '@/types/database'

interface AdminChampionshipContextType {
  championships: Championship[]
  selectedId: string | undefined
  selected: Championship | undefined
  setSelectedId: (id: string) => void
}

const AdminChampionshipContext = createContext<AdminChampionshipContextType | undefined>(undefined)

const STORAGE_KEY = 'admin_championship_id'

export function AdminChampionshipProvider({ children }: { children: ReactNode }) {
  const { data: championships } = useChampionships()
  const [selectedId, setSelectedId] = useState<string | undefined>(() => {
    return sessionStorage.getItem(STORAGE_KEY) ?? undefined
  })

  // Default to active championship if nothing selected
  useEffect(() => {
    if (championships && championships.length > 0 && !selectedId) {
      const active = championships.find(c => c.status === 'active')
      const fallback = championships[0]
      const id = (active ?? fallback).id
      setSelectedId(id)
      sessionStorage.setItem(STORAGE_KEY, id)
    }
  }, [championships, selectedId])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    sessionStorage.setItem(STORAGE_KEY, id)
  }

  const selected = championships?.find(c => c.id === selectedId)

  return (
    <AdminChampionshipContext.Provider value={{
      championships: championships ?? [],
      selectedId,
      selected,
      setSelectedId: handleSelect,
    }}>
      {children}
    </AdminChampionshipContext.Provider>
  )
}

export function useAdminChampionship() {
  const context = useContext(AdminChampionshipContext)
  if (context === undefined) {
    throw new Error('useAdminChampionship must be used within AdminChampionshipProvider')
  }
  return context
}
