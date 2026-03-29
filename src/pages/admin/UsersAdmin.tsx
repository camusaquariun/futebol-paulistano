import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlayers } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Users, Search, Link2, Unlink, UserCircle, Mail, Calendar, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import type { Player } from '@/types/database'

const EDGE_FN_URL = 'https://euufoowdghcczoovulfq.supabase.co/functions/v1/link-player'

interface AuthUser {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

function useAuthUsers() {
  return useQuery({
    queryKey: ['auth_users'],
    queryFn: async () => {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-users' }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      return data.users as AuthUser[]
    },
  })
}

export default function UsersAdmin() {
  const { data: users, isLoading: usersLoading } = useAuthUsers()
  const { data: players, isLoading: playersLoading } = usePlayers()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [linking, setLinking] = useState<string | null>(null)
  const [playerSearch, setPlayerSearch] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [adminLoading, setAdminLoading] = useState<string | null>(null)

  const { data: adminRoles } = useQuery({
    queryKey: ['user_roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role').eq('role', 'admin')
      return new Set((data ?? []).map((r: any) => r.user_id as string))
    },
  })

  const handleToggleAdmin = async (userId: string, currentlyAdmin: boolean) => {
    if (!confirm(currentlyAdmin ? 'Remover permissão de admin?' : 'Tornar este usuário admin?')) return
    setAdminLoading(userId)
    try {
      if (currentlyAdmin) {
        await supabase.from('user_roles').delete().eq('user_id', userId)
      } else {
        await supabase.from('user_roles').upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id' })
      }
      queryClient.invalidateQueries({ queryKey: ['user_roles'] })
    } finally {
      setAdminLoading(null)
    }
  }

  // Map player user_id -> player for quick lookup
  const playerByUserId = new Map<string, Player>()
  if (players) {
    for (const p of players) {
      if (p.user_id) playerByUserId.set(p.user_id, p)
    }
  }

  const filteredUsers = (users ?? []).filter(u => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      u.email?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q)
    )
  })

  const filteredPlayers = (players ?? []).filter(p => {
    if (!playerSearch) return true
    return p.name.toLowerCase().includes(playerSearch.toLowerCase())
  }).filter(p => !p.user_id) // Only show unlinked players

  const handleLink = async (userId: string, playerId: string, email: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', player_id: playerId, email }),
      })
      const data = await res.json()
      if (data.error) {
        alert('Erro: ' + data.error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['players'] })
        queryClient.invalidateQueries({ queryKey: ['auth_users'] })
        setLinking(null)
        setPlayerSearch('')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnlink = async (playerId: string) => {
    if (!confirm('Desvincular este jogador do usuário?')) return
    setActionLoading(true)
    try {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', player_id: playerId }),
      })
      const data = await res.json()
      if (data.error) {
        alert('Erro: ' + data.error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['players'] })
        queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      }
    } finally {
      setActionLoading(false)
    }
  }

  const isLoading = usersLoading || playersLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-pitch-400" />
            Usuarios
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie usuarios registrados e vincule-os aos jogadores do campeonato
          </p>
        </div>
        {users && (
          <Badge variant="secondary" className="text-sm">
            {users.length} usuario{users.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por email ou nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-pitch-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map(user => {
            const linkedPlayer = playerByUserId.get(user.id)
            const isLinking = linking === user.id
            const isAdmin = adminRoles?.has(user.id) ?? false

            return (
              <Card key={user.id} className="border-navy-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* User Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="bg-navy-700 rounded-full p-2 flex-shrink-0">
                        <UserCircle className="h-8 w-8 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">
                            {user.display_name || 'Sem nome'}
                          </span>
                          {isAdmin && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                              <ShieldCheck className="h-3 w-3 mr-0.5" />Admin
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-400">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          Registrado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Admin toggle */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleAdmin(user.id, isAdmin)}
                        disabled={adminLoading === user.id}
                        className={isAdmin
                          ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                          : 'text-slate-500 hover:text-amber-400 hover:bg-amber-400/10'
                        }
                        title={isAdmin ? 'Remover admin' : 'Tornar admin'}
                      >
                        {adminLoading === user.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : isAdmin
                            ? <ShieldCheck className="h-4 w-4" />
                            : <ShieldOff className="h-4 w-4" />
                        }
                      </Button>
                      {linkedPlayer ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-pitch-600/20 text-pitch-400 border-pitch-600/30">
                            <Link2 className="h-3 w-3 mr-1" />
                            {linkedPlayer.name}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                            onClick={() => handleUnlink(linkedPlayer.id)}
                            disabled={actionLoading}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-slate-300"
                          onClick={() => {
                            setLinking(isLinking ? null : user.id)
                            setPlayerSearch('')
                          }}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Vincular jogador
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Linking Panel */}
                  {isLinking && (
                    <div className="mt-4 pt-4 border-t border-navy-700">
                      <div className="text-sm text-slate-400 mb-2">
                        Selecione o jogador para vincular a <span className="text-white">{user.email}</span>:
                      </div>
                      <Input
                        placeholder="Buscar jogador pelo nome..."
                        value={playerSearch}
                        onChange={e => setPlayerSearch(e.target.value)}
                        className="mb-3"
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredPlayers.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">
                            {playerSearch ? 'Nenhum jogador encontrado' : 'Todos os jogadores ja estao vinculados'}
                          </p>
                        ) : (
                          filteredPlayers.slice(0, 20).map(player => (
                            <button
                              key={player.id}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-navy-700 transition-colors text-left"
                              onClick={() => handleLink(user.id, player.id, user.email!)}
                              disabled={actionLoading}
                            >
                              <span className="text-sm text-white">{player.name}</span>
                              <Link2 className="h-4 w-4 text-pitch-400" />
                            </button>
                          ))
                        )}
                        {filteredPlayers.length > 20 && (
                          <p className="text-xs text-slate-500 px-3 py-1">
                            +{filteredPlayers.length - 20} jogadores... refine a busca
                          </p>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400"
                          onClick={() => { setLinking(null); setPlayerSearch('') }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              {search ? 'Nenhum usuario encontrado' : 'Nenhum usuario registrado'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
