import { useState } from 'react'
import { usePlayersByChampionship, useCategories, useTeams, useSavePlayer, useDeletePlayer, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Link } from 'react-router-dom'
import { UserCircle, Plus, Edit, Trash2, X } from 'lucide-react'
import type { Player } from '@/types/database'

interface TeamAssignment {
  team_id: string
  category_id: string
}

export default function PlayersAdmin() {
  const { selectedId: championshipId } = useAdminChampionship()
  const { data: players, isLoading } = usePlayersByChampionship(championshipId)
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const { data: teams } = useTeams(championshipId)
  const saveMutation = useSavePlayer()
  const deleteMutation = useDeletePlayer()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [assignments, setAssignments] = useState<TeamAssignment[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const openNew = () => {
    setEditing(null)
    setName('')
    setAssignments([])
    setOpen(true)
  }

  const openEdit = (player: Player) => {
    setEditing(player)
    setName(player.name)
    setAssignments([])
    setOpen(true)
  }

  const addAssignment = () => {
    setAssignments(prev => [...prev, { team_id: '', category_id: '' }])
  }

  const updateAssignment = (idx: number, field: keyof TeamAssignment, value: string) => {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  const removeAssignment = (idx: number) => {
    setAssignments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    const validAssignments = assignments.filter(a => a.team_id && a.category_id)
    await saveMutation.mutateAsync({
      player: { id: editing?.id, name },
      teams: validAssignments,
    })
    setOpen(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este jogador?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  const filtered = (players ?? []).filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCat = filterCategory === 'all' || p.links?.some((l: any) => l.category_id === filterCategory)
    return matchesSearch && matchesCat
  })

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Selecione um campeonato no menu lateral.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCircle className="h-7 w-7 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Jogadores</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Jogador</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none"
        >
          <option value="all">Todas categorias</option>
          {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((player: any) => (
            <Card key={player.id}>
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <Link to={`/admin/jogadores/${player.id}`} className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border border-navy-600">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-navy-700 flex items-center justify-center text-sm font-bold text-slate-300">
                        {player.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white truncate">{player.name}</p>
                    {player.links?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {player.links.map((l: any, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">
                            {l.team_name} · {l.category_name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {player.user_email && (
                      <p className="text-[10px] text-pitch-400 mt-0.5 truncate">👤 {player.user_email}</p>
                    )}
                    {!player.user_id && (
                      <p className="text-[10px] text-slate-500 mt-0.5">Sem usuário vinculado</p>
                    )}
                  </div>
                </Link>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(player)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(player.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-400">Nenhum jogador encontrado.</div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Jogador' : 'Novo Jogador'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do jogador" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vínculos (Time + Categoria)</Label>
                <Button variant="outline" size="sm" onClick={addAssignment}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar
                </Button>
              </div>
              {assignments.map((a, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={a.team_id} onValueChange={v => updateAssignment(idx, 'team_id', v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Time" /></SelectTrigger>
                    <SelectContent>
                      {teams?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={a.category_id} onValueChange={v => updateAssignment(idx, 'category_id', v)}>
                    <SelectTrigger className="w-32"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => removeAssignment(idx)} className="text-red-400">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
