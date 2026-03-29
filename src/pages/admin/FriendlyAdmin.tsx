import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useActiveChampionship, useChampionshipCategories, useTeamsByCategory } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Swords, Lock, Trash2, Plus, Calendar, Trophy } from 'lucide-react'

const VALID_DAYS = [1, 2, 4]
const DAY_NAMES: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 4: 'Quinta' }

function formatDateBR(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const dayName = DAY_NAMES[d.getDay()] ?? ''
  return `${dayName}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function isValidDay(date: string): boolean {
  const d = new Date(date + 'T12:00:00')
  return VALID_DAYS.includes(d.getDay())
}

export default function FriendlyAdmin() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: championship } = useActiveChampionship()
  const { data: categories } = useChampionshipCategories(championship?.id)

  // ── Criar Amistoso ──────────────────────────────────────────────
  const [matchCatId, setMatchCatId] = useState('')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [matchLocation, setMatchLocation] = useState('')
  const [savingMatch, setSavingMatch] = useState(false)
  const [matchSuccess, setMatchSuccess] = useState(false)
  const { data: matchCatTeams = [] } = useTeamsByCategory(championship?.id, matchCatId || undefined)

  const handleCreateMatch = async () => {
    if (!championship || !matchCatId || !homeTeamId || !awayTeamId || !matchDate) return
    if (homeTeamId === awayTeamId) { alert('Selecione times diferentes.'); return }
    setSavingMatch(true)
    const dateTime = matchTime ? `${matchDate}T${matchTime}:00` : `${matchDate}T10:00:00`
    const { error } = await supabase.from('matches').insert({
      championship_id: championship.id,
      category_id: matchCatId,
      phase: 'amistoso',
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: dateTime,
      location: matchLocation || null,
      status: 'scheduled',
    })
    if (error) { alert('Erro: ' + error.message) }
    else {
      setMatchSuccess(true)
      setHomeTeamId(''); setAwayTeamId(''); setMatchDate(''); setMatchTime(''); setMatchLocation('')
      setTimeout(() => setMatchSuccess(false), 3000)
    }
    setSavingMatch(false)
  }

  // ── Lançar Desafio ──────────────────────────────────────────────
  const [chalCatId, setChalCatId] = useState('')
  const [challengerTeamId, setChallengerTeamId] = useState('')
  const [opponentTeamId, setOpponentTeamId] = useState('')
  const [chalDate, setChalDate] = useState('')
  const [chalTime, setChalTime] = useState('')
  const [chalLocation, setChalLocation] = useState('')
  const [savingChal, setSavingChal] = useState(false)
  const [chalSuccess, setChalSuccess] = useState(false)
  const { data: chalCatTeams = [] } = useTeamsByCategory(championship?.id, chalCatId || undefined)

  const handleCreateChallenge = async () => {
    if (!championship || !chalCatId || !challengerTeamId || !chalDate || !chalTime) return
    setSavingChal(true)
    const { error } = await supabase.from('friendly_challenges').insert({
      championship_id: championship.id,
      category_id: chalCatId,
      challenger_team_id: challengerTeamId,
      challenger_user_id: user!.id,
      opponent_team_id: opponentTeamId || null,
      match_date: chalDate,
      match_time: chalTime,
      location: chalLocation || null,
      status: 'pending',
    })
    if (error) { alert('Erro: ' + error.message) }
    else {
      setChalSuccess(true)
      setChallengerTeamId(''); setOpponentTeamId(''); setChalDate(''); setChalTime(''); setChalLocation('')
      queryClient.invalidateQueries({ queryKey: ['friendly_challenges_admin'] })
      setTimeout(() => setChalSuccess(false), 3000)
    }
    setSavingChal(false)
  }

  const { data: blockedDates } = useQuery({
    queryKey: ['friendly_blocked_dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendly_blocked_dates')
        .select('*')
        .order('blocked_date')
      if (error) throw error
      return data as { id: string; blocked_date: string; reason: string | null }[]
    },
  })

  const { data: challenges } = useQuery({
    queryKey: ['friendly_challenges_admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendly_challenges')
        .select('*, challenger_team:teams!friendly_challenges_challenger_team_id_fkey(name), opponent_team:teams!friendly_challenges_opponent_team_id_fkey(name), category:categories(name)')
        .neq('status', 'cancelled')
        .order('match_date')
      if (error) throw error
      return data
    },
  })

  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [newDate, setNewDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [newReason, setNewReason] = useState('')
  const [saving, setSaving] = useState(false)

  const getValidDatesInRange = (start: string, end: string): string[] => {
    const dates: string[] = []
    const d = new Date(start + 'T12:00:00')
    const endDate = new Date(end + 'T12:00:00')
    while (d <= endDate) {
      if (VALID_DAYS.includes(d.getDay())) {
        dates.push(d.toISOString().split('T')[0])
      }
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  const handleBlock = async () => {
    if (!user) return
    setSaving(true)

    let datesToBlock: string[] = []
    if (mode === 'single') {
      if (!newDate) { setSaving(false); return }
      if (!isValidDay(newDate)) { alert('Selecione apenas segunda, terça ou quinta-feira.'); setSaving(false); return }
      datesToBlock = [newDate]
    } else {
      if (!rangeStart || !rangeEnd) { setSaving(false); return }
      datesToBlock = getValidDatesInRange(rangeStart, rangeEnd)
      if (datesToBlock.length === 0) { alert('Nenhuma data válida (seg/ter/qui) no período selecionado.'); setSaving(false); return }
    }

    // Filter out already blocked
    const alreadyBlocked = new Set(blockedDates?.map(d => d.blocked_date) ?? [])
    const toInsert = datesToBlock.filter(d => !alreadyBlocked.has(d))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('friendly_blocked_dates').insert(
        toInsert.map(d => ({ blocked_date: d, reason: newReason || null, blocked_by: user.id }))
      )
      if (error) alert('Erro: ' + error.message)
    }

    queryClient.invalidateQueries({ queryKey: ['friendly_blocked_dates'] })
    setNewDate('')
    setRangeStart('')
    setRangeEnd('')
    setNewReason('')
    setSaving(false)

    if (toInsert.length > 0) {
      alert(`${toInsert.length} data(s) bloqueada(s) com sucesso!`)
    }
  }

  const handleUnblock = async (id: string) => {
    await supabase.from('friendly_blocked_dates').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['friendly_blocked_dates'] })
  }

  const handleCancelChallenge = async (id: string) => {
    await supabase.from('friendly_challenges').update({ status: 'cancelled' }).eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['friendly_challenges_admin'] })
  }

  const futureBlocked = blockedDates?.filter(d => new Date(d.blocked_date + 'T12:00:00') >= new Date()) ?? []
  const pastBlocked = blockedDates?.filter(d => new Date(d.blocked_date + 'T12:00:00') < new Date()) ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Swords className="h-7 w-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Amistosos — Admin</h1>
          <p className="text-sm text-slate-400">Gerencie datas bloqueadas e desafios</p>
        </div>
      </div>

      {/* ── Criar Amistoso ── */}
      <Card className="border-pitch-500/20">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-pitch-400" /> Criar Amistoso
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <select value={matchCatId} onChange={e => { setMatchCatId(e.target.value); setHomeTeamId(''); setAwayTeamId('') }}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none">
                <option value="">Selecione...</option>
                {categories?.map((c: any) => <option key={c.category_id} value={c.category_id}>{c.category?.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time da Casa</Label>
              <select value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)} disabled={!matchCatId}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none disabled:opacity-50">
                <option value="">Selecione...</option>
                {matchCatTeams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time Visitante</Label>
              <select value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)} disabled={!matchCatId}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none disabled:opacity-50">
                <option value="">Selecione...</option>
                {matchCatTeams.filter((t: any) => t.id !== homeTeamId).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário</Label>
              <Input type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Local (opcional)</Label>
              <Input value={matchLocation} onChange={e => setMatchLocation(e.target.value)} placeholder="Ex: Campo do Clube" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCreateMatch} disabled={savingMatch || !matchCatId || !homeTeamId || !awayTeamId || !matchDate} className="bg-pitch-600 hover:bg-pitch-700">
              <Plus className="h-4 w-4 mr-1" />{savingMatch ? 'Criando...' : 'Criar Amistoso'}
            </Button>
            {matchSuccess && <span className="text-pitch-400 text-sm font-medium">✓ Amistoso criado com sucesso!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Lançar Desafio ── */}
      <Card className="border-gold-500/20">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Swords className="h-4 w-4 text-gold-400" /> Lançar Desafio de Amistoso
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <select value={chalCatId} onChange={e => { setChalCatId(e.target.value); setChallengerTeamId(''); setOpponentTeamId('') }}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none">
                <option value="">Selecione...</option>
                {categories?.map((c: any) => <option key={c.category_id} value={c.category_id}>{c.category?.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time Desafiante</Label>
              <select value={challengerTeamId} onChange={e => setChallengerTeamId(e.target.value)} disabled={!chalCatId}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none disabled:opacity-50">
                <option value="">Selecione...</option>
                {chalCatTeams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adversário (opcional — deixe vazio para aberto)</Label>
              <select value={opponentTeamId} onChange={e => setOpponentTeamId(e.target.value)} disabled={!chalCatId}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pitch-500 focus:outline-none disabled:opacity-50">
                <option value="">Aberto (qualquer time)</option>
                {chalCatTeams.filter((t: any) => t.id !== challengerTeamId).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={chalDate} onChange={e => setChalDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horário</Label>
              <Input type="time" value={chalTime} onChange={e => setChalTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Local (opcional)</Label>
              <Input value={chalLocation} onChange={e => setChalLocation(e.target.value)} placeholder="Ex: Campo do Clube" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCreateChallenge} disabled={savingChal || !chalCatId || !challengerTeamId || !chalDate || !chalTime} className="bg-gold-600 hover:bg-gold-700 text-black font-semibold">
              <Swords className="h-4 w-4 mr-1" />{savingChal ? 'Lançando...' : 'Lançar Desafio'}
            </Button>
            {chalSuccess && <span className="text-gold-400 text-sm font-medium">✓ Desafio lançado!</span>}
          </div>
        </CardContent>
      </Card>

      {/* Block date form */}
      <Card className="border-red-500/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-400" />
              Bloquear Datas para Amistosos
            </h3>
            <div className="flex gap-1">
              <button onClick={() => setMode('single')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'single' ? 'bg-red-600 text-white' : 'bg-navy-700 text-slate-400'}`}>
                Data única
              </button>
              <button onClick={() => setMode('range')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'range' ? 'bg-red-600 text-white' : 'bg-navy-700 text-slate-400'}`}>
                Período
              </button>
            </div>
          </div>

          {mode === 'single' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data (Seg, Ter ou Qui)</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Ex: Rodada do campeonato" />
              </div>
              <div className="flex items-end">
                <Button onClick={handleBlock} disabled={saving || !newDate} className="w-full bg-red-600 hover:bg-red-700">
                  <Lock className="h-4 w-4 mr-1" />{saving ? 'Bloqueando...' : 'Bloquear'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data inicial</Label>
                  <Input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data final</Label>
                  <Input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Ex: Férias" />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBlock} disabled={saving || !rangeStart || !rangeEnd} className="w-full bg-red-600 hover:bg-red-700">
                    <Lock className="h-4 w-4 mr-1" />{saving ? 'Bloqueando...' : 'Bloquear período'}
                  </Button>
                </div>
              </div>
              {rangeStart && rangeEnd && (
                <p className="text-xs text-slate-400">
                  {(() => {
                    const dates = getValidDatesInRange(rangeStart, rangeEnd)
                    return dates.length > 0
                      ? `${dates.length} data(s) válida(s) serão bloqueadas: ${dates.map(d => formatDateBR(d)).join(', ')}`
                      : 'Nenhuma data válida (seg/ter/qui) neste período'
                  })()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked dates list */}
      {futureBlocked.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Datas Bloqueadas ({futureBlocked.length})
            </h3>
            <div className="space-y-2">
              {futureBlocked.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-red-900/10 rounded-lg px-3 py-2 border border-red-600/20">
                  <div>
                    <span className="text-sm font-medium text-white">{formatDateBR(d.blocked_date)}</span>
                    {d.reason && <span className="text-xs text-slate-400 ml-2">— {d.reason}</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handleUnblock(d.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Desbloquear
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active challenges */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Desafios Ativos</h3>
          {challenges && challenges.length > 0 ? (
            <div className="space-y-2">
              {challenges.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between bg-navy-800 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="secondary" className="text-[10px]">{c.category?.name}</Badge>
                      <Badge variant={c.status === 'accepted' ? 'default' : 'warning'} className="text-[10px]">
                        {c.status === 'accepted' ? 'Confirmado' : 'Aberto'}
                      </Badge>
                    </div>
                    <span className="text-sm text-white font-medium">
                      {c.challenger_team?.name}
                      {c.opponent_team ? ` vs ${c.opponent_team.name}` : ' (procura adversário)'}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">
                      {formatDateBR(c.match_date)} {c.match_time}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handleCancelChallenge(c.id)}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Nenhum desafio ativo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
