import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePoolMatchBetsByMatch } from '@/hooks/useSupabase'
import { formatDate, phaseLabel } from '@/lib/utils'
import { calculateMatchPoints } from '@/lib/pool-points'
import type { MatchEvent } from '@/types/database'
import { ArrowLeft, Star, MapPin, Calendar, Clock, Send, Trophy, MessageCircle, Target, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TeamBadge } from '@/components/TeamBadge'

type MatchState = 'pre_match' | 'first_half' | 'halftime' | 'second_half' | 'finished'

function useGameTimer(halfStartTime: string | null, matchState: MatchState) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!halfStartTime || (matchState !== 'first_half' && matchState !== 'second_half')) {
      return
    }
    const start = new Date(halfStartTime).getTime()
    const tick = () => {
      const secs = Math.floor((Date.now() - start) / 1000)
      setElapsed(secs)
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [halfStartTime, matchState])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return { display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` }
}

const stateLabels: Record<MatchState, string> = {
  pre_match: 'Pré-jogo',
  first_half: '1º Tempo',
  halftime: 'Intervalo',
  second_half: '2º Tempo',
  finished: 'Encerrado',
}

export default function MatchLive() {
  const { matchId } = useParams<{ matchId: string }>()

  const { data: match } = useQuery({
    queryKey: ['match_live', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*), motm_player:players!matches_motm_player_id_fkey(*)')
        .eq('id', matchId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!matchId,
    refetchInterval: 5000,
  })

  const { data: events } = useQuery({
    queryKey: ['match_events_live', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_events')
        .select('*, player:players(*), team:teams(*)')
        .eq('match_id', matchId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!matchId,
    refetchInterval: 5000,
  })

  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Chat messages
  const { data: messages } = useQuery({
    queryKey: ['match_messages', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_messages')
        .select('*')
        .eq('match_id', matchId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as { id: string; user_email: string; message: string; created_at: string }[]
    },
    enabled: !!matchId,
    refetchInterval: 5000,
  })

  // MOTM votes
  const { data: votes } = useQuery({
    queryKey: ['motm_votes', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motm_votes')
        .select('*, player:players(name)')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; player_id: string; user_id: string; player: { name: string } }[]
    },
    enabled: !!matchId,
    refetchInterval: 5000,
  })

  // All players from both team rosters for voting
  const { data: homeRosterLive } = useQuery({
    queryKey: ['roster_live_home', match?.home_team_id, match?.category_id],
    queryFn: async () => {
      const { data } = await supabase.from('player_teams').select('*, player:players(name)')
        .eq('team_id', match!.home_team_id).eq('category_id', match!.category_id).eq('status', 'active')
      return data ?? []
    },
    enabled: !!match?.home_team_id && !!match?.category_id,
    refetchInterval: 30000,
  })
  const { data: awayRosterLive } = useQuery({
    queryKey: ['roster_live_away', match?.away_team_id, match?.category_id],
    queryFn: async () => {
      const { data } = await supabase.from('player_teams').select('*, player:players(name)')
        .eq('team_id', match!.away_team_id).eq('category_id', match!.category_id).eq('status', 'active')
      return data ?? []
    },
    enabled: !!match?.away_team_id && !!match?.category_id,
    refetchInterval: 30000,
  })

  const allPlayers = [
    ...(homeRosterLive?.map((pt: any) => ({ id: pt.player_id, name: pt.player?.name ?? '?', teamName: match?.home_team?.name ?? '' })) ?? []),
    ...(awayRosterLive?.map((pt: any) => ({ id: pt.player_id, name: pt.player?.name ?? '?', teamName: match?.away_team?.name ?? '' })) ?? []),
  ].sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name))

  // Attendance: who was confirmed present
  const { data: attendance } = useQuery({
    queryKey: ['match_attendance_live', matchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('match_attendance')
        .select('player_id, team_id, present')
        .eq('match_id', matchId!)
      return data ?? []
    },
    enabled: !!matchId,
    refetchInterval: 10000,
  })
  const presentIds = new Set(attendance?.filter((a: any) => a.present).map((a: any) => a.player_id) ?? [])
  const hasAttendance = (attendance?.filter((a: any) => a.present).length ?? 0) > 0

  // Players who appeared in events (fallback for matches without attendance data)
  const eventPlayerIds = new Set(events?.map((e: MatchEvent) => e.player_id).filter(Boolean) ?? [])

  // Bolão bets for this match
  const { data: poolBets } = usePoolMatchBetsByMatch(matchId)

  const poolStats = useMemo(() => {
    if (!poolBets || poolBets.length === 0 || match?.home_score == null || match?.away_score == null) {
      return null
    }
    const betsWithPts = poolBets.map(bet => {
      const pts = calculateMatchPoints(bet.home_score, bet.away_score, match.home_score!, match.away_score!)
      const name = bet.user_email.includes('@bolao.demo')
        ? bet.user_email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : bet.user_email.split('@')[0]
      return { ...bet, pts, name }
    }).sort((a, b) => b.pts - a.pts)

    const exactCount = betsWithPts.filter(b => b.pts === 15).length
    const scoringCount = betsWithPts.filter(b => b.pts > 0).length
    const lostCount = betsWithPts.filter(b => b.pts === 0).length
    const top5 = betsWithPts.slice(0, 5)

    return { total: poolBets.length, exactCount, scoringCount, lostCount, top5 }
  }, [poolBets, match?.home_score, match?.away_score])

  // Voting state
  const votingOpen = match?.voting_open === true
  const votingClosedAt = match?.voting_closed_at ? new Date(match.voting_closed_at) : null
  const isVotingClosed = votingClosedAt ? new Date() > votingClosedAt : false
  const showResults = isVotingClosed || match?.match_state === 'finished'

  const [chatMsg, setChatMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [votingFor, setVotingFor] = useState<string | null>(null)

  const myVote = votes?.find(v => v.user_id === user?.id)

  const sendMessage = async () => {
    if (!chatMsg.trim() || !matchId || !user) return
    setSendingMsg(true)
    await supabase.from('match_messages').insert({
      match_id: matchId,
      user_id: user.id,
      user_email: user.email ?? 'Anônimo',
      message: chatMsg.trim(),
    })
    setChatMsg('')
    setSendingMsg(false)
    queryClient.invalidateQueries({ queryKey: ['match_messages', matchId] })
  }

  const castVote = async (playerId: string) => {
    if (!matchId || !user) return
    setVotingFor(playerId)
    if (myVote) {
      await supabase.from('motm_votes').update({ player_id: playerId }).eq('id', myVote.id)
    } else {
      await supabase.from('motm_votes').insert({ match_id: matchId, user_id: user.id, player_id: playerId })
    }
    setVotingFor(null)
    queryClient.invalidateQueries({ queryKey: ['motm_votes', matchId] })
  }

  // Vote counts
  const voteCounts = (() => {
    const map: Record<string, number> = {}
    for (const v of votes ?? []) {
      map[v.player_id] = (map[v.player_id] ?? 0) + 1
    }
    return map
  })()
  const topVotedId = Object.entries(voteCounts).sort(([,a], [,b]) => b - a)[0]?.[0]

  const matchState: MatchState = (match?.match_state as MatchState) ?? 'pre_match'
  const timer = useGameTimer(match?.half_start_time ?? null, matchState)
  const isPreMatch = !match || matchState === 'pre_match'
  const isPlaying = matchState === 'first_half' || matchState === 'second_half'

  const homeYellows = events?.filter(
    (e: MatchEvent) => e.event_type === 'yellow_card' && e.team_id === match?.home_team_id
  ).length ?? 0
  const awayYellows = events?.filter(
    (e: MatchEvent) => e.event_type === 'yellow_card' && e.team_id === match?.away_team_id
  ).length ?? 0
  const homeReds = events?.filter(
    (e: MatchEvent) => e.event_type === 'red_card' && e.team_id === match?.home_team_id
  ).length ?? 0
  const awayReds = events?.filter(
    (e: MatchEvent) => e.event_type === 'red_card' && e.team_id === match?.away_team_id
  ).length ?? 0

  function eventIcon(type: string) {
    switch (type) {
      case 'goal':
        return '\u26BD'
      case 'yellow_card':
        return '\uD83D\uDFE8'
      case 'red_card':
        return '\uD83D\uDFE5'
      default:
        return '\u25CF'
    }
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100">
      {/* Header */}
      <header className="bg-[#0f1a2e] border-b border-slate-700/50 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link
            to="/jogos"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos jogos
          </Link>
          <div className="flex items-center gap-2">
            {match.category && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                {match.category.name}
              </Badge>
            )}
            <Badge className="bg-slate-600/40 text-slate-300 border-slate-500/30">
              {phaseLabel(match.phase)}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {isPreMatch ? (
          /* ==================== PRE-MATCH ==================== */
          <div className="text-center space-y-8 py-8">
            <div className="flex items-center justify-center gap-6 sm:gap-10">
              {/* Home team */}
              <div className="flex flex-col items-center gap-3">
                <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="xl" />
                <span className="font-bold text-white text-sm sm:text-base">
                  {match.home_team?.name}
                </span>
              </div>

              <span className="text-3xl font-extrabold text-slate-500">VS</span>

              {/* Away team */}
              <div className="flex flex-col items-center gap-3">
                <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="xl" />
                <span className="font-bold text-white text-sm sm:text-base">
                  {match.away_team?.name}
                </span>
              </div>
            </div>

            {/* Date & location */}
            <div className="space-y-2 text-slate-400 text-sm">
              {match.match_date && (
                <p className="flex items-center justify-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(match.match_date)}
                </p>
              )}
              {match.location && (
                <p className="flex items-center justify-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {match.location}
                </p>
              )}
            </div>

            <div className="space-y-3 pt-4">
              <p className="text-2xl font-bold text-slate-300">
                Partida ainda n&atilde;o iniciada
              </p>
              <p className="text-sm text-slate-500">
                Este link ser&aacute; atualizado automaticamente quando a partida come&ccedil;ar
              </p>
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs text-slate-500">Auto-atualiza&ccedil;&atilde;o a cada 5s</span>
            </div>
          </div>
        ) : (
          /* ==================== LIVE / FINISHED ==================== */
          <div className="space-y-6">
            {/* Timer / State indicator */}
            <div className="flex items-center justify-center gap-3">
              {isPlaying && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
              )}
              <div className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold ${
                isPlaying ? 'bg-green-500/10 text-green-400' : 'bg-slate-700/50 text-slate-300 text-sm'
              }`}>
                {isPlaying && <Clock className="h-4 w-4" />}
                {isPlaying && <span className="text-sm opacity-70">{matchState === 'first_half' ? '1ºT' : '2ºT'}</span>}
                {isPlaying ? <span className="text-xl font-mono">{timer.display}</span> : stateLabels[matchState]}
              </div>
              {isPlaying && (
                <span className="text-xs text-green-400 font-semibold uppercase tracking-wider">Ao vivo</span>
              )}
            </div>

            {/* Scoreboard */}
            <Card className="bg-[#0f1a2e] border-slate-700/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  {/* Home */}
                  <div className="flex-1 text-center">
                    <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="lg" className="mx-auto mb-2" />
                    <p className="font-bold text-white text-sm sm:text-base">
                      {match.home_team?.name}
                    </p>
                    {/* Card icons */}
                    <div className="flex items-center justify-center gap-1 mt-1 min-h-[20px]">
                      {Array.from({ length: homeYellows }).map((_, i) => (
                        <span key={`hy${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-yellow-400" />
                      ))}
                      {Array.from({ length: homeReds }).map((_, i) => (
                        <span key={`hr${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-red-500" />
                      ))}
                    </div>
                    {/* Goal scorers */}
                    {(() => {
                      const homeGoals = events?.filter((e: MatchEvent) => e.event_type === 'goal' && e.team_id === match.home_team_id) ?? []
                      const homeOwnGoals = events?.filter((e: MatchEvent) => e.event_type === 'own_goal' && e.team_id !== match.home_team_id) ?? []
                      return (homeGoals.length > 0 || homeOwnGoals.length > 0) ? (
                        <div className="mt-2 space-y-0.5">
                          {homeGoals.map((e: MatchEvent) => (
                            <p key={e.id} className="text-[11px] text-slate-400">⚽ {e.player?.name} {e.minute != null ? `${e.minute}'` : ''}</p>
                          ))}
                          {homeOwnGoals.map((e: MatchEvent) => (
                            <p key={e.id} className="text-[11px] text-red-400">⚽ G.C. {e.minute != null ? `${e.minute}'` : ''}</p>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>

                  {/* Score */}
                  <div className="text-center">
                    <div className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight">
                      {match.home_score}{' '}
                      <span className="text-slate-500 text-3xl sm:text-4xl mx-1">&times;</span>{' '}
                      {match.away_score}
                    </div>
                    {match.home_score_extra != null && match.away_score_extra != null && (
                      <p className="text-xs text-slate-400 mt-1">
                        Prorr: {match.home_score_extra} &times; {match.away_score_extra}
                      </p>
                    )}
                    {match.home_penalties != null && match.away_penalties != null && (
                      <p className="text-xs text-amber-400 mt-0.5">
                        P&ecirc;n: {match.home_penalties} &times; {match.away_penalties}
                      </p>
                    )}
                    {match.match_state === 'finished' && (
                      <Badge className="mt-2 bg-slate-600/40 text-slate-300 border-slate-500/30">
                        Encerrado
                      </Badge>
                    )}
                    {match.match_state === 'finished' && match.motm_player && (
                      <div className="mt-3 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30">
                        <Star className="h-3.5 w-3.5 text-gold-400 fill-gold-400" />
                        <span className="text-xs font-bold text-gold-400">Destaque: {match.motm_player.name}</span>
                      </div>
                    )}
                    {(match.home_fouls > 0 || match.away_fouls > 0) && (
                      <p className="text-xs text-slate-500 mt-2">
                        Faltas: {match.home_fouls ?? 0} - {match.away_fouls ?? 0}
                      </p>
                    )}
                  </div>

                  {/* Away */}
                  <div className="flex-1 text-center">
                    <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="lg" className="mx-auto mb-2" />
                    <p className="font-bold text-white text-sm sm:text-base">
                      {match.away_team?.name}
                    </p>
                    {/* Card icons */}
                    <div className="flex items-center justify-center gap-1 mt-1 min-h-[20px]">
                      {Array.from({ length: awayYellows }).map((_, i) => (
                        <span key={`ay${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-yellow-400" />
                      ))}
                      {Array.from({ length: awayReds }).map((_, i) => (
                        <span key={`ar${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-red-500" />
                      ))}
                    </div>
                    {/* Goal scorers */}
                    {(() => {
                      const awayGoals = events?.filter((e: MatchEvent) => e.event_type === 'goal' && e.team_id === match.away_team_id) ?? []
                      const awayOwnGoals = events?.filter((e: MatchEvent) => e.event_type === 'own_goal' && e.team_id !== match.away_team_id) ?? []
                      return (awayGoals.length > 0 || awayOwnGoals.length > 0) ? (
                        <div className="mt-2 space-y-0.5">
                          {awayGoals.map((e: MatchEvent) => (
                            <p key={e.id} className="text-[11px] text-slate-400">⚽ {e.player?.name} {e.minute != null ? `${e.minute}'` : ''}</p>
                          ))}
                          {awayOwnGoals.map((e: MatchEvent) => (
                            <p key={e.id} className="text-[11px] text-red-400">⚽ G.C. {e.minute != null ? `${e.minute}'` : ''}</p>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bolão stats */}
            {poolStats && poolStats.total > 0 && (
              <Card className="bg-[#0f1a2e] border-amber-500/20">
                <CardContent className="p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Bolão</h3>
                    </div>
                    <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
                      {poolStats.total} participante{poolStats.total !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                      <div className="text-2xl font-extrabold text-amber-400">{poolStats.scoringCount}</div>
                      <div className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-wide mt-0.5">Pontuaram</div>
                    </div>
                    <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                      <div className="text-2xl font-extrabold text-green-400">{poolStats.exactCount}</div>
                      <div className="text-[10px] text-green-400/70 font-semibold uppercase tracking-wide mt-0.5">Placar exato</div>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                      <div className="text-2xl font-extrabold text-red-400">{poolStats.lostCount}</div>
                      <div className="text-[10px] text-red-400/70 font-semibold uppercase tracking-wide mt-0.5">Zerados</div>
                    </div>
                  </div>

                  {/* Top 5 */}
                  {poolStats.top5.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
                        Top {poolStats.top5.length} nesta partida
                      </p>
                      <div className="space-y-1.5">
                        {poolStats.top5.map((entry, idx) => (
                          <div key={entry.id} className="flex items-center gap-2.5">
                            <span className={`text-xs font-extrabold w-5 text-center flex-shrink-0 ${
                              idx === 0 ? 'text-amber-400' : 'text-slate-500'
                            }`}>{idx + 1}</span>
                            <div className="h-5 w-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 flex-shrink-0">
                              {entry.name.charAt(0)}
                            </div>
                            <span className="text-sm text-slate-200 flex-1 truncate">{entry.name}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                              {entry.home_score} × {entry.away_score}
                            </span>
                            <span className={`text-xs font-bold flex-shrink-0 min-w-[36px] text-right ${
                              entry.pts === 15 ? 'text-green-400' :
                              entry.pts >= 8 ? 'text-amber-400' :
                              entry.pts > 0 ? 'text-slate-300' : 'text-red-400'
                            }`}>
                              {entry.pts} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Events timeline */}
            {events && events.length > 0 && (
              <Card className="bg-[#0f1a2e] border-slate-700/50">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Eventos da Partida
                  </h3>
                  <div className="space-y-2">
                    {events.map((event: MatchEvent) => {
                      const isHome = event.team_id === match.home_team_id
                      return (
                        <div
                          key={event.id}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border-l-4 ${
                            isHome
                              ? 'bg-blue-900/15 border-l-blue-500'
                              : 'bg-red-900/15 border-l-red-500'
                          }`}
                        >
                          <span className="text-lg" role="img">
                            {eventIcon(event.event_type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {event.event_type === 'own_goal' ? <span className="text-red-400">Gol Contra</span> : (event.player?.name ?? 'Jogador')}
                            </p>
                            <p className={`text-xs font-medium truncate flex items-center gap-1 ${isHome ? 'text-blue-400' : 'text-red-400'}`}>
                              {event.team?.shield_url && <img src={event.team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover inline" />}
                              {event.team?.name}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-700/50 rounded px-2 py-0.5">
                            {event.half === 2 ? '2ºT' : '1ºT'}{event.minute != null ? ` ${event.minute}'` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Destaque do Jogo — shown after voting closes */}
            {showResults && match.motm_player_id && match.motm_player && (
              <Card className="bg-gradient-to-br from-amber-500/10 to-yellow-600/10 border-amber-500/30">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Star className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold">
                      Destaque do Jogo
                    </p>
                    <p className="text-lg font-bold text-white">
                      {match.motm_player.name}
                    </p>
                    {votes && votes.length > 0 && (
                      <p className="text-xs text-slate-400">{votes.length} voto{votes.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Voting — only when open, results hidden until closed */}
            {votingOpen && !isVotingClosed && allPlayers.length > 0 && (
              <Card className="bg-[#0f1a2e] border-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                      Vote no Destaque do Jogo
                    </h3>
                  </div>
                  {user ? (
                    <div className="space-y-1.5">
                      {/* Group by team */}
                      {[match.home_team?.name, match.away_team?.name].map(teamName => {
                        const teamPlayers = allPlayers.filter(p => p.teamName === teamName)
                        if (teamPlayers.length === 0) return null
                        return (
                          <div key={teamName}>
                            <p className="text-[10px] text-slate-500 font-semibold uppercase mb-1 mt-2">{teamName}</p>
                            {teamPlayers.map(p => {
                              const isMyVote = myVote?.player_id === p.id
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => castVote(p.id)}
                                  disabled={votingFor !== null}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all mb-1 ${
                                    isMyVote
                                      ? 'bg-amber-500/15 border border-amber-500/40'
                                      : 'bg-slate-800/40 border border-transparent hover:border-slate-600'
                                  }`}
                                >
                                  <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                                  {isMyVote && <span className="text-[10px] text-amber-400">✓ Seu voto</span>}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-3">
                      <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para votar
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Voting closed — show full results */}
            {isVotingClosed && votes && votes.length > 0 && (
              <Card className="bg-[#0f1a2e] border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                      Resultado da Votação
                    </h3>
                    <span className="text-xs text-slate-500">{votes.length} voto{votes.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1">
                    {Object.entries(voteCounts)
                      .sort(([,a], [,b]) => b - a)
                      .map(([pid, count], idx) => {
                        const player = allPlayers.find(p => p.id === pid)
                        const isWinner = pid === topVotedId
                        return (
                          <div key={pid} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isWinner ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800/30'}`}>
                            <span className="text-xs font-bold text-slate-500 w-5">{idx + 1}.</span>
                            {isWinner && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                            <span className={`text-sm flex-1 ${isWinner ? 'text-white font-bold' : 'text-slate-300'}`}>{player?.name ?? '?'}</span>
                            <span className="text-xs text-slate-500">{player?.teamName}</span>
                            <span className={`text-sm font-bold ${isWinner ? 'text-amber-400' : 'text-slate-500'}`}>{count}</span>
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Players roster — present/confirmed */}
            {!isPreMatch && !!((homeRosterLive?.length || 0) + (awayRosterLive?.length || 0)) && (() => {
              const isFinished = matchState === 'finished'

              // Decide which players to show:
              // - finished + no attendance → show players with events
              // - finished + attendance → show present players
              // - live → show present players (confirmed by referee)
              const filterPlayer = (playerId: string) => {
                if (isFinished && !hasAttendance) return eventPlayerIds.has(playerId)
                return presentIds.has(playerId)
              }

              const homeShown = homeRosterLive?.filter((pt: any) => filterPlayer(pt.player_id)) ?? []
              const awayShown = awayRosterLive?.filter((pt: any) => filterPlayer(pt.player_id)) ?? []
              if (homeShown.length === 0 && awayShown.length === 0) return null

              const playerEvents = (playerId: string) => events?.filter((e: MatchEvent) => e.player_id === playerId) ?? []

              const title = isFinished ? 'Participantes da Partida' : 'Jogadores Confirmados'

              return (
                <Card className="bg-[#0f1a2e] border-slate-700/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="h-4 w-4 text-slate-400" />
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Home */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {match.home_team?.shield_url && <img src={match.home_team.shield_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
                          <span className="text-xs font-semibold text-blue-400 truncate">{match.home_team?.name}</span>
                        </div>
                        <div className="space-y-1">
                          {homeShown.map((pt: any) => {
                            const evts = playerEvents(pt.player_id)
                            const goals = evts.filter((e: MatchEvent) => e.event_type === 'goal').length
                            const yellows = evts.filter((e: MatchEvent) => e.event_type === 'yellow_card').length
                            const reds = evts.filter((e: MatchEvent) => e.event_type === 'red_card').length
                            return (
                              <div key={pt.player_id} className="flex items-center gap-1.5 text-xs py-1 border-b border-slate-800 last:border-0">
                                {pt.jersey_number != null && (
                                  <span className="text-[10px] text-slate-500 font-bold w-5 text-right flex-shrink-0">{pt.jersey_number}</span>
                                )}
                                <span className="text-slate-200 flex-1 truncate">{pt.player?.name}</span>
                                <span className="flex items-center gap-0.5">
                                  {goals > 0 && <span className="text-[10px]">{'⚽'.repeat(goals)}</span>}
                                  {yellows > 0 && Array.from({length: yellows}).map((_, i) => <span key={i} className="inline-block w-2 h-2.5 bg-yellow-400 rounded-[2px]" />)}
                                  {reds > 0 && Array.from({length: reds}).map((_, i) => <span key={i} className="inline-block w-2 h-2.5 bg-red-500 rounded-[2px]" />)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Away */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {match.away_team?.shield_url && <img src={match.away_team.shield_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
                          <span className="text-xs font-semibold text-red-400 truncate">{match.away_team?.name}</span>
                        </div>
                        <div className="space-y-1">
                          {awayShown.map((pt: any) => {
                            const evts = playerEvents(pt.player_id)
                            const goals = evts.filter((e: MatchEvent) => e.event_type === 'goal').length
                            const yellows = evts.filter((e: MatchEvent) => e.event_type === 'yellow_card').length
                            const reds = evts.filter((e: MatchEvent) => e.event_type === 'red_card').length
                            return (
                              <div key={pt.player_id} className="flex items-center gap-1.5 text-xs py-1 border-b border-slate-800 last:border-0">
                                {pt.jersey_number != null && (
                                  <span className="text-[10px] text-slate-500 font-bold w-5 text-right flex-shrink-0">{pt.jersey_number}</span>
                                )}
                                <span className="text-slate-200 flex-1 truncate">{pt.player?.name}</span>
                                <span className="flex items-center gap-0.5">
                                  {goals > 0 && <span className="text-[10px]">{'⚽'.repeat(goals)}</span>}
                                  {yellows > 0 && Array.from({length: yellows}).map((_, i) => <span key={i} className="inline-block w-2 h-2.5 bg-yellow-400 rounded-[2px]" />)}
                                  {reds > 0 && Array.from({length: reds}).map((_, i) => <span key={i} className="inline-block w-2 h-2.5 bg-red-500 rounded-[2px]" />)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Chat */}
            {!isPreMatch && (
              <Card className="bg-[#0f1a2e] border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="h-4 w-4 text-pitch-400" />
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Chat da Partida</h3>
                  </div>

                  {/* Message input */}
                  {user ? (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={chatMsg}
                        onChange={e => setChatMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        placeholder="Envie uma mensagem..."
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-pitch-500"
                        maxLength={200}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={sendingMsg || !chatMsg.trim()}
                        className="px-3 bg-pitch-600 hover:bg-pitch-700"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-2 mb-3">
                      <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para enviar mensagens
                    </p>
                  )}

                  {/* Messages */}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {messages && messages.length > 0 ? messages.map(msg => (
                      <div key={msg.id} className="bg-slate-800/40 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-pitch-400 truncate">
                            {msg.user_email.split('@')[0]}
                          </span>
                          <span className="text-[10px] text-slate-600 flex-shrink-0">
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mt-0.5 break-words">{msg.message}</p>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-600 text-center py-4">Nenhuma mensagem ainda</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Auto-refresh footer */}
            <div className="flex items-center justify-center gap-2 pt-2 pb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs text-slate-500">Auto-atualização a cada 5s</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
