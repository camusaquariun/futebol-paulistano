import { useState, useEffect } from 'react'
import { useChampionships, useCategories, useSaveChampionship, useChampionshipCategories } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trophy, Plus, Edit, BarChart3, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { useQueryClient } from '@tanstack/react-query'
import type { Championship, ChampionshipStatus } from '@/types/database'

export default function ChampionshipsAdmin() {
  const { data: championships, isLoading } = useChampionships()
  const navigate = useNavigate()
  const { setSelectedId } = useAdminChampionship()
  const { data: categories } = useCategories()
  const saveMutation = useSaveChampionship()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Championship | null>(null)
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [status, setStatus] = useState<ChampionshipStatus>('draft')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsChamp, setSettingsChamp] = useState<Championship | null>(null)
  const { data: champCats } = useChampionshipCategories(settingsChamp?.id)
  const [catSettings, setCatSettings] = useState<Record<string, { turns: number; qualify_count: number; has_third_place: boolean }>>({})
  const [savingSettings, setSavingSettings] = useState(false)

  // Load settings when dialog opens
  useEffect(() => {
    if (champCats) {
      const settings: Record<string, { turns: number; qualify_count: number; has_third_place: boolean }> = {}
      for (const cc of champCats) {
        settings[cc.category_id] = {
          turns: (cc as any).turns ?? 1,
          qualify_count: (cc as any).qualify_count ?? 4,
          has_third_place: (cc as any).has_third_place ?? true,
        }
      }
      setCatSettings(settings)
    }
  }, [champCats])

  const openNew = () => {
    setEditing(null)
    setName('')
    setYear(new Date().getFullYear())
    setStatus('draft')
    setSelectedCategories(categories?.map(c => c.id) ?? [])
    setOpen(true)
  }

  const openEdit = (champ: Championship) => {
    setEditing(champ)
    setName(champ.name)
    setYear(champ.season_year)
    setStatus(champ.status)
    setOpen(true)
  }

  const openSettings = (champ: Championship) => {
    setSettingsChamp(champ)
    setSettingsOpen(true)
  }

  const handleSave = async () => {
    await saveMutation.mutateAsync({
      id: editing?.id,
      name,
      season_year: year,
      status,
      categories: editing ? undefined : selectedCategories,
    })
    setOpen(false)
  }

  const handleSaveSettings = async () => {
    if (!settingsChamp) return
    setSavingSettings(true)
    for (const [catId, settings] of Object.entries(catSettings)) {
      await supabase
        .from('championship_categories')
        .update({
          turns: settings.turns,
          qualify_count: settings.qualify_count,
          has_third_place: settings.has_third_place,
        })
        .eq('championship_id', settingsChamp.id)
        .eq('category_id', catId)
    }
    queryClient.invalidateQueries({ queryKey: ['championship_categories'] })
    setSavingSettings(false)
    setSettingsOpen(false)
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const updateCatSetting = (catId: string, field: string, value: any) => {
    setCatSettings(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [field]: value },
    }))
  }

  const statusBadge = (s: string) => {
    if (s === 'active') return <Badge variant="default">Ativo</Badge>
    if (s === 'finished') return <Badge variant="secondary">Finalizado</Badge>
    return <Badge variant="outline">Rascunho</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-gold-400" />
          <h1 className="text-2xl font-bold text-white">Campeonatos</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Campeonato</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="grid gap-4">
          {championships?.map(champ => (
            <Card key={champ.id} className="card-hover">
              <CardContent className="p-5 flex items-center justify-between">
                <button
                  className="text-left flex-1 min-w-0"
                  onClick={() => { setSelectedId(champ.id); navigate('/admin/classificacao') }}
                >
                  <h3 className="font-bold text-white text-lg hover:text-pitch-400 transition-colors">{champ.name}</h3>
                  <p className="text-sm text-slate-400">Temporada {champ.season_year}</p>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(champ.status)}
                  <Button variant="ghost" size="icon" onClick={() => openSettings(champ)} title="Configurações">
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedId(champ.id); navigate('/admin/classificacao') }} title="Classificação">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(champ)} title="Editar">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {championships?.length === 0 && (
            <div className="text-center py-8 text-slate-400">Nenhum campeonato cadastrado.</div>
          )}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Campeonato' : 'Novo Campeonato'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Campeonato Paulistano 2026" />
            </div>
            <div className="space-y-2">
              <Label>Ano da Temporada</Label>
              <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ChampionshipStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!editing && (
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
            )}
            <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-pitch-400" />
              Configurações — {settingsChamp?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {champCats?.map((cc: any) => {
              const cat = categories?.find(c => c.id === cc.category_id)
              const settings = catSettings[cc.category_id]
              if (!cat || !settings) return null
              return (
                <div key={cc.category_id} className="bg-navy-800 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Badge variant="secondary">{cat.name}</Badge>
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Formato da fase de grupos</Label>
                      <Select
                        value={String(settings.turns)}
                        onValueChange={v => updateCatSetting(cc.category_id, 'turns', Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Turno único (só ida)</SelectItem>
                          <SelectItem value="2">Ida e volta (2 turnos)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Classificam para mata-mata</Label>
                      <Select
                        value={String(settings.qualify_count)}
                        onValueChange={v => updateCatSetting(cc.category_id, 'qualify_count', Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 times</SelectItem>
                          <SelectItem value="4">4 times</SelectItem>
                          <SelectItem value="6">6 times</SelectItem>
                          <SelectItem value="8">8 times</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateCatSetting(cc.category_id, 'has_third_place', !settings.has_third_place)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        settings.has_third_place
                          ? 'bg-pitch-600/20 text-pitch-400 border border-pitch-600/30'
                          : 'bg-navy-700 text-slate-400 border border-navy-600'
                      }`}
                    >
                      {settings.has_third_place ? '✓' : '○'} Disputa de 3º lugar
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-500">
                    {settings.turns === 1 ? 'Turno único' : 'Ida e volta'} · {settings.qualify_count} classificam
                    {settings.has_third_place ? ' · Com 3º lugar' : ''}
                  </div>
                </div>
              )
            })}

            <Button onClick={handleSaveSettings} className="w-full" disabled={savingSettings}>
              {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
