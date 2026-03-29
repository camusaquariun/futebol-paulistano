import { useState } from 'react'
import { useTeams, useCategories, useSaveTeam, useDeleteTeam } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Plus, Edit, Trash2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Team } from '@/types/database'

export default function TeamsAdmin() {
  const { selectedId: championshipId } = useAdminChampionship()
  const { data: teams, isLoading } = useTeams(championshipId)
  const { data: categories } = useCategories()
  const saveMutation = useSaveTeam()
  const deleteMutation = useDeleteTeam()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [name, setName] = useState('')
  const [shieldUrl, setShieldUrl] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#1d4ed8')
  const [secondaryColor, setSecondaryColor] = useState('#ffffff')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const openNew = () => {
    setEditing(null)
    setName('')
    setShieldUrl(null)
    setPrimaryColor('#1d4ed8')
    setSecondaryColor('#ffffff')
    setSelectedCategories([])
    setOpen(true)
  }

  const openEdit = (team: Team) => {
    setEditing(team)
    setName(team.name)
    setShieldUrl(team.shield_url)
    setPrimaryColor(team.primary_color || '#1d4ed8')
    setSecondaryColor(team.secondary_color || '#ffffff')
    setSelectedCategories([])
    setOpen(true)
  }

  const handleUploadShield = async (file: File) => {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('shields').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('shields').getPublicUrl(path)
      setShieldUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const handleSave = async () => {
    await saveMutation.mutateAsync({
      team: { id: editing?.id, name, shield_url: shieldUrl, championship_id: championshipId, primary_color: primaryColor, secondary_color: secondaryColor },
      categoryIds: selectedCategories,
    })
    setOpen(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este time?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const [search, setSearch] = useState('')
  const filteredTeams = teams?.filter(t => t.name.toLowerCase().includes(search.toLowerCase())) ?? []

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Selecione um campeonato no menu lateral.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-pitch-400" />
          <h1 className="text-2xl font-bold text-white">Times</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Time</Button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar time pelo nome..."
        className="w-full sm:w-72 bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:border-pitch-500 focus:outline-none"
      />

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map(team => (
            <Card key={team.id} className="card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                {team.shield_url ? (
                  <img src={team.shield_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold border border-white/20"
                    style={{ backgroundColor: team.primary_color || '#1e293b', color: team.secondary_color || '#94a3b8' }}>
                    {team.name.charAt(0)}
                  </div>
                )}
                <Link to={`/admin/times/${team.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <p className="font-bold text-white truncate hover:text-pitch-400 transition-colors">{team.name}</p>
                </Link>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(team)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(team.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {teams?.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-400">Nenhum time cadastrado.</div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Time' : 'Novo Time'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Time</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: FC Condomínio" />
            </div>
            <div className="space-y-2">
              <Label>Escudo (opcional)</Label>
              <div className="flex items-center gap-3">
                {shieldUrl && <img src={shieldUrl} alt="" className="h-12 w-12 rounded-full object-cover" />}
                <label className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 bg-navy-700 rounded-lg text-sm text-slate-300 hover:bg-navy-600 transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploading ? 'Enviando...' : 'Upload'}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUploadShield(e.target.files[0])} />
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cores do Time</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Principal:</label>
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                    className="h-8 w-10 rounded cursor-pointer bg-transparent border border-navy-600" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Secundária:</label>
                  <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                    className="h-8 w-10 rounded cursor-pointer bg-transparent border border-navy-600" />
                </div>
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border border-white/20"
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                  {name?.charAt(0) || '?'}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categorias</Label>
              <div className="flex gap-2">
                {categories?.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategories.includes(cat.id)
                        ? 'bg-pitch-600 text-white'
                        : 'bg-navy-700 text-slate-400 hover:bg-navy-600'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
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
