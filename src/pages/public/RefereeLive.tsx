import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMatch, useMatchEvents, useTeamRoster, useSaveSuspension, useSuspensions } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Undo2, Clock, UserCheck, Play, Pause, ArrowLeft, Trophy, Gavel, ShieldAlert } from 'lucide-react'
import { phaseLabel } from '@/lib/utils'
import type { MatchEvent, Player } from '@/types/database'
import { useQueryClient, useQuery } from '@tanstack/react-query'

type MatchState = 'pre_match' | 'first_half' | 'halftime' | 'second_half' | 'finished'

function useGameTimer(halfStartTime: string | null, matchState: MatchState) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!halfStartTime || (matchState !== 'first_half' && matchState !== 'second_half')) return
    const start = new Date(halfStartTime).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [halfStartTime, matchState])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return { mins, display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` }
}

const stateLabels: Record<MatchState, string> = {
  pre_match: 'Pré-jogo',
  first_half: '1º Tempo',
  halftime: 'Intervalo',
  second_half: '2º Tempo',
  finished: 'Encerrado',
}

type PlayerWithJersey = Player & { jersey_number?: number | null }

export default function RefereeLive() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: match, isLoading, refetch: refetchMatch } = useMatch(matchId)
  const { data: existingEvents, refetch: refetchEvents } = useMatchEvents(matchId)
  const { data: homeRoster } = useTeamRoster(match?.home_team_id, match?.category_id)
  const { data: awayRoster } = useTeamRoster(match?.away_team_id, match?.category_id)
  const { data: suspensions } = useSuspensions(match?.championship_id, match?.category_id)
  const saveSuspension = useSaveSuspension()

  // Check if user is assigned referee for this match
  const { data: myRefAssignment } = useQuery({
    queryKey: ['my_ref_assignment', matchId, user?.id],
    queryFn: async () => {
      const { data: ref } = await supabase
        .from('referees')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (!ref) return null
      const { data: assignment } = await supabase
        .from('match_referees')
        .select('*')
        .eq('match_id', matchId!)
        .eq('referee_id', ref.id)
        .maybeSingle()
      return assignment
    },
    enabled: !!user?.id && !!matchId,
  })

  // Check admin status
  const { data: isAdmin } = useQuery({
    queryKey: ['is_admin', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .maybeSingle()
      return data?.role === 'admin'
    },
    enabled: !!user?.id,
  })

  // Attendance
  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ['match_attendance', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_attendance')
        .select('*')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; player_id: string; team_id: string; present: boolean }[]
    },
    enabled: !!matchId,
  })

  const matchState: MatchState = (match?.match_state as MatchState) ?? 'pre_match'
  const timer = useGameTimer(match?.half_start_time ?? null, matchState)

  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [homeFouls, setHomeFouls] = useState(0)
  const [awayFouls, setAwayFouls] = useState(0)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'goal' | 'yellow' | 'red'>('goal')

  useEffect(() => {
    if (match) {
      setHomeScore(match.home_score ?? 0)
      setAwayScore(match.away_score ?? 0)
      setHomeFouls(match.home_fouls ?? 0)
      setAwayFouls(match.away_fouls ?? 0)
    }
  }, [match])

  const suspendedPlayerIds = new Set(
    suspensions?.filter(s => !s.served).map(s => s.player_id) ?? []
  )

  const isPresent = (playerId: string) => attendance?.find(a => a.player_id === playerId)?.present ?? false

  const toggleAttendance = async (playerId: string, teamId: string) => {
    if (!matchId) return
    const existing = attendance?.find(a => a.player_id === playerId)
    if (existing) {
      await supabase.from('match_attendance').update({ present: !existing.present }).eq('id', existing.id)
    } else {
      await supabase.from('match_attendance').insert({ match_id: matchId, player_id: playerId, team_id: teamId, present: true })
    }
    refetchAttendance()
  }

  const currentHalf = matchState === 'second_half' ? 2 : 1

  // Match state transitions
  const startFirstHalf = async () => {
    if (!matchId) return
    await supabase.from('matches').update({
      match_state: 'first_half',
      half_start_time: new Date().toISOString(),
      home_score: 0, away_score: 0,
      home_fouls: 0, away_fouls: 0,
      home_fouls_1h: 0, away_fouls_1h: 0,
      home_fouls_2h: 0, away_fouls_2h: 0,
      status: 'finished',
    }).eq('id', matchId)
    setHomeScore(0); setAwayScore(0)
    setHomeFouls(0); setAwayFouls(0)
    refetchMatch()
  }

  const endFirstHalf = async () => {
    if (!matchId) return
    await supabase.from('matches').update({
      match_state: 'halftime',
      half_start_time: null,
      home_fouls_1h: homeFouls,
      away_fouls_1h: awayFouls,
    }).eq('id', matchId)
    refetchMatch()
  }

  const startSecondHalf = async () => {
    if (!matchId) return
    setHomeFouls(0); setAwayFouls(0)
    await supabase.from('matches').update({
      match_state: 'second_half',
      half_start_time: new Date().toISOString(),
      home_fouls: 0, away_fouls: 0,
    }).eq('id', matchId)
    refetchMatch()
  }

  const finalizeMatch = async () => {
    if (!match || !matchId || !existingEvents) return
    setSaving(true)

    // Save 2nd half fouls and compute totals
    const fouls1hHome = match.home_fouls_1h ?? 0
    const fouls1hAway = match.away_fouls_1h ?? 0
    const fouls2hHome = homeFouls
    const fouls2hAway = awayFouls

    const updates: Record<string, any> = {
      match_state: 'finished',
      half_start_time: null,
      home_fouls_2h: fouls2hHome,
      away_fouls_2h: fouls2hAway,
      home_fouls: fouls1hHome + fouls2hHome,
      away_fouls: fouls1hAway + fouls2hAway,
    }
    if (!match.voting_open) {
      updates.voting_open = true
      updates.voting_closed_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    } else if (!match.voting_closed_at) {
      updates.voting_closed_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }
    await supabase.from('matches').update(updates).eq('id', matchId)

    // Process suspensions & food donations
    const processedPlayers = new Set<string>()
    for (const event of existingEvents) {
      if (event.event_type === 'red_card') {
        await saveSuspension.mutateAsync({
          player_id: event.player_id, championship_id: match.championship_id,
          category_id: match.category_id, match_id_origin: matchId, reason: 'red_card', served: false,
        })
        if (!processedPlayers.has(`red_${event.player_id}`)) {
          processedPlayers.add(`red_${event.player_id}`)
          await supabase.from('food_donations').upsert({
            match_id: matchId, player_id: event.player_id,
            championship_id: match.championship_id, category_id: match.category_id,
            reason: 'red_card', required_kg: 15,
          }, { onConflict: 'match_id,player_id,reason' })
        }
      }
      if (event.event_type === 'yellow_card') {
        if (!processedPlayers.has(`yellow_${event.player_id}`)) {
          processedPlayers.add(`yellow_${event.player_id}`)
          await supabase.from('food_donations').upsert({
            match_id: matchId, player_id: event.player_id,
            championship_id: match.championship_id, category_id: match.category_id,
            reason: 'yellow_card', required_kg: 5,
          }, { onConflict: 'match_id,player_id,reason' })
        }
        const { data: yc } = await supabase.from('player_yellow_counts').select('yellow_count')
          .eq('player_id', event.player_id).eq('championship_id', match.championship_id)
          .eq('category_id', match.category_id).single()
        if (yc && yc.yellow_count >= 3) {
          await saveSuspension.mutateAsync({
            player_id: event.player_id, championship_id: match.championship_id,
            category_id: match.category_id, match_id_origin: matchId, reason: 'three_yellows', served: false,
          })
        }
      }
    }

    // Calculate bolão points
    await supabase.rpc('calculate_pool_points', { p_match_id: matchId })

    queryClient.invalidateQueries({ queryKey: ['suspensions'] })
    queryClient.invalidateQueries({ queryKey: ['standings'] })
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['pool_match_bets'] })
    setSaving(false)
    navigate('/arbitragem')
  }

  // Events
  const addEvent = useCallback(async (playerId: string, teamId: string, eventType: 'goal' | 'own_goal' | 'yellow_card' | 'red_card') => {
    if (!matchId) return
    const minute = timer.mins
    await supabase.from('match_events').insert({
      match_id: matchId, player_id: playerId || null, team_id: teamId, event_type: eventType, minute, half: currentHalf,
    })
    if (eventType === 'goal') {
      if (teamId === match?.home_team_id) {
        const s = homeScore + 1; setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      } else {
        const s = awayScore + 1; setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      }
    } else if (eventType === 'own_goal') {
      if (teamId === match?.home_team_id) {
        const s = awayScore + 1; setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      } else {
        const s = homeScore + 1; setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      }
    }
    refetchEvents()
  }, [matchId, match, homeScore, awayScore, timer.mins, currentHalf, refetchEvents])

  const addOwnGoal = useCallback(async (teamId: string) => {
    await addEvent('', teamId, 'own_goal')
  }, [addEvent])

  const undoEvent = useCallback(async (eventId: string, event: MatchEvent) => {
    await supabase.from('match_events').delete().eq('id', eventId)
    if (event.event_type === 'goal' && matchId) {
      if (event.team_id === match?.home_team_id) {
        const s = Math.max(0, homeScore - 1); setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      } else {
        const s = Math.max(0, awayScore - 1); setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      }
    } else if (event.event_type === 'own_goal' && matchId) {
      if (event.team_id === match?.home_team_id) {
        const s = Math.max(0, awayScore - 1); setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      } else {
        const s = Math.max(0, homeScore - 1); setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      }
    }
    refetchEvents()
  }, [matchId, match, homeScore, awayScore, refetchEvents])

  const undoLastEvent = useCallback(async () => {
    if (!existingEvents || existingEvents.length === 0) return
    const last = existingEvents[existingEvents.length - 1]
    await undoEvent(last.id, last)
  }, [existingEvents, undoEvent])

  const updateFouls = useCallback(async (side: 'home' | 'away', delta: number) => {
    if (!matchId) return
    if (side === 'home') {
      const v = Math.max(0, homeFouls + delta); setHomeFouls(v)
      await supabase.from('matches').update({ home_fouls: v }).eq('id', matchId)
    } else {
      const v = Math.max(0, awayFouls + delta); setAwayFouls(v)
      await supabase.from('matches').update({ away_fouls: v }).eq('id', matchId)
    }
  }, [matchId, homeFouls, awayFouls])

  const countEvents = (teamId: string, eventType: string) =>
    existingEvents?.filter(e => e.team_id === teamId && e.event_type === eventType).length ?? 0

  const presentCount = (teamId: string) => attendance?.filter(a => a.team_id === teamId && a.present).length ?? 0

  // Auth check
  if (!user) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para acessar a arbitragem.
      </div>
    )
  }

  if (isLoading || !match) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch-500" /></div>
  }

  // Check access: must be assigned referee or admin
  if (!myRefAssignment && !isAdmin) {
    return (
      <div className="text-center py-16 space-y-4">
        <ShieldAlert className="h-12 w-12 text-red-400 mx-auto" />
        <p className="text-slate-400">Você não tem permissão para arbitrar esta partida.</p>
        <Link to="/arbitragem" className="text-pitch-400 hover:underline text-sm">Voltar para minhas partidas</Link>
      </div>
    )
  }

  const isPlaying = matchState === 'first_half' || matchState === 'second_half'
  const isPreMatch = matchState === 'pre_match' || matchState === 'halftime'

  const homePlayers: PlayerWithJersey[] = homeRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number })) ?? []
  const awayPlayers: PlayerWithJersey[] = awayRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number })) ?? []

  const handlePlayerClick = (playerId: string, teamId: string) => {
    if (!isPlaying || !isPresent(playerId)) return
    if (mode === 'goal') addEvent(playerId, teamId, 'goal')
    else if (mode === 'yellow') addEvent(playerId, teamId, 'yellow_card')
    else if (mode === 'red') addEvent(playerId, teamId, 'red_card')
  }

  const playerGoals = (pid: string, teamId: string) =>
    existingEvents?.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'goal').length ?? 0
  const playerYellows = (pid: string, teamId: string) =>
    existingEvents?.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'yellow_card').length ?? 0
  const playerReds = (pid: string, teamId: string) =>
    existingEvents?.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'red_card').length ?? 0

  const modeStyles = {
    goal: { active: 'bg-pitch-600 text-white ring-2 ring-pitch-400', icon: '⚽', label: 'Gol' },
    yellow: { active: 'bg-yellow-500 text-navy-950 ring-2 ring-yellow-300', icon: '🟨', label: 'Amarelo' },
    red: { active: 'bg-red-600 text-white ring-2 ring-red-400', icon: '🟥', label: 'Vermelho' },
  }

  const renderTeamPanel = (teamName: string, teamId: string, players: PlayerWithJersey[], side: 'home' | 'away') => (
    <Card>
      <div className={`px-4 py-3 border-b border-navy-700 ${side === 'home' ? 'bg-blue-900/20' : 'bg-red-900/20'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-lg">{teamName}</h3>
            <span className="text-xs text-slate-400">
              <UserCheck className="h-3 w-3 inline mr-1" />{presentCount(teamId)} presentes
            </span>
          </div>
          {isPlaying && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Faltas:</span>
              <Button variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold" onClick={() => updateFouls(side, -1)}>−</Button>
              <span className="text-lg font-extrabold text-white w-8 text-center tabular-nums">{side === 'home' ? homeFouls : awayFouls}</span>
              <Button variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold" onClick={() => updateFouls(side, 1)}>+</Button>
            </div>
          )}
        </div>
      </div>
      <CardContent className="p-3">
        {/* Mode selector */}
        {isPlaying && (
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {(['goal', 'yellow', 'red'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl text-xs font-bold transition-all ${
                  mode === m ? modeStyles[m].active : 'bg-navy-800 text-slate-400 hover:bg-navy-700'
                }`}
              >
                <span className="text-xl mb-0.5">{modeStyles[m].icon}</span>
                <span>{modeStyles[m].label}</span>
              </button>
            ))}
            <button
              onClick={() => addOwnGoal(teamId)}
              className="flex flex-col items-center justify-center py-3 px-1 rounded-xl text-xs font-bold bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 border border-orange-600/30 transition-all"
            >
              <span className="text-xl mb-0.5">⚽</span>
              <span>G.Contra</span>
            </button>
          </div>
        )}

        {isPreMatch && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <UserCheck className="h-4 w-4 text-pitch-400" />
            <span className="text-sm font-medium text-slate-300">Marque os jogadores presentes</span>
          </div>
        )}

        {/* Player list */}
        <div className="space-y-1.5">
          {players.map(player => {
            const goals = playerGoals(player.id, teamId)
            const yellows = playerYellows(player.id, teamId)
            const reds = playerReds(player.id, teamId)
            const suspended = suspendedPlayerIds.has(player.id)
            const present = isPresent(player.id)

            return (
              <button
                key={player.id}
                onClick={() => {
                  if (isPreMatch && !suspended) toggleAttendance(player.id, teamId)
                  else if (isPlaying && !present && !suspended) {
                    if (confirm(`Registrar ${player.name} como chegada atrasada?`)) {
                      toggleAttendance(player.id, teamId)
                    }
                  }
                  else if (isPlaying && present && !suspended) handlePlayerClick(player.id, teamId)
                }}
                disabled={suspended}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                  suspended
                    ? 'bg-red-900/20 border-2 border-red-600/30 opacity-50 cursor-not-allowed'
                    : isPreMatch
                    ? present
                      ? 'bg-pitch-600/10 border-2 border-pitch-500/40'
                      : 'bg-navy-800/50 border-2 border-transparent hover:bg-navy-700/50'
                    : isPlaying && present
                    ? 'bg-navy-800/50 hover:bg-navy-700/50 border-2 border-transparent active:border-pitch-500/50'
                    : isPlaying && !present && !suspended
                    ? 'bg-navy-800/20 border-2 border-dashed border-gold-500/20 hover:border-gold-500/40 opacity-50 hover:opacity-70'
                    : 'bg-navy-800/30 border-2 border-transparent opacity-40'
                }`}
              >
                <span className={`text-xs font-bold rounded px-1.5 py-0.5 min-w-[28px] text-center ${
                  present ? 'bg-pitch-600/30 text-pitch-300' : 'bg-navy-700 text-slate-500'
                }`}>
                  {player.jersey_number ?? '—'}
                </span>
                <span className="text-base font-semibold text-white flex-1 truncate">
                  {player.name}
                  {suspended && <span className="text-red-400 text-xs ml-2">(Suspenso)</span>}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPreMatch && present && <UserCheck className="h-4 w-4 text-pitch-400" />}
                  {goals > 0 && <span className="text-sm bg-pitch-600 text-white rounded-full px-2 py-0.5 font-bold">{goals}⚽</span>}
                  {yellows > 0 && <span className="text-sm bg-yellow-500 text-navy-950 rounded-full px-2 py-0.5 font-bold">{yellows}🟨</span>}
                  {reds > 0 && <span className="text-sm bg-red-600 text-white rounded-full px-2 py-0.5 font-bold">{reds}🟥</span>}
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-3 max-w-5xl mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/arbitragem" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Minhas Partidas
        </Link>
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-gold-400" />
          <Badge variant="secondary">{match.category?.name}</Badge>
          <Badge variant="outline">{phaseLabel(match.phase)}</Badge>
          <Badge variant={isPlaying ? 'default' : matchState === 'finished' ? 'secondary' : 'outline'}>
            {stateLabels[matchState]}
          </Badge>
        </div>
      </div>

      {/* Scoreboard */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-navy-800 via-navy-900 to-navy-800 p-5">
          {/* Timer */}
          {(matchState !== 'pre_match') && (
            <div className="flex justify-center mb-3">
              <div className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold ${isPlaying ? 'bg-pitch-600/20 text-pitch-400' : 'bg-navy-700 text-slate-400'}`}>
                <Clock className="h-4 w-4" />
                {isPlaying && <span className="text-sm opacity-70">{matchState === 'first_half' ? '1ºT' : '2ºT'}</span>}
                {isPlaying ? <span className="text-xl font-mono">{timer.display}</span> : matchState === 'halftime' ? 'Intervalo' : '—'}
                {isPlaying && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pitch-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-pitch-500" />
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-white">{match.home_team?.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">Casa</p>
            </div>
            <div className="flex items-center gap-4 px-8">
              <span className="text-6xl font-extrabold text-white tabular-nums">{homeScore}</span>
              <span className="text-3xl text-slate-500 font-bold">×</span>
              <span className="text-6xl font-extrabold text-white tabular-nums">{awayScore}</span>
            </div>
            <div className="flex-1 text-center">
              <p className="text-xl font-bold text-white">{match.away_team?.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">Visitante</p>
            </div>
          </div>

          {(matchState !== 'pre_match') && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-navy-700">
              <div className="flex items-center gap-5 text-sm">
                <span className="text-yellow-400 font-semibold">🟨 {countEvents(match.home_team_id, 'yellow_card')}</span>
                <span className="text-red-400 font-semibold">🟥 {countEvents(match.home_team_id, 'red_card')}</span>
                <span className="text-slate-400">Faltas: <strong className="text-white">{homeFouls}</strong></span>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <span className="text-slate-400">Faltas: <strong className="text-white">{awayFouls}</strong></span>
                <span className="text-yellow-400 font-semibold">🟨 {countEvents(match.away_team_id, 'yellow_card')}</span>
                <span className="text-red-400 font-semibold">🟥 {countEvents(match.away_team_id, 'red_card')}</span>
              </div>
            </div>
          )}

          {/* Copy live link */}
          {(matchState !== 'pre_match') && (
            <div className="flex justify-center mt-3 pt-3 border-t border-navy-700">
              <button
                onClick={() => {
                  const slug = `${match.home_team?.name ?? ''}-vs-${match.away_team?.name ?? ''}`
                    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                  const url = `${window.location.origin}/partidas/${matchId}/ao-vivo/${slug}`
                  navigator.clipboard.writeText(url)
                  alert('Link copiado!\n' + url)
                }}
                className="text-sm text-pitch-400 hover:text-pitch-300 flex items-center gap-1.5"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pitch-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pitch-500" />
                </span>
                Copiar link ao vivo
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Two-column team panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {renderTeamPanel(match.home_team?.name ?? '', match.home_team_id, homePlayers, 'home')}
        {renderTeamPanel(match.away_team?.name ?? '', match.away_team_id, awayPlayers, 'away')}
      </div>

      {/* Event log */}
      {existingEvents && existingEvents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Eventos da Partida</h3>
            <div className="space-y-1">
              {[...existingEvents].reverse().map(e => (
                <div key={e.id} className="flex items-center gap-2 text-sm py-2 px-2 border-b border-navy-800 last:border-0 rounded hover:bg-navy-800/50 group">
                  <span className="text-[10px] font-bold text-slate-500 bg-navy-700 rounded px-1.5 py-0.5 min-w-[48px] text-center">
                    {e.half === 2 ? '2ºT' : '1ºT'} {e.minute != null ? `${e.minute}'` : ''}
                  </span>
                  <span className="text-lg">
                    {e.event_type === 'goal' && '⚽'}
                    {e.event_type === 'own_goal' && '⚽'}
                    {e.event_type === 'yellow_card' && '🟨'}
                    {e.event_type === 'red_card' && '🟥'}
                  </span>
                  <span className="font-medium text-white flex-1">
                    {e.event_type === 'own_goal' ? <span className="text-red-400">Gol Contra</span> : e.player?.name}
                  </span>
                  <span className="text-slate-500 text-xs">{e.team?.name}</span>
                  {matchState !== 'finished' && (
                    <button onClick={() => undoEvent(e.id, e)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-400/10" title="Desfazer">
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Match info */}
      {matchState === 'finished' && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-green-400 font-bold">Partida encerrada</p>
            <p className="text-xs text-slate-400 mt-1">Pontos do bolão foram calculados automaticamente.</p>
          </CardContent>
        </Card>
      )}

      {/* Fixed bottom action bar */}
      {matchState !== 'finished' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-navy-900/95 backdrop-blur border-t border-navy-700 p-3">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            {isPlaying && (
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-red-600/50 text-red-400 hover:bg-red-600/10"
                onClick={undoLastEvent} disabled={!existingEvents || existingEvents.length === 0}>
                <Undo2 className="h-5 w-5 mr-1.5" />Desfazer
              </Button>
            )}

            {matchState === 'pre_match' && (
              <Button className="flex-1 h-16 text-xl font-bold bg-pitch-600 hover:bg-pitch-700" onClick={startFirstHalf}>
                <Play className="h-6 w-6 mr-3" />Iniciar 1º Tempo
              </Button>
            )}

            {matchState === 'first_half' && (
              <Button className="flex-1 h-14 text-lg font-bold bg-gold-500 hover:bg-gold-600 text-navy-950" onClick={endFirstHalf}>
                <Pause className="h-5 w-5 mr-2" />Encerrar 1º Tempo
              </Button>
            )}

            {matchState === 'halftime' && (
              <Button className="flex-1 h-16 text-xl font-bold bg-pitch-600 hover:bg-pitch-700" onClick={startSecondHalf}>
                <Play className="h-6 w-6 mr-3" />Iniciar 2º Tempo
              </Button>
            )}

            {matchState === 'second_half' && (
              <Button className="flex-1 h-14 text-lg font-bold bg-red-600 hover:bg-red-700" onClick={finalizeMatch} disabled={saving}>
                <Trophy className="h-5 w-5 mr-2" />{saving ? 'Finalizando...' : 'Finalizar Partida'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
