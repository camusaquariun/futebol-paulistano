import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMatches, useCategories, useTeamsByCategory, useSaveMatch, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar, Plus, Edit, ChevronRight, Star, Trash2, Pencil } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { MatchPhase } from '@/types/database'

const VALID_DAYS = [1, 2, 4] // Monday, Tuesday, Thursday
const DAY_NAMES: Record<number, string> = { 1: 'Seg', 2: 'Ter', 4: 'Qui' }

function getValidDates(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (dates.length < count) {
    if (VALID_DAYS.includes(d.getDay())) dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const day = DAY_NAMES[d.getDay()] ?? ''
  return `${day}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

export default function MatchesAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPhase, setFilterPhase] = useState<string>('all')
  const { data: matches, isLoading } = useMatches(championshipId, filterCategory !== 'all' ? filterCategory : undefined)

  const saveMutation = useSaveMatch()
  const queryClient = useQueryClient()
  const validDates = useMemo(() => getValidDates(24), [])
  const [open, setOpen] = useState(false)
  // Schedule editor
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleMatchId, setScheduleMatchId] = useState('')
  const [scheduleDay, setScheduleDay] = useState('')
  const [scheduleTime, setScheduleTime] = useState('20:00')
  const [scheduleLocation, setScheduleLocation] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [phase, setPhase] = useState<MatchPhase>('grupos')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('20:00')
  const [location, setLocation] = useState('')
  const [round, setRound] = useState(1)
  const { data: teamsForCategory } = useTeamsByCategory(championshipId, categoryId || undefined)

  // Edit match state
  const [editOpen, setEditOpen] = useState(false)
  const [editMatchId, setEditMatchId] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editPhase, setEditPhase] = useState<MatchPhase>('grupos')
  const [editHomeTeamId, setEditHomeTeamId] = useState('')
  const [editAwayTeamId, setEditAwayTeamId] = useState('')
  const [editMatchDate, setEditMatchDate] = useState('')
  const [editMatchTime, setEditMatchTime] = useState('20:00')
  const [editLocation, setEditLocation] = useState('')
  const [editRound, setEditRound] = useState(1)
  const [editSaving, setEditSaving] = useState(false)
  const { data: teamsForEditCategory } = useTeamsByCategory(championshipId, editCategoryId || undefined)

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null)

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const openNew = () => {
    setCategoryId(activeCategories[0]?.id ?? '')
    setPhase('grupos')
    setHomeTeamId('')
    setAwayTeamId('')
    setMatchDate('')
    setLocation('')
    setRound(1)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!championshipId) return
    await saveMutation.mutateAsync({
      championship_id: championshipId,
      category_id: categoryId,
      phase,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDate ? `${matchDate}T${matchTime}:00` : null,
      location: location || null,
      round,
      status: 'scheduled',
    })
    setOpen(false)
  }

  const openSchedule = (match: any) => {
    setScheduleMatchId(match.id)
    if (match.match_date) {
      const d = new Date(match.match_date)
      setScheduleDay(d.toISOString().split('T')[0])
      const h = d.getHours()
      setScheduleTime(h >= 21 ? '21:00' : '20:00')
    } else {
      setScheduleDay('')
      setScheduleTime('20:00')
    }
    setScheduleLocation(match.location ?? '')
    setScheduleOpen(true)
  }

  const handleSaveSchedule = async () => {
    if (!scheduleMatchId) return
    setScheduleSaving(true)
    const matchDate = scheduleDay ? `${scheduleDay}T${scheduleTime}:00` : null
    await supabase.from('matches').update({
      match_date: matchDate,
      location: scheduleLocation || null,
    }).eq('id', scheduleMatchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setScheduleSaving(false)
    setScheduleOpen(false)
  }

  const handleGenerateReturnMatches = async (catId: string) => {
    if (!championshipId) return
    const catMatches = matches?.filter(m => m.category_id === catId && m.phase === 'grupos' && (m as any).round === 1) ?? []
    const existing2nd = matches?.filter(m => m.category_id === catId && m.phase === 'grupos' && (m as any).round === 2) ?? []
    if (existing2nd.length > 0) { alert('Jogos de volta já existem para esta categoria.'); return }
    if (catMatches.length === 0) { alert('Nenhum jogo de ida encontrado.'); return }
    const returnMatches = catMatches.map(m => ({
      championship_id: championshipId,
      category_id: catId,
      phase: 'grupos' as const,
      home_team_id: m.away_team_id,
      away_team_id: m.home_team_id,
      status: 'scheduled' as const,
      round: 2,
    }))
    await supabase.from('matches').insert(returnMatches)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    alert(`${returnMatches.length} jogos de volta gerados!`)
  }

  const openEditMatch = (match: any) => {
    setEditMatchId(match.id)
    setEditCategoryId(match.category_id)
    setEditPhase(match.phase)
    setEditHomeTeamId(match.home_team_id)
    setEditAwayTeamId(match.away_team_id)
    setEditRound((match as any).round ?? 1)
    setEditLocation(match.location ?? '')
    if (match.match_date) {
      const d = new Date(match.match_date)
      setEditMatchDate(d.toISOString().split('T')[0])
      const h = d.getHours()
      setEditMatchTime(h >= 21 ? '21:00' : '20:00')
    } else {
      setEditMatchDate('')
      setEditMatchTime('20:00')
    }
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editMatchId) return
    setEditSaving(true)
    const dateValue = editMatchDate ? `${editMatchDate}T${editMatchTime}:00` : null
    await supabase.from('matches').update({
      category_id: editCategoryId,
      phase: editPhase,
      home_team_id: editHomeTeamId,
      away_team_id: editAwayTeamId,
      match_date: dateValue,
      location: editLocation || null,
      round: editRound,
    }).eq('id', editMatchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setEditSaving(false)
    setEditOpen(false)
  }

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta partida? Essa ação não pode ser desfeita.')) return
    setDeleting(matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setDeleting(null)
  }

  // Fetch goal events for all finished matches
  const finishedMatchIds = useMemo(() =>
    matches?.filter(m => m.status === 'finished').map(m => m.id) ?? []
  , [matches])

  const { data: allGoalEvents } = useQuery({
    queryKey: ['match_goals_bulk', championshipId, filterCategory],
    queryFn: async () => {
      const { data } = await supabase.from('match_events')
        .select('match_id, event_type, player:players(name), team_id')
        .in('match_id', finishedMatchIds)
        .in('event_type', ['goal', 'own_goal'])
      return data ?? []
    },
    enabled: finishedMatchIds.length > 0,
  })

  // Fetch MOTM player names for finished matches
  const { data: motmData } = useQuery({
    queryKey: ['match_motm_bulk', championshipId, filterCategory],
    queryFn: async () => {
      const { data } = await supabase.from('matches')
        .select('id, motm_player:players!matches_motm_player_id_fkey(name)')
        .in('id', finishedMatchIds)
        .not('motm_player_id', 'is', null)
      return data ?? []
    },
    enabled: finishedMatchIds.length > 0,
  })

  // Group goals by match
  const goalsByMatch = useMemo(() => {
    const map = new Map<string, Array<{ name: string; team_id: string; isOwnGoal: boolean }>>()
    for (const e of allGoalEvents ?? []) {
      const list = map.get(e.match_id) ?? []
      list.push({ name: (e.player as any)?.name ?? '?', team_id: e.team_id, isOwnGoal: e.event_type === 'own_goal' })
      map.set(e.match_id, list)
    }
    return map
  }, [allGoalEvents])

  // MOTM by match
  const motmByMatch = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of motmData ?? []) {
      map.set(m.id, (m.motm_player as any)?.name ?? '')
    }
    return map
  }, [motmData])

  const filtered = matches?.filter(m =>
    filterPhase === 'all' || m.phase === filterPhase
  ) ?? []

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Nenhum campeonato ativo.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-7 w-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Partidas</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova Partida</Button>
      </div>

      {/* Filters + Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPhase} onValueChange={setFilterPhase}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Fase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="grupos">Grupos</SelectItem>
            <SelectItem value="semifinal">Semifinal</SelectItem>
            <SelectItem value="terceiro_lugar">3º Lugar</SelectItem>
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
        {/* Generate return matches for categories with ida e volta */}
        {filterCategory !== 'all' && (() => {
          const cc = champCategories?.find((c: any) => c.category_id === filterCategory)
          const has2ndRound = matches?.some(m => m.category_id === filterCategory && (m as any).round === 2)
          if ((cc as any)?.turns === 2 && !has2ndRound) {
            return (
              <Button variant="outline" size="sm" onClick={() => handleGenerateReturnMatches(filterCategory)}
                className="border-gold-500/50 text-gold-400 hover:bg-gold-500/10">
                🔄 Gerar jogos de volta
              </Button>
            )
          }
          return null
        })()}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(match => (
            <Card key={match.id} className="card-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <Link to={`/admin/partidas/${match.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{match.category?.name}</Badge>
                    <Badge variant="outline" className="text-xs">{phaseLabel(match.phase)}</Badge>
                    {match.phase === 'grupos' && (match as any).round === 2 && (
                      <Badge variant="outline" className="text-xs text-gold-400 border-gold-500/30">2º Turno</Badge>
                    )}
                    <Badge variant={match.status === 'finished' ? 'default' : 'secondary'} className="text-xs">
                      {match.status === 'finished' ? 'Encerrado' : 'Agendado'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-white font-medium">
                    <span>{match.home_team?.name}</span>
                    {match.status === 'finished' ? (
                      <span className="text-lg font-bold text-gold-400">{match.home_score} × {match.away_score}</span>
                    ) : (
                      <span className="text-slate-500">vs</span>
                    )}
                    <span>{match.away_team?.name}</span>
                  </div>
                  {match.match_date ? (
                    <p className="text-xs text-slate-400 mt-1">{formatDate(match.match_date)}{match.location ? ` — ${match.location}` : ''}</p>
                  ) : (
                    <p className="text-xs text-gold-400/60 mt-1">Sem data definida</p>
                  )}
                  {match.status === 'finished' && (() => {
                    const goals = goalsByMatch.get(match.id)
                    const motm = motmByMatch.get(match.id)
                    if (!goals?.length && !motm) return null
                    const homeGoals = goals?.filter(g => !g.isOwnGoal ? g.team_id === match.home_team_id : g.team_id !== match.home_team_id) ?? []
                    const awayGoals = goals?.filter(g => !g.isOwnGoal ? g.team_id === match.away_team_id : g.team_id !== match.away_team_id) ?? []
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px]">
                        {homeGoals.length > 0 && (
                          <span className="text-slate-400">
                            {homeGoals.map((g, i) => (
                              <span key={i}>{i > 0 ? ', ' : ''}⚽ {g.name}{g.isOwnGoal ? ' (GC)' : ''}</span>
                            ))}
                          </span>
                        )}
                        {awayGoals.length > 0 && (
                          <span className="text-slate-400">
                            {awayGoals.map((g, i) => (
                              <span key={i}>{i > 0 ? ', ' : ''}⚽ {g.name}{g.isOwnGoal ? ' (GC)' : ''}</span>
                            ))}
                          </span>
                        )}
                        {motm && (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400" />{motm}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {match.status !== 'finished' && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEditMatch(match)} title="Editar partida">
                        <Pencil className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteMatch(match.id)} disabled={deleting === match.id} title="Excluir partida">
                        <Trash2 className="h-4 w-4 text-red-400/60 hover:text-red-400" />
                      </Button>
                    </>
                  )}
                  {match.status === 'finished' && (
                    <Button variant="ghost" size="icon" onClick={() => openSchedule(match)} title="Definir data/hora">
                      <Calendar className="h-4 w-4 text-slate-400" />
                    </Button>
                  )}
                  <Link to={`/admin/partidas/${match.id}`}>
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400">Nenhuma partida encontrada.</div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Partida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={phase} onValueChange={v => setPhase(v as MatchPhase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupos">Fase de Grupos</SelectItem>
                  <SelectItem value="semifinal">Semifinal</SelectItem>
                  <SelectItem value="terceiro_lugar">Terceiro Lugar</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time Casa</Label>
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForCategory?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time Visitante</Label>
                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForCategory?.filter(t => t.id !== homeTeamId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data (Seg/Ter/Qui)</Label>
                <Select value={matchDate} onValueChange={setMatchDate}>
                  <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                  <SelectContent>
                    {validDates.map(d => (
                      <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMatchTime('20:00')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${matchTime === '20:00' ? 'bg-pitch-600 text-white' : 'bg-navy-800 text-slate-400'}`}>
                    20:00
                  </button>
                  <button type="button" onClick={() => setMatchTime('21:00')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${matchTime === '21:00' ? 'bg-pitch-600 text-white' : 'bg-navy-800 text-slate-400'}`}>
                    21:00
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Local (opcional)</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Campo do Condomínio" />
              </div>
              {phase === 'grupos' && (
                <div className="space-y-2">
                  <Label>Turno</Label>
                  <Select value={String(round)} onValueChange={v => setRound(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1º Turno (Ida)</SelectItem>
                      <SelectItem value="2">2º Turno (Volta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending || !homeTeamId || !awayTeamId}>
              {saveMutation.isPending ? 'Salvando...' : 'Criar Partida'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule editor dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-pitch-400" />
              Definir Data e Local
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data (Seg/Ter/Qui)</Label>
              <Select value={scheduleDay} onValueChange={setScheduleDay}>
                <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                <SelectContent>
                  {validDates.map(d => (
                    <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Horário</Label>
              <div className="flex gap-2">
                <button onClick={() => setScheduleTime('20:00')}
                  className={`flex-1 py-3 rounded-xl text-lg font-bold transition-all ${scheduleTime === '20:00' ? 'bg-pitch-600 text-white ring-2 ring-pitch-400' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
                  20:00
                </button>
                <button onClick={() => setScheduleTime('21:00')}
                  className={`flex-1 py-3 rounded-xl text-lg font-bold transition-all ${scheduleTime === '21:00' ? 'bg-pitch-600 text-white ring-2 ring-pitch-400' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
                  21:00
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Local</Label>
              <Input value={scheduleLocation} onChange={e => setScheduleLocation(e.target.value)} placeholder="Campo do Condomínio" />
            </div>
            <Button onClick={handleSaveSchedule} className="w-full" disabled={scheduleSaving}>
              {scheduleSaving ? 'Salvando...' : 'Salvar Agenda'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit match dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-pitch-400" />
              Editar Partida
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={editPhase} onValueChange={v => setEditPhase(v as MatchPhase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupos">Fase de Grupos</SelectItem>
                  <SelectItem value="semifinal">Semifinal</SelectItem>
                  <SelectItem value="terceiro_lugar">Terceiro Lugar</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time Casa</Label>
                <Select value={editHomeTeamId} onValueChange={setEditHomeTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForEditCategory?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time Visitante</Label>
                <Select value={editAwayTeamId} onValueChange={setEditAwayTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForEditCategory?.filter(t => t.id !== editHomeTeamId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={editMatchDate} onChange={e => setEditMatchDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditMatchTime('20:00')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${editMatchTime === '20:00' ? 'bg-pitch-600 text-white' : 'bg-navy-800 text-slate-400'}`}>
                    20:00
                  </button>
                  <button type="button" onClick={() => setEditMatchTime('21:00')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${editMatchTime === '21:00' ? 'bg-pitch-600 text-white' : 'bg-navy-800 text-slate-400'}`}>
                    21:00
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Local (opcional)</Label>
                <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Ex: Campo do Condomínio" />
              </div>
              {editPhase === 'grupos' && (
                <div className="space-y-2">
                  <Label>Turno</Label>
                  <Select value={String(editRound)} onValueChange={v => setEditRound(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1º Turno (Ida)</SelectItem>
                      <SelectItem value="2">2º Turno (Volta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={handleSaveEdit} className="w-full" disabled={editSaving || !editHomeTeamId || !editAwayTeamId}>
              {editSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
