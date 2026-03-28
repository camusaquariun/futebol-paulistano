import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useActiveChampionship, useMyPlayer, useMyTeams, useCategories, useChampionshipCategories, useTeamsByCategory } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Swords, Calendar, Clock, MapPin, Check, X, Plus, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

const VALID_TIMES = ['19:00', '20:00', '21:00']
const DAY_NAMES: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 4: 'Quinta' }
const VALID_DAYS = [1, 2, 4] // Monday, Tuesday, Thursday

function isValidDay(date: string): boolean {
  const d = new Date(date + 'T12:00:00')
  return VALID_DAYS.includes(d.getDay())
}

function formatDateBR(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const dayName = DAY_NAMES[d.getDay()] ?? ''
  return `${dayName}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function getNextValidDates(count: number): string[] {
  const dates: string[] = []
  const today = new Date()
  today.setDate(today.getDate() + 1) // start from tomorrow
  while (dates.length < count) {
    if (VALID_DAYS.includes(today.getDay())) {
      dates.push(today.toISOString().split('T')[0])
    }
    today.setDate(today.getDate() + 1)
  }
  return dates
}

export default function Friendlies() {
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: myTeamLinks } = useMyTeams(myPlayer?.id)
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const queryClient = useQueryClient()

  const myTeamLink = myTeamLinks?.find((tl: any) => tl.team?.championship?.id === championship?.id)
  const myTeamId = myTeamLink?.team_id
  const myCategoryId = myTeamLink?.category_id
  const myTeam = (myTeamLink as any)?.team

  // All challenges
  const { data: challenges } = useQuery({
    queryKey: ['friendly_challenges', championship?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendly_challenges')
        .select('*, challenger_team:teams!friendly_challenges_challenger_team_id_fkey(name), opponent_team:teams!friendly_challenges_opponent_team_id_fkey(name), category:categories(name)')
        .eq('championship_id', championship!.id)
        .order('match_date')
        .order('match_time')
      if (error) throw error
      return data
    },
    enabled: !!championship?.id,
    refetchInterval: 15000,
  })

  // Blocked dates
  const { data: blockedDates } = useQuery({
    queryKey: ['friendly_blocked_dates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('friendly_blocked_dates').select('blocked_date, reason')
      if (error) throw error
      return data as { blocked_date: string; reason: string | null }[]
    },
  })
  const blockedDateSet = new Set(blockedDates?.map(d => d.blocked_date) ?? [])
  const getBlockedReason = (date: string) => blockedDates?.find(d => d.blocked_date === date)?.reason

  // Taken slots
  const takenSlots = new Set(
    challenges?.filter((c: any) => c.status !== 'cancelled').map((c: any) => `${c.match_date}_${c.match_time}`) ?? []
  )

  // Create challenge state
  const [showCreate, setShowCreate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newLocation, setNewLocation] = useState('Campo do Condomínio')
  const [creating, setCreating] = useState(false)

  const availableDates = getNextValidDates(12).filter(d => !blockedDateSet.has(d))

  const getAvailableTimes = (date: string): string[] => {
    if (blockedDateSet.has(date)) return []
    return VALID_TIMES.filter(t => !takenSlots.has(`${date}_${t}`))
  }

  const handleCreate = async () => {
    if (!championship || !myTeamId || !myCategoryId || !user || !newDate || !newTime) return
    setCreating(true)
    await supabase.from('friendly_challenges').insert({
      championship_id: championship.id,
      category_id: myCategoryId,
      challenger_team_id: myTeamId,
      challenger_user_id: user.id,
      match_date: newDate,
      match_time: newTime,
      location: newLocation || 'Campo do Condomínio',
      status: 'open',
    })
    queryClient.invalidateQueries({ queryKey: ['friendly_challenges'] })
    setCreating(false)
    setShowCreate(false)
    setNewDate('')
    setNewTime('')
  }

  const handleAccept = async (challengeId: string) => {
    if (!user || !myTeamId) return
    await supabase.from('friendly_challenges').update({
      opponent_team_id: myTeamId,
      accepted_by_user_id: user.id,
      status: 'accepted',
    }).eq('id', challengeId)
    queryClient.invalidateQueries({ queryKey: ['friendly_challenges'] })
  }

  const handleCancel = async (challengeId: string) => {
    await supabase.from('friendly_challenges').update({ status: 'cancelled' }).eq('id', challengeId)
    queryClient.invalidateQueries({ queryKey: ['friendly_challenges'] })
  }

  const openChallenges = challenges?.filter((c: any) => c.status === 'open') ?? []
  const acceptedChallenges = challenges?.filter((c: any) => c.status === 'accepted') ?? []
  const myChallenges = challenges?.filter((c: any) =>
    c.challenger_team_id === myTeamId || c.opponent_team_id === myTeamId
  ) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords className="h-7 w-7 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Amistosos</h1>
            <p className="text-sm text-slate-400">Desafie outros times para partidas amistosas</p>
          </div>
        </div>
        {user && myTeamId && (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-2" />Criar Desafio
          </Button>
        )}
      </div>

      {/* Create challenge form */}
      {showCreate && user && myTeamId && (
        <Card className="border-gold-500/30">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Swords className="h-4 w-4 text-gold-400" />
              Novo Desafio — {myTeam?.name}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data (Seg, Ter ou Qui)</Label>
                <Select value={newDate} onValueChange={v => { setNewDate(v); setNewTime('') }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                  <SelectContent>
                    {availableDates.map(d => {
                      const available = getAvailableTimes(d).length > 0
                      return (
                        <SelectItem key={d} value={d} disabled={!available}>
                          {formatDateBR(d)} {!available ? '(lotado)' : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Horário</Label>
                <Select value={newTime} onValueChange={setNewTime} disabled={!newDate}>
                  <SelectTrigger><SelectValue placeholder="Horário" /></SelectTrigger>
                  <SelectContent>
                    {newDate && getAvailableTimes(newDate).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    {newDate && getAvailableTimes(newDate).length === 0 && (
                      <SelectItem value="_none" disabled>Sem horários disponíveis</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Local</Label>
                <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Campo do Condomínio" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating || !newDate || !newTime}>
                {creating ? 'Criando...' : 'Publicar Desafio'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!user && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-slate-400">
              <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para criar ou aceitar desafios de amistoso.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Open challenges */}
      {openChallenges.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Swords className="h-5 w-5 text-gold-400" />
            Desafios Abertos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {openChallenges.map((c: any) => {
              const isMyChallenge = c.challenger_team_id === myTeamId
              const canAccept = user && myTeamId && !isMyChallenge && c.category_id === myCategoryId
              return (
                <Card key={c.id} className="border-gold-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="warning" className="text-xs">{c.category?.name}</Badge>
                      <Badge variant="outline" className="text-xs">Aberto</Badge>
                    </div>
                    <p className="font-bold text-white text-lg mb-1">{c.challenger_team?.name}</p>
                    <p className="text-sm text-gold-400 mb-2">procura adversário</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateBR(c.match_date)}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.match_time}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.location}</span>
                    </div>
                    {canAccept && (
                      <Button size="sm" className="w-full" onClick={() => handleAccept(c.id)}>
                        <Check className="h-4 w-4 mr-1" />Aceitar Desafio
                      </Button>
                    )}
                    {isMyChallenge && (
                      <Button size="sm" variant="outline" className="w-full text-red-400 border-red-600/30" onClick={() => handleCancel(c.id)}>
                        <X className="h-4 w-4 mr-1" />Cancelar Desafio
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Accepted / scheduled friendlies */}
      {acceptedChallenges.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-pitch-400" />
            Amistosos Confirmados
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {acceptedChallenges.map((c: any) => (
              <Card key={c.id} className="border-pitch-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-xs">{c.category?.name}</Badge>
                    <Badge variant="default" className="text-xs">Confirmado</Badge>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{c.challenger_team?.name}</span>
                    <span className="text-slate-500 font-bold">VS</span>
                    <span className="font-bold text-white">{c.opponent_team?.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateBR(c.match_date)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.match_time}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.location}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {openChallenges.length === 0 && acceptedChallenges.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Swords className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum amistoso agendado.</p>
          {user && myTeamId && <p className="text-sm mt-1">Crie um desafio para começar!</p>}
        </div>
      )}

      {/* Schedule overview */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Agenda da Semana</h3>
          <div className="grid grid-cols-3 gap-2">
            {getNextValidDates(6).map(date => {
              const isBlocked = blockedDateSet.has(date)
              const reason = getBlockedReason(date)
              const times = VALID_TIMES.map(t => ({
                time: t,
                taken: takenSlots.has(`${date}_${t}`),
                match: challenges?.find((c: any) => c.match_date === date && c.match_time === t && c.status !== 'cancelled'),
              }))
              return (
                <div key={date} className={`rounded-lg p-2 ${isBlocked ? 'bg-red-900/20 border border-red-600/20' : 'bg-navy-800'}`}>
                  <p className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                    <span className={isBlocked ? 'text-red-400' : 'text-slate-400'}>{formatDateBR(date)}</span>
                    {isBlocked && <Lock className="h-2.5 w-2.5 text-red-400" />}
                  </p>
                  {isBlocked ? (
                    <div className="text-[10px] px-1.5 py-1 rounded bg-red-900/30 text-red-400">
                      Bloqueado{reason ? ` — ${reason}` : ''}
                    </div>
                  ) : (
                    times.map(({ time, taken, match }) => (
                      <div key={time} className={`text-[10px] px-1.5 py-1 rounded mb-0.5 ${
                        taken ? 'bg-red-900/30 text-red-400' : 'bg-pitch-900/20 text-pitch-400'
                      }`}>
                        {time} — {taken
                          ? (match as any)?.status === 'accepted'
                            ? `${(match as any)?.challenger_team?.name} vs ${(match as any)?.opponent_team?.name}`
                            : `${(match as any)?.challenger_team?.name} (aberto)`
                          : 'Disponível'
                        }
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
