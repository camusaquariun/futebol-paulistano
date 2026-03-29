import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMatch, useMatchEvents, useTeamRoster, useSaveSuspension, useSuspensions, usePoolMatchBetsByMatch } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Trophy, Star, Undo2, Clock, UserCheck, Play, Pause } from 'lucide-react'
import { phaseLabel, formatDate } from '@/lib/utils'
import { calculateMatchPoints } from '@/lib/pool-points'
import type { MatchEvent, Player, PlayerTeam } from '@/types/database'
import { useQueryClient, useQuery } from '@tanstack/react-query'

type MatchState = 'pre_match' | 'first_half' | 'halftime' | 'second_half' | 'finished'

// Timer hook — each half starts from 00:00
function useGameTimer(halfStartTime: string | null, matchState: MatchState) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!halfStartTime || (matchState !== 'first_half' && matchState !== 'second_half')) {
      return
    }
    const start = new Date(halfStartTime).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [halfStartTime, matchState])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return { elapsed, mins, secs, display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` }
}

function formatMinute(mins: number): string {
  return `${mins}'`
}

export default function MatchDetail() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: match, isLoading, refetch: refetchMatch } = useMatch(matchId)
  const { data: existingEvents, refetch: refetchEvents } = useMatchEvents(matchId)

  const { data: homeRoster } = useTeamRoster(match?.home_team_id, match?.category_id)
  const { data: awayRoster } = useTeamRoster(match?.away_team_id, match?.category_id)
  const { data: suspensions } = useSuspensions(match?.championship_id, match?.category_id)
  const saveSuspension = useSaveSuspension()
  const { data: poolBets } = usePoolMatchBetsByMatch(matchId)

  // Attendance
  const { data: attendance, refetch: refetchAttendance } = useQuery({
    queryKey: ['match_attendance', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_attendance')
        .select('*')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; match_id: string; player_id: string; team_id: string; present: boolean }[]
    },
    enabled: !!matchId,
  })

  // Pending food donations for players in this match
  const { data: pendingDonations, refetch: refetchDonations } = useQuery({
    queryKey: ['food_donations', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_donations')
        .select('*, player:players(name)')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; player_id: string; reason: string; required_kg: number; delivered: boolean; player: { name: string } }[]
    },
    enabled: !!matchId,
  })

  // Pending donations from PREVIOUS matches for players present in this match
  const { data: carryOverDonations, refetch: refetchCarryOver } = useQuery({
    queryKey: ['carry_over_donations', match?.championship_id, matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_donations')
        .select('*, player:players(name)')
        .eq('championship_id', match!.championship_id)
        .eq('delivered', false)
        .neq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; match_id: string; player_id: string; reason: string; required_kg: number; delivered: boolean; player: { name: string } }[]
    },
    enabled: !!match?.championship_id && !!matchId,
  })

  const matchState: MatchState = (match?.match_state as MatchState) ?? 'pre_match'
  const timer = useGameTimer(match?.half_start_time ?? null, matchState)

  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [homeFouls, setHomeFouls] = useState(0)
  const [awayFouls, setAwayFouls] = useState(0)
  const [showGlobalManual, setShowGlobalManual] = useState(false)
  const [manualTeam, setManualTeam] = useState('')
  const [manualType, setManualType] = useState<'goal' | 'own_goal' | 'yellow_card' | 'red_card'>('goal')
  const [manualPlayer, setManualPlayer] = useState('')
  const [manualMinute, setManualMinute] = useState('1')
  const [manualHalf, setManualHalf] = useState(1)
  const [motmPlayerId, setMotmPlayerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editEventType, setEditEventType] = useState<'goal' | 'own_goal' | 'yellow_card' | 'red_card'>('goal')
  const [editEventPlayer, setEditEventPlayer] = useState('')
  const [editEventMinute, setEditEventMinute] = useState('')
  const [editEventHalf, setEditEventHalf] = useState(1)

  useEffect(() => {
    if (match) {
      setHomeScore(match.home_score ?? 0)
      setAwayScore(match.away_score ?? 0)
      setHomeFouls(match.home_fouls ?? 0)
      setAwayFouls(match.away_fouls ?? 0)
      setMotmPlayerId(match.motm_player_id ?? null)
      if (!manualTeam) setManualTeam(match.home_team_id)
    }
  }, [match])

  // Suspended player IDs
  const suspendedPlayerIds = new Set(
    suspensions?.filter(s => !s.served).map(s => s.player_id) ?? []
  )

  // Attendance helpers
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

  // Game state transitions
  const startFirstHalf = async () => {
    if (!matchId) return
    await supabase.from('matches').update({
      match_state: 'first_half',
      half_start_time: new Date().toISOString(),
      home_score: 0,
      away_score: 0,
      home_fouls: 0,
      away_fouls: 0,
      status: 'finished',
    }).eq('id', matchId)
    setHomeScore(0)
    setAwayScore(0)
    refetchMatch()
  }

  const verifyDonation = async (donationId: string) => {
    await supabase.from('food_donations').update({ delivered: true, verified_at: new Date().toISOString() }).eq('id', donationId)
    refetchDonations()
    refetchCarryOver()
  }

  const endFirstHalf = async () => {
    if (!matchId) return
    await supabase.from('matches').update({ match_state: 'halftime', half_start_time: null }).eq('id', matchId)
    refetchMatch()
  }

  const startSecondHalf = async () => {
    if (!matchId) return
    await supabase.from('matches').update({ match_state: 'second_half', half_start_time: new Date().toISOString() }).eq('id', matchId)
    refetchMatch()
  }

  const finalizeMatch = async () => {
    if (!match || !matchId || !existingEvents) return
    setSaving(true)
    // Close voting 5 min from now if still open, and finalize match
    const updates: Record<string, any> = { match_state: 'finished', half_start_time: null }
    if (match.voting_open && !match.voting_closed_at) {
      updates.voting_closed_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }
    if (!match.voting_open) {
      updates.voting_open = true
      updates.voting_closed_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }
    await supabase.from('matches').update(updates).eq('id', matchId)

    // Process cards: suspensions + food donations
    const processedPlayers = new Set<string>()
    for (const event of existingEvents) {
      if (event.event_type === 'red_card') {
        await saveSuspension.mutateAsync({
          player_id: event.player_id, championship_id: match.championship_id,
          category_id: match.category_id, match_id_origin: matchId, reason: 'red_card', served: false,
        })
        // Red card: 15kg food donation (once per player per match)
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
        // Yellow card: 5kg food donation (once per player per match)
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
    navigate('/admin/partidas')
  }

  // Reset match: cancel and start over
  const resetMatch = async () => {
    if (!matchId || !confirm('Tem certeza? Isso apagará TODOS os eventos, placar, presenças e voltará ao pré-jogo.')) return
    setSaving(true)
    // Delete all events
    await supabase.from('match_events').delete().eq('match_id', matchId)
    // Delete attendance
    await supabase.from('match_attendance').delete().eq('match_id', matchId)
    // Delete chat and votes
    await supabase.from('match_messages').delete().eq('match_id', matchId)
    await supabase.from('motm_votes').delete().eq('match_id', matchId)
    // Reset match state
    await supabase.from('matches').update({
      match_state: 'pre_match',
      half_start_time: null,
      home_score: null,
      away_score: null,
      home_fouls: 0,
      away_fouls: 0,
      motm_player_id: null,
      status: 'scheduled',
    }).eq('id', matchId)
    setHomeScore(0)
    setAwayScore(0)
    setHomeFouls(0)
    setAwayFouls(0)
    setMotmPlayerId(null)
    queryClient.invalidateQueries()
    setSaving(false)
    refetchMatch()
    refetchEvents()
    refetchAttendance()
  }

  const currentHalf = matchState === 'second_half' ? 2 : 1

  // Add event with auto-minute
  const addEvent = useCallback(async (playerId: string, teamId: string, eventType: 'goal' | 'own_goal' | 'yellow_card' | 'red_card') => {
    if (!matchId) return
    const minute = timer.mins
    await supabase.from('match_events').insert({
      match_id: matchId, player_id: playerId || null, team_id: teamId, event_type: eventType, minute, half: currentHalf,
    })
    if (eventType === 'goal') {
      // Goal scores for the team that scored
      if (teamId === match?.home_team_id) {
        const s = homeScore + 1; setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      } else {
        const s = awayScore + 1; setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      }
    } else if (eventType === 'own_goal') {
      // Own goal scores for the OPPOSING team
      if (teamId === match?.home_team_id) {
        // Home team scored own goal → away gets the point
        const s = awayScore + 1; setAwayScore(s)
        await supabase.from('matches').update({ away_score: s }).eq('id', matchId)
      } else {
        const s = homeScore + 1; setHomeScore(s)
        await supabase.from('matches').update({ home_score: s }).eq('id', matchId)
      }
    }
    refetchEvents()
  }, [matchId, match, homeScore, awayScore, timer.mins, currentHalf, refetchEvents])

  // Add own goal (no player)
  const addOwnGoal = useCallback(async (teamId: string) => {
    await addEvent('', teamId, 'own_goal')
  }, [addEvent])

  // Add manual event with custom minute and half
  const addManualEvent = useCallback(async (playerId: string | null, teamId: string, eventType: 'goal' | 'own_goal' | 'yellow_card' | 'red_card', minute: number, half?: number) => {
    if (!matchId) return
    await supabase.from('match_events').insert({
      match_id: matchId, player_id: playerId, team_id: teamId, event_type: eventType, minute, half: half ?? currentHalf,
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
  }, [matchId, match, homeScore, awayScore, currentHalf, refetchEvents])

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
      // Own goal undo: reverse the opposing team's score
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

  const setMotm = useCallback(async (playerId: string) => {
    if (!matchId) return
    const newId = motmPlayerId === playerId ? null : playerId
    setMotmPlayerId(newId)
    await supabase.from('matches').update({ motm_player_id: newId }).eq('id', matchId)
  }, [matchId, motmPlayerId])

  // Directly adjust score for finished match corrections
  const adjustScore = useCallback(async (side: 'home' | 'away', delta: number) => {
    if (!matchId) return
    if (side === 'home') {
      const v = Math.max(0, homeScore + delta); setHomeScore(v)
      await supabase.from('matches').update({ home_score: v }).eq('id', matchId)
    } else {
      const v = Math.max(0, awayScore + delta); setAwayScore(v)
      await supabase.from('matches').update({ away_score: v }).eq('id', matchId)
    }
  }, [matchId, homeScore, awayScore])

  const startEditEvent = (e: MatchEvent) => {
    setEditingEventId(e.id)
    setEditEventType(e.event_type as any)
    setEditEventPlayer(e.player_id ?? '')
    setEditEventMinute(String(e.minute ?? ''))
    setEditEventHalf(e.half ?? 1)
  }

  const saveEventEdit = useCallback(async () => {
    if (!editingEventId) return
    await supabase.from('match_events').update({
      event_type: editEventType,
      player_id: editEventType === 'own_goal' ? null : (editEventPlayer || null),
      minute: editEventMinute ? parseInt(editEventMinute) : null,
      half: editEventHalf,
    }).eq('id', editingEventId)
    setEditingEventId(null)
    refetchEvents()
  }, [editingEventId, editEventType, editEventPlayer, editEventMinute, editEventHalf, refetchEvents])

  const countEvents = (teamId: string, eventType: string) =>
    existingEvents?.filter(e => e.team_id === teamId && e.event_type === eventType).length ?? 0

  const presentCount = (teamId: string) => attendance?.filter(a => a.team_id === teamId && a.present).length ?? 0

  if (isLoading || !match) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch-500" /></div>
  }

  const isPlaying = matchState === 'first_half' || matchState === 'second_half'
  const gameActive = matchState !== 'pre_match'

  const homePlayers = homeRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, pt_id: pt.id })) ?? []
  const awayPlayers = awayRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, pt_id: pt.id })) ?? []

  // State label
  const stateLabel: Record<MatchState, string> = {
    pre_match: 'Pré-jogo',
    first_half: '1º Tempo',
    halftime: 'Intervalo',
    second_half: '2º Tempo',
    finished: 'Encerrado',
  }

  return (
    <div className="space-y-3 max-w-5xl mx-auto pb-28">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/partidas')}>
          <ChevronLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{match.category?.name}</Badge>
          <Badge variant="outline">{phaseLabel(match.phase)}</Badge>
          <Badge variant={isPlaying ? 'default' : matchState === 'finished' ? 'secondary' : 'warning'}>
            {stateLabel[matchState]}
          </Badge>
          {gameActive && (
            <button
              onClick={resetMatch}
              disabled={saving}
              className="text-xs text-red-400/60 hover:text-red-400 transition-colors ml-2"
              title="Cancelar e recomeçar do zero"
            >
              Resetar partida
            </button>
          )}
        </div>
      </div>

      {/* Global manual event form */}
      {gameActive && showGlobalManual && (
        <Card className="border-gold-500/30 bg-navy-900">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Lançar Evento Manual</span>
              <button onClick={() => setShowGlobalManual(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Time</label>
                <select value={manualTeam} onChange={e => setManualTeam(e.target.value)}
                  className="w-full bg-navy-800 border border-navy-600 rounded px-3 py-2 text-sm text-white">
                  <option value={match.home_team_id}>{match.home_team?.name}</option>
                  <option value={match.away_team_id}>{match.away_team?.name}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
                <select value={manualType} onChange={e => setManualType(e.target.value as any)}
                  className="w-full bg-navy-800 border border-navy-600 rounded px-3 py-2 text-sm text-white">
                  <option value="goal">⚽ Gol</option>
                  <option value="own_goal">⚽ Gol Contra</option>
                  <option value="yellow_card">🟨 Amarelo</option>
                  <option value="red_card">🟥 Vermelho</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Jogador {manualType === 'own_goal' ? '(opcional)' : ''}</label>
                <select value={manualPlayer} onChange={e => setManualPlayer(e.target.value)}
                  className="w-full bg-navy-800 border border-navy-600 rounded px-3 py-2 text-sm text-white">
                  <option value="">— Nenhum —</option>
                  {(manualTeam === match.home_team_id ? homePlayers : awayPlayers).map(p => (
                    <option key={p.id} value={p.id}>{p.jersey_number ? `${p.jersey_number} - ` : ''}{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Minuto</label>
                  <input type="number" value={manualMinute} onChange={e => setManualMinute(e.target.value)}
                    placeholder="0" className="w-full bg-navy-800 border border-navy-600 rounded px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tempo</label>
                  <select value={manualHalf} onChange={e => setManualHalf(Number(e.target.value))}
                    className="w-full bg-navy-800 border border-navy-600 rounded px-3 py-2 text-sm text-white">
                    <option value={1}>1º Tempo</option>
                    <option value={2}>2º Tempo</option>
                  </select>
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={async () => {
              if (manualMinute === '') return
              await addManualEvent(
                manualType === 'own_goal' ? null : (manualPlayer || null),
                manualTeam,
                manualType,
                parseInt(manualMinute),
                manualHalf
              )
              setManualPlayer('')
              setManualMinute('1')
              setShowGlobalManual(false)
            }}>
              Lançar Evento
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scoreboard + Timer */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-navy-800 via-navy-900 to-navy-800 p-5">
          {/* Timer */}
          {gameActive && (
            <div className="flex justify-center mb-3">
              <div className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold ${isPlaying ? 'bg-pitch-600/20 text-pitch-400' : 'bg-navy-700 text-slate-400'}`}>
                <Clock className="h-4 w-4" />
                {isPlaying && <span className="text-sm opacity-70">{matchState === 'first_half' ? '1ºT' : '2ºT'}</span>}
                {isPlaying ? <span className="text-xl font-mono">{timer.display}</span> : matchState === 'halftime' ? 'Intervalo' : '—'}
                {isPlaying && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pitch-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-pitch-500" /></span>}
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
          {gameActive && (
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
          {gameActive && (
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
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pitch-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-pitch-500" /></span>
                Copiar link ao vivo
              </button>
              <span className="mx-2 text-navy-600">|</span>
              {/* Voting controls */}
              {!match.voting_open ? (
                <button
                  onClick={async () => {
                    await supabase.from('matches').update({ voting_open: true }).eq('id', matchId)
                    refetchMatch()
                  }}
                  className="text-sm text-gold-400 hover:text-gold-300 flex items-center gap-1"
                >
                  🗳️ Abrir votação
                </button>
              ) : !match.voting_closed_at ? (
                <button
                  onClick={async () => {
                    await supabase.from('matches').update({ voting_closed_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() }).eq('id', matchId)
                    refetchMatch()
                  }}
                  className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  🗳️ Encerrar votação (5min)
                </button>
              ) : (
                <span className="text-sm text-slate-500">🗳️ Votação encerrada</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Pending food donations */}
      {(() => {
        const allPending = [
          ...(carryOverDonations?.filter(d => {
            // Only show for players present in this match
            const present = attendance?.some(a => a.player_id === d.player_id && a.present)
            return present || matchState === 'pre_match'
          }) ?? []),
        ]
        if (allPending.length === 0) return null
        return (
          <Card className="border-gold-500/30 bg-gold-500/5">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gold-400 mb-3 flex items-center gap-2">
                🥫 Prendas de Alimentos Pendentes
              </h3>
              <div className="space-y-2">
                {allPending.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-navy-800 rounded-lg px-3 py-2">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">{d.player?.name}</span>
                      <span className="text-xs text-slate-400 ml-2">
                        {d.reason === 'red_card' ? '🟥 Vermelho' : '🟨 Amarelo'} — <strong className="text-gold-400">{d.required_kg}kg</strong>
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="border-pitch-500/50 text-pitch-400 hover:bg-pitch-600/10"
                      onClick={() => verifyDonation(d.id)}>
                      ✓ Entregou
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Two-column team panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TeamPanel
          teamName={match.home_team?.name ?? ''}
          teamId={match.home_team_id}
          players={homePlayers}
          events={existingEvents ?? []}
          fouls={homeFouls}
          onGoal={(pid) => addEvent(pid, match.home_team_id, 'goal')}
          onYellow={(pid) => addEvent(pid, match.home_team_id, 'yellow_card')}
          onRed={(pid) => addEvent(pid, match.home_team_id, 'red_card')}
          onOwnGoal={() => addOwnGoal(match.home_team_id)}
          onManualEvent={(pid, type, min) => addManualEvent(pid, match.home_team_id, type, min)}
          onFoulPlus={() => updateFouls('home', 1)}
          onFoulMinus={() => updateFouls('home', -1)}
          motmPlayerId={motmPlayerId}
          onSetMotm={setMotm}
          side="home"
          matchState={matchState}
          suspendedPlayerIds={suspendedPlayerIds}
          isPresent={isPresent}
          onToggleAttendance={(pid) => toggleAttendance(pid, match.home_team_id)}
          presentCount={presentCount(match.home_team_id)}
        />
        <TeamPanel
          teamName={match.away_team?.name ?? ''}
          teamId={match.away_team_id}
          players={awayPlayers}
          events={existingEvents ?? []}
          fouls={awayFouls}
          onGoal={(pid) => addEvent(pid, match.away_team_id, 'goal')}
          onYellow={(pid) => addEvent(pid, match.away_team_id, 'yellow_card')}
          onRed={(pid) => addEvent(pid, match.away_team_id, 'red_card')}
          onOwnGoal={() => addOwnGoal(match.away_team_id)}
          onManualEvent={(pid, type, min) => addManualEvent(pid, match.away_team_id, type, min)}
          onFoulPlus={() => updateFouls('away', 1)}
          onFoulMinus={() => updateFouls('away', -1)}
          motmPlayerId={motmPlayerId}
          onSetMotm={setMotm}
          side="away"
          matchState={matchState}
          suspendedPlayerIds={suspendedPlayerIds}
          isPresent={isPresent}
          onToggleAttendance={(pid) => toggleAttendance(pid, match.away_team_id)}
          presentCount={presentCount(match.away_team_id)}
        />
      </div>

      {/* Event Log */}
      {existingEvents && existingEvents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Eventos da Partida</h3>
            <div className="space-y-1">
              {[...existingEvents].reverse().map(e => (
                <div key={e.id}>
                  {editingEventId === e.id ? (
                    /* Inline edit form */
                    <div className="bg-navy-800 rounded-lg p-3 space-y-2 border border-pitch-500/30 mb-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-pitch-400">Editar Evento</span>
                        <button onClick={() => setEditingEventId(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {(['goal', 'own_goal', 'yellow_card', 'red_card'] as const).map(t => (
                          <button key={t} onClick={() => setEditEventType(t)}
                            className={`px-2 py-1.5 rounded text-xs font-bold ${editEventType === t ? 'bg-pitch-600 text-white' : 'bg-navy-700 text-slate-400 hover:bg-navy-600'}`}>
                            {t === 'goal' ? '⚽ Gol' : t === 'own_goal' ? '⚽ G.C.' : t === 'yellow_card' ? '🟨' : '🟥'}
                          </button>
                        ))}
                      </div>
                      {editEventType !== 'own_goal' && (
                        <select value={editEventPlayer} onChange={ev => setEditEventPlayer(ev.target.value)}
                          className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                          <option value="">— Nenhum —</option>
                          {[...homePlayers, ...awayPlayers].map(p => (
                            <option key={p.id} value={p.id}>{p.jersey_number ? `${p.jersey_number} - ` : ''}{p.name}</option>
                          ))}
                        </select>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" placeholder="Minuto" value={editEventMinute} onChange={ev => setEditEventMinute(ev.target.value)}
                          className="bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-500" />
                        <select value={editEventHalf} onChange={ev => setEditEventHalf(Number(ev.target.value))}
                          className="bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                          <option value={1}>1º Tempo</option>
                          <option value={2}>2º Tempo</option>
                        </select>
                      </div>
                      <Button size="sm" className="w-full" onClick={saveEventEdit}>Salvar Evento</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2 px-2 border-b border-navy-800 last:border-0 rounded hover:bg-navy-800/50 group">
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
                      <button onClick={() => startEditEvent(e)} className="text-slate-600 hover:text-pitch-400 transition-colors p-1.5 rounded-md hover:bg-pitch-400/10 opacity-0 group-hover:opacity-100" title="Editar">
                        ✏️
                      </button>
                      <button onClick={() => undoEvent(e.id, e)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-400/10" title="Excluir">
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score correction (finished matches) */}
      {matchState === 'finished' && (
        <Card className="border-slate-600/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Corrigir Placar</h3>
            <div className="flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 text-right truncate">{match.home_team?.name}</span>
                <button onClick={() => adjustScore('home', -1)} className="h-7 w-7 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold text-sm flex items-center justify-center">−</button>
                <span className="text-2xl font-extrabold text-white w-8 text-center">{homeScore}</span>
                <button onClick={() => adjustScore('home', 1)} className="h-7 w-7 rounded bg-pitch-500/20 text-pitch-400 hover:bg-pitch-500/30 font-bold text-sm flex items-center justify-center">+</button>
              </div>
              <span className="text-slate-500 font-bold">×</span>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustScore('away', -1)} className="h-7 w-7 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold text-sm flex items-center justify-center">−</button>
                <span className="text-2xl font-extrabold text-white w-8 text-center">{awayScore}</span>
                <button onClick={() => adjustScore('away', 1)} className="h-7 w-7 rounded bg-pitch-500/20 text-pitch-400 hover:bg-pitch-500/30 font-bold text-sm flex items-center justify-center">+</button>
                <span className="text-xs text-slate-400 w-20 truncate">{match.away_team?.name}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin: Set/Change Destaque do Jogo */}
      {gameActive && (
        <Card className="border-gold-500/20">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-gold-400 mb-3 flex items-center gap-2">
              ⭐ Destaque do Jogo {motmPlayerId && <Badge variant="warning" className="text-[9px]">Definido</Badge>}
            </h3>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
              {[...homePlayers, ...awayPlayers].map(p => (
                <button
                  key={p.id}
                  onClick={() => setMotm(p.id)}
                  className={`px-2 py-1.5 rounded text-xs text-left transition-all ${
                    motmPlayerId === p.id
                      ? 'bg-gold-500/20 text-gold-400 border border-gold-500/40 font-bold'
                      : 'bg-navy-800/50 text-slate-400 hover:bg-navy-700/50'
                  }`}
                >
                  {p.jersey_number ? `${p.jersey_number}. ` : ''}{p.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bolão stats — finished matches with bets */}
      {matchState === 'finished' && poolBets && poolBets.length > 0 && match?.home_score != null && match?.away_score != null && (() => {
        const betsWithPts = poolBets.map(bet => {
          const pts = bet.points ?? calculateMatchPoints(bet.home_score, bet.away_score, match.home_score!, match.away_score!)
          const name = bet.user_email.includes('@bolao.demo')
            ? bet.user_email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
            : bet.user_email.split('@')[0]
          return { ...bet, pts, name }
        }).sort((a, b) => b.pts - a.pts)
        const scored = betsWithPts.filter(b => b.pts > 0).length
        const exact = betsWithPts.filter(b => b.pts === 15).length
        const zero = betsWithPts.filter(b => b.pts === 0).length
        const top5 = betsWithPts.slice(0, 5)
        return (
          <Card className="border-amber-500/20">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  🎯 Bolão
                </h3>
                <span className="text-xs text-slate-500 bg-navy-800 px-2 py-0.5 rounded-full">
                  {poolBets.length} participante{poolBets.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                  <div className="text-2xl font-extrabold text-amber-400">{scored}</div>
                  <div className="text-[10px] text-amber-400/70 font-semibold uppercase mt-0.5">Pontuaram</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                  <div className="text-2xl font-extrabold text-green-400">{exact}</div>
                  <div className="text-[10px] text-green-400/70 font-semibold uppercase mt-0.5">Placar exato</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                  <div className="text-2xl font-extrabold text-red-400">{zero}</div>
                  <div className="text-[10px] text-red-400/70 font-semibold uppercase mt-0.5">Zerados</div>
                </div>
              </div>
              {top5.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Top {top5.length}</p>
                  <div className="space-y-1.5">
                    {top5.map((entry, idx) => (
                      <div key={entry.id} className="flex items-center gap-2.5">
                        <span className={`text-xs font-extrabold w-4 text-center flex-shrink-0 ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx + 1}</span>
                        <div className="h-5 w-5 rounded-full bg-navy-700 flex items-center justify-center text-[9px] font-bold text-slate-300 flex-shrink-0">
                          {entry.name.charAt(0)}
                        </div>
                        <span className="text-sm text-slate-200 flex-1 truncate">{entry.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">{entry.home_score} × {entry.away_score}</span>
                        <span className={`text-xs font-bold flex-shrink-0 min-w-[34px] text-right ${entry.pts === 15 ? 'text-green-400' : entry.pts >= 8 ? 'text-amber-400' : entry.pts > 0 ? 'text-slate-300' : 'text-red-400'}`}>
                          {entry.pts} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-navy-900/95 backdrop-blur border-t border-navy-700 p-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {isPlaying && (
            <>
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-red-600/50 text-red-400 hover:bg-red-600/10"
                onClick={undoLastEvent} disabled={!existingEvents || existingEvents.length === 0}>
                <Undo2 className="h-5 w-5 mr-1.5" />Desfazer
              </Button>
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-gold-500/50 text-gold-400 hover:bg-gold-500/10"
                onClick={() => { setManualHalf(currentHalf); setShowGlobalManual(!showGlobalManual) }}>
                + Manual
              </Button>
            </>
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
            <>
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-gold-500/50 text-gold-400 hover:bg-gold-500/10"
                onClick={() => { setManualHalf(1); setShowGlobalManual(!showGlobalManual) }}>
                + Manual
              </Button>
              <Button className="flex-1 h-16 text-xl font-bold bg-pitch-600 hover:bg-pitch-700" onClick={startSecondHalf}>
                <Play className="h-6 w-6 mr-3" />Iniciar 2º Tempo
              </Button>
            </>
          )}

          {matchState === 'second_half' && (
            <Button className="flex-1 h-14 text-lg font-bold bg-red-600 hover:bg-red-700" onClick={finalizeMatch} disabled={saving}>
              <Trophy className="h-5 w-5 mr-2" />{saving ? 'Finalizando...' : 'Finalizar Partida'}
            </Button>
          )}

          {matchState === 'finished' && (
            <>
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-gold-500/50 text-gold-400 hover:bg-gold-500/10"
                onClick={() => { setManualHalf(currentHalf); setShowGlobalManual(!showGlobalManual) }}>
                + Evento
              </Button>
              <Button variant="outline" className="h-14 px-4 text-sm font-semibold border-red-600/50 text-red-400 hover:bg-red-600/10"
                onClick={undoLastEvent} disabled={!existingEvents || existingEvents.length === 0}>
                <Undo2 className="h-5 w-5 mr-1.5" />Desfazer
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-slate-500">Partida encerrada — edição disponível acima</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type PlayerWithJersey = Player & { jersey_number?: number | null; pt_id: string }

function ManualEventForm({ players, onSubmit, onClose }: {
  players: PlayerWithJersey[]
  onSubmit: (playerId: string | null, type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card', minute: number) => void
  onClose: () => void
}) {
  const [type, setType] = useState<'goal' | 'own_goal' | 'yellow_card' | 'red_card'>('goal')
  const [playerId, setPlayerId] = useState('')
  const [minute, setMinute] = useState('')

  return (
    <div className="bg-navy-800 rounded-xl p-3 space-y-3 border border-navy-600">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Evento Manual</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">✕ Fechar</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {([
          { k: 'goal' as const, l: '⚽ Gol' },
          { k: 'own_goal' as const, l: '⚽ G.C.' },
          { k: 'yellow_card' as const, l: '🟨' },
          { k: 'red_card' as const, l: '🟥' },
        ]).map(t => (
          <button key={t.k} onClick={() => setType(t.k)}
            className={`px-2 py-1.5 rounded text-xs font-bold ${type === t.k ? 'bg-pitch-600 text-white' : 'bg-navy-700 text-slate-400'}`}>
            {t.l}
          </button>
        ))}
      </div>
      {type !== 'own_goal' && (
        <select value={playerId} onChange={e => setPlayerId(e.target.value)}
          className="w-full bg-navy-700 border border-navy-600 rounded px-3 py-2 text-sm text-white">
          <option value="">Selecione jogador</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.jersey_number ? `${p.jersey_number} - ` : ''}{p.name}</option>)}
        </select>
      )}
      <input type="number" placeholder="Minuto" value={minute} onChange={e => setMinute(e.target.value)}
        className="w-full bg-navy-700 border border-navy-600 rounded px-3 py-2 text-sm text-white placeholder:text-slate-500" />
      <Button className="w-full" onClick={() => {
        if (!minute) return
        onSubmit(type === 'own_goal' ? null : (playerId || null), type, parseInt(minute))
        onClose()
      }}>Lançar Evento</Button>
    </div>
  )
}

function TeamPanel({
  teamName, teamId, players, events, fouls,
  onGoal, onYellow, onRed, onOwnGoal, onManualEvent,
  onFoulPlus, onFoulMinus,
  motmPlayerId, onSetMotm, side, matchState,
  suspendedPlayerIds, isPresent, onToggleAttendance, presentCount,
}: {
  teamName: string
  teamId: string
  players: PlayerWithJersey[]
  events: MatchEvent[]
  fouls: number
  onGoal: (playerId: string) => void
  onYellow: (playerId: string) => void
  onRed: (playerId: string) => void
  onOwnGoal: () => void
  onManualEvent: (playerId: string | null, type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card', minute: number) => void
  onFoulPlus: () => void
  onFoulMinus: () => void
  motmPlayerId: string | null
  onSetMotm: (playerId: string) => void
  side: 'home' | 'away'
  matchState: MatchState
  suspendedPlayerIds: Set<string>
  isPresent: (playerId: string) => boolean
  onToggleAttendance: (playerId: string) => void
  presentCount: number
}) {
  const [mode, setMode] = useState<'goal' | 'yellow' | 'red' | 'motm'>('goal')
  const [showManual, setShowManual] = useState(false)
  const isPlaying = matchState === 'first_half' || matchState === 'second_half'
  const isPreMatch = matchState === 'pre_match' || matchState === 'halftime'

  const playerGoals = (pid: string) => events.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'goal').length
  const playerYellows = (pid: string) => events.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'yellow_card').length
  const playerReds = (pid: string) => events.filter(e => e.player_id === pid && e.team_id === teamId && e.event_type === 'red_card').length

  const handlePlayerClick = (playerId: string) => {
    if (!isPlaying) return
    if (mode === 'goal') onGoal(playerId)
    else if (mode === 'yellow') onYellow(playerId)
    else if (mode === 'red') onRed(playerId)
    else if (mode === 'motm') onSetMotm(playerId)
  }

  const modeStyles = {
    goal: { active: 'bg-pitch-600 text-white ring-2 ring-pitch-400', icon: '⚽' },
    yellow: { active: 'bg-yellow-500 text-navy-950 ring-2 ring-yellow-300', icon: '🟨' },
    red: { active: 'bg-red-600 text-white ring-2 ring-red-400', icon: '🟥' },
    motm: { active: 'bg-gold-500 text-navy-950 ring-2 ring-gold-300', icon: '⭐' },
  }

  return (
    <Card>
      <div className={`px-4 py-3 border-b border-navy-700 ${side === 'home' ? 'bg-blue-900/20' : 'bg-red-900/20'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-lg">{teamName}</h3>
            <span className="text-xs text-slate-400">
              <UserCheck className="h-3 w-3 inline mr-1" />{presentCount} presentes
            </span>
          </div>
          {isPlaying && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Faltas:</span>
              <Button variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold" onClick={onFoulMinus}>−</Button>
              <span className="text-lg font-extrabold text-white w-8 text-center tabular-nums">{fouls}</span>
              <Button variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold" onClick={onFoulPlus}>+</Button>
            </div>
          )}
        </div>
      </div>

      <CardContent className="p-3">
        {/* Mode selector + own goal + manual — only when playing */}
        {isPlaying && (
          <>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {([
                { key: 'goal' as const, label: 'Gol', icon: '⚽' },
                { key: 'yellow' as const, label: 'Amarelo', icon: '🟨' },
                { key: 'red' as const, label: 'Vermelho', icon: '🟥' },
                { key: 'motm' as const, label: 'MVP', icon: '⭐' },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl text-xs font-bold transition-all ${
                    mode === m.key ? modeStyles[m.key].active : 'bg-navy-800 text-slate-400 hover:bg-navy-700'
                  }`}
                >
                  <span className="text-xl mb-0.5">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
              <button
                onClick={onOwnGoal}
                className="flex flex-col items-center justify-center py-3 px-1 rounded-xl text-xs font-bold bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 border border-orange-600/30 transition-all"
              >
                <span className="text-xl mb-0.5">⚽</span>
                <span>G.Contra</span>
              </button>
            </div>
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowManual(!showManual)}
                className="text-xs text-slate-500 hover:text-slate-300 underline">
                {showManual ? 'Fechar manual' : '+ Evento manual'}
              </button>
            </div>
            {showManual && (
              <ManualEventForm
                players={players}
                onSubmit={onManualEvent}
                onClose={() => setShowManual(false)}
              />
            )}
          </>
        )}

        {/* Pre-match: attendance header */}
        {isPreMatch && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <UserCheck className="h-4 w-4 text-pitch-400" />
            <span className="text-sm font-medium text-slate-300">Marque os jogadores presentes</span>
          </div>
        )}

        {/* During match: late arrival notice */}
        {isPlaying && players.some(p => !isPresent(p.id) && !suspendedPlayerIds.has(p.id)) && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[10px] text-gold-400">⏰ Toque em um jogador ausente para registrar chegada atrasada</span>
          </div>
        )}

        {/* Player list */}
        <div className="space-y-1.5">
          {players.map(player => {
            const goals = playerGoals(player.id)
            const yellows = playerYellows(player.id)
            const reds = playerReds(player.id)
            const isMotm = motmPlayerId === player.id
            const suspended = suspendedPlayerIds.has(player.id)
            const present = isPresent(player.id)

            return (
              <button
                key={player.id}
                onClick={() => {
                  if (isPreMatch && !suspended) onToggleAttendance(player.id)
                  else if (isPlaying && !present && !suspended) {
                    // Late arrival: mark as present
                    if (confirm(`Registrar ${player.name} como chegada atrasada?`)) {
                      onToggleAttendance(player.id)
                    }
                  }
                  else if (isPlaying && present && !suspended) handlePlayerClick(player.id)
                }}
                disabled={suspended}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                  suspended
                    ? 'bg-red-900/20 border-2 border-red-600/30 opacity-50 cursor-not-allowed'
                    : isPreMatch
                    ? present
                      ? 'bg-pitch-600/10 border-2 border-pitch-500/40'
                      : 'bg-navy-800/50 border-2 border-transparent hover:bg-navy-700/50'
                    : isMotm
                    ? 'bg-gold-500/10 border-2 border-gold-500/30'
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
                  {isPlaying && !present && !suspended && <span className="text-gold-400 text-[10px] ml-1">⏰ toque para adicionar</span>}
                </span>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPreMatch && present && <UserCheck className="h-4 w-4 text-pitch-400" />}
                  {isMotm && <Star className="h-4 w-4 text-gold-400 fill-gold-400" />}
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
}
