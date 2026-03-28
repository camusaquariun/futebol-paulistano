import { useState } from 'react'
import { useMatches, useCategories, useTeamsByCategory, useSaveMatch, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar, Plus, Edit, ChevronRight } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { MatchPhase } from '@/types/database'

export default function MatchesAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPhase, setFilterPhase] = useState<string>('all')
  const { data: matches, isLoading } = useMatches(championshipId, filterCategory !== 'all' ? filterCategory : undefined)

  const saveMutation = useSaveMatch()
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [phase, setPhase] = useState<MatchPhase>('grupos')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [location, setLocation] = useState('')
  const [round, setRound] = useState(1)
  const { data: teamsForCategory } = useTeamsByCategory(championshipId, categoryId || undefined)

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
      match_date: matchDate || null,
      location: location || null,
      round,
      status: 'scheduled',
    })
    setOpen(false)
  }

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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
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
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(match => (
            <Link key={match.id} to={`/admin/partidas/${match.id}`}>
              <Card className="card-hover">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
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
                    {match.match_date && (
                      <p className="text-xs text-slate-400 mt-1">{formatDate(match.match_date)}{match.location ? ` — ${match.location}` : ''}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500" />
                </CardContent>
              </Card>
            </Link>
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
            <div className="space-y-2">
              <Label>Data e Hora (opcional)</Label>
              <Input type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)} />
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
    </div>
  )
}
