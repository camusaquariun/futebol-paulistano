import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlayers } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Users, Search, Link2, Unlink, UserCircle, Mail, Calendar, Loader2, ShieldCheck, ShieldOff, Phone, Plus, Pencil, Trash2, Ticket } from 'lucide-react'
import type { Player } from '@/types/database'

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-player`

interface AuthUser {
  id: string
  email: string
  display_name: string | null
  phone: string | null
  created_at: string
}

type UserFormState = {
  mode: 'create' | 'edit'
  id?: string
  email: string
  password: string
  display_name: string
  phone: string
}

const blankForm = (): UserFormState => ({
  mode: 'create',
  email: '',
  password: '',
  display_name: '',
  phone: '',
})

async function callEdge(body: Record<string, unknown>) {
  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function useAuthUsers() {
  return useQuery({
    queryKey: ['auth_users'],
    queryFn: async () => {
      const data = await callEdge({ action: 'list-users' })
      if (data.error) throw new Error(data.error)
      return data.users as AuthUser[]
    },
  })
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function UsersAdmin() {
  const { data: users, isLoading: usersLoading } = useAuthUsers()
  const { data: players, isLoading: playersLoading } = usePlayers()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [linking, setLinking] = useState<string | null>(null)
  const [playerSearch, setPlayerSearch] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [adminLoading, setAdminLoading] = useState<string | null>(null)
  const [form, setForm] = useState<UserFormState | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: adminRoles } = useQuery({
    queryKey: ['user_roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role').eq('role', 'admin')
      return new Set((data ?? []).map((r: any) => r.user_id as string))
    },
  })

  const { data: poolParticipants } = useQuery({
    queryKey: ['pool_participants'],
    queryFn: async () => {
      const { data } = await supabase.from('pool_participants').select('user_id')
      return new Set((data ?? []).map((r: any) => r.user_id as string))
    },
  })

  const { data: playerLinks } = useQuery({
    queryKey: ['user_admin_player_links'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_teams')
        .select('player_id, team:teams(id, name), category:categories(id, name)')
      return data ?? []
    },
  })

  // Build: player_id -> [{teamId, teamName, categoryId, categoryName}]
  const playerLinksMap = useMemo(() => {
    const m = new Map<string, { teamId: string; teamName: string; categoryId: string; categoryName: string }[]>()
    for (const l of (playerLinks ?? []) as any[]) {
      const arr = m.get(l.player_id) ?? []
      arr.push({ teamId: l.team?.id, teamName: l.team?.name, categoryId: l.category?.id, categoryName: l.category?.name })
      m.set(l.player_id, arr)
    }
    return m
  }, [playerLinks])

  const allTeams = useMemo(() => {
    const s = new Map<string, string>()
    for (const arr of playerLinksMap.values()) for (const l of arr) if (l.teamId) s.set(l.teamId, l.teamName)
    return [...s.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [playerLinksMap])

  const allCategories = useMemo(() => {
    const s = new Map<string, string>()
    for (const arr of playerLinksMap.values()) for (const l of arr) if (l.categoryId) s.set(l.categoryId, l.categoryName)
    return [...s.entries()].map(([id, name]) => ({ id, name }))
  }, [playerLinksMap])

  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'non_admin'>('all')
  const [filterPool, setFilterPool] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [poolLoading, setPoolLoading] = useState<string | null>(null)
  const handleTogglePool = async (userId: string, currently: boolean) => {
    setPoolLoading(userId)
    try {
      if (currently) {
        await supabase.from('pool_participants').delete().eq('user_id', userId)
      } else {
        await supabase.from('pool_participants').upsert({ user_id: userId }, { onConflict: 'user_id' })
      }
      queryClient.invalidateQueries({ queryKey: ['pool_participants'] })
    } finally { setPoolLoading(null) }
  }

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

  const playerByUserId = new Map<string, Player>()
  if (players) for (const p of players) if (p.user_id) playerByUserId.set(p.user_id, p)

  const filteredUsers = (users ?? []).filter(u => {
    const q = norm(search)
    if (q && !(norm(u.email ?? '').includes(q) || norm(u.display_name ?? '').includes(q))) return false
    const isAdmin = adminRoles?.has(u.id) ?? false
    if (filterRole === 'admin' && !isAdmin) return false
    if (filterRole === 'non_admin' && isAdmin) return false
    const isPool = poolParticipants?.has(u.id) ?? false
    if (filterPool === 'enabled' && !isPool) return false
    if (filterPool === 'disabled' && isPool) return false
    if (filterTeam !== 'all' || filterCategory !== 'all') {
      const linkedPlayer = playerByUserId.get(u.id)
      const links = linkedPlayer ? playerLinksMap.get(linkedPlayer.id) ?? [] : []
      if (filterTeam !== 'all' && !links.some((l: any) => l.teamId === filterTeam)) return false
      if (filterCategory !== 'all' && !links.some((l: any) => l.categoryId === filterCategory)) return false
    }
    return true
  })

  const hasActiveFilter = filterRole !== 'all' || filterPool !== 'all' || filterTeam !== 'all' || filterCategory !== 'all' || !!search

  const filteredPlayers = (players ?? []).filter(p => {
    if (!playerSearch) return true
    return norm(p.name).includes(norm(playerSearch))
  }).filter(p => !p.user_id)

  const handleLink = async (userId: string, playerId: string, email: string) => {
    setActionLoading(true)
    try {
      const data = await callEdge({ action: 'link', player_id: playerId, email })
      if (data.error) { alert('Erro: ' + data.error); return }
      queryClient.invalidateQueries({ queryKey: ['players'] })
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      setLinking(null)
      setPlayerSearch('')
    } finally { setActionLoading(false) }
  }

  const handleUnlink = async (playerId: string) => {
    if (!confirm('Desvincular este jogador do usuário?')) return
    setActionLoading(true)
    try {
      const data = await callEdge({ action: 'unlink', player_id: playerId })
      if (data.error) { alert('Erro: ' + data.error); return }
      queryClient.invalidateQueries({ queryKey: ['players'] })
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
    } finally { setActionLoading(false) }
  }

  const handleDelete = async (user: AuthUser) => {
    if (!confirm(`Excluir o usuário ${user.email}? Esta ação não pode ser desfeita.`)) return
    setActionLoading(true)
    try {
      const data = await callEdge({ action: 'delete-user', user_id: user.id })
      if (data.error) { alert('Erro: ' + data.error); return }
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      queryClient.invalidateQueries({ queryKey: ['players'] })
      queryClient.invalidateQueries({ queryKey: ['user_roles'] })
    } finally { setActionLoading(false) }
  }

  const openCreate = () => {
    setFormError(null)
    setForm({ ...blankForm(), mode: 'create' })
  }
  const openEdit = (u: AuthUser) => {
    setFormError(null)
    setForm({
      mode: 'edit',
      id: u.id,
      email: u.email ?? '',
      password: '',
      display_name: u.display_name ?? '',
      phone: u.phone ?? '',
    })
  }

  const submitForm = async () => {
    if (!form) return
    setFormSaving(true)
    setFormError(null)
    try {
      const payload: Record<string, unknown> = {
        action: form.mode === 'create' ? 'create-user' : 'update-user',
        email: form.email.trim(),
        display_name: form.display_name.trim() || null,
        phone: form.phone.trim() || null,
      }
      if (form.mode === 'create') {
        if (!form.email || !form.password) {
          setFormError('Email e senha são obrigatórios')
          return
        }
        payload.password = form.password
      } else {
        payload.user_id = form.id
        if (form.password) payload.password = form.password
      }
      const data = await callEdge(payload)
      if (data.error) { setFormError(data.error); return }
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      setForm(null)
    } finally { setFormSaving(false) }
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
        <div className="flex items-center gap-3">
          {users && (
            <Badge variant="secondary" className="text-sm">
              {users.length} usuario{users.length !== 1 ? 's' : ''}
            </Badge>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />Novo Usuário
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por email ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as any)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Todos os papéis</option>
            <option value="admin">Apenas Admins</option>
            <option value="non_admin">Apenas Jogadores</option>
          </select>
          <select
            value={filterPool}
            onChange={e => setFilterPool(e.target.value as any)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Bolão: Todos</option>
            <option value="enabled">Bolão: Liberados</option>
            <option value="disabled">Bolão: Bloqueados</option>
          </select>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Todas categorias</option>
            {allCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Todos os times</option>
            {allTeams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setFilterRole('all'); setFilterPool('all'); setFilterTeam('all'); setFilterCategory('all') }}
              className="text-slate-400"
            >
              Limpar filtros
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {filteredUsers.length}{hasActiveFilter ? ` de ${users?.length ?? 0}` : ''} usuários
          </span>
        </div>
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
            const isPoolMember = poolParticipants?.has(user.id) ?? false

            return (
              <Card key={user.id} className="border-navy-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
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
                          {isPoolMember && (
                            <Badge className="bg-pitch-500/20 text-pitch-300 border-pitch-500/30 text-[10px] px-1.5 py-0">
                              <Ticket className="h-3 w-3 mr-0.5" />Bolão
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-400">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-400">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="truncate">{user.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          Registrado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTogglePool(user.id, isPoolMember)}
                        disabled={poolLoading === user.id}
                        className={isPoolMember
                          ? 'text-pitch-300 hover:text-pitch-200 hover:bg-pitch-500/10'
                          : 'text-slate-500 hover:text-pitch-300 hover:bg-pitch-500/10'
                        }
                        title={isPoolMember ? 'Remover acesso ao Bolão' : 'Liberar acesso ao Bolão'}
                      >
                        {poolLoading === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(user)}
                        className="text-slate-300 hover:text-white hover:bg-navy-700"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(user)}
                        disabled={actionLoading}
                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
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

      <Dialog open={form !== null} onOpenChange={open => { if (!open) setForm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.mode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="u-name">Nome</Label>
                <Input id="u-name" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="u-phone">Telefone</Label>
                <Input id="u-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label htmlFor="u-pw">{form.mode === 'create' ? 'Senha' : 'Nova senha (opcional)'}</Label>
                <Input id="u-pw" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={form.mode === 'edit' ? 'Deixe em branco para manter a atual' : ''} />
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={formSaving}>Cancelar</Button>
            <Button onClick={submitForm} disabled={formSaving}>
              {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
