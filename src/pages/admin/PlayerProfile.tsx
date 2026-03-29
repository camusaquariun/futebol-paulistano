import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Camera, Target, ShieldAlert, Trophy, TrendingUp, Calendar, Crown, Star, Clock } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'

function StatCard({ value, label, color, icon }: { value: string | number; label: string; color?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        {icon && <div className="flex justify-center mb-1 text-slate-400">{icon}</div>}
        <p className={`text-2xl font-extrabold ${color ?? 'text-white'}`}>{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}

export default function PlayerProfile() {
  const { playerId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { selectedId: championshipId } = useAdminChampionship()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Player base info
  const { data: player } = useQuery({
    queryKey: ['player', playerId],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*').eq('id', playerId!).single()
      return data
    },
    enabled: !!playerId,
  })

  // Player's team links
  const { data: playerTeams } = useQuery({
    queryKey: ['player_teams_profile', playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_teams')
        .select('*, team:teams(*), category:categories(*)')
        .eq('player_id', playerId!)
      return data ?? []
    },
    enabled: !!playerId,
  })

  // All match events for this player in this championship
  const { data: events } = useQuery({
    queryKey: ['player_events', playerId, championshipId],
    queryFn: async () => {
      const { data } = await supabase
        .from('match_events')
        .select('*, match:matches!inner(id, championship_id, status, home_team_id, away_team_id, home_score, away_score, match_date, phase, home_team:teams!matches_home_team_id_fkey(name, shield_url), away_team:teams!matches_away_team_id_fkey(name, shield_url)), team:teams(name, shield_url)')
        .eq('player_id', playerId!)
        .eq('match.championship_id', championshipId!)
        .eq('match.status', 'finished')
      return data ?? []
    },
    enabled: !!playerId && !!championshipId,
  })

  // Matches where player was confirmed present (attendance)
  const { data: attendedMatchIds } = useQuery({
    queryKey: ['player_attendance', playerId, championshipId],
    queryFn: async () => {
      // Get all matches the player was present via attendance
      const { data: att } = await supabase
        .from('match_attendance')
        .select('match_id, team_id')
        .eq('player_id', playerId!)
        .eq('present', true)
      return new Set(att?.map((a: any) => a.match_id) ?? [])
    },
    enabled: !!playerId,
  })

  // MOTM (man of the match) count
  const { data: motmCount } = useQuery({
    queryKey: ['player_motm', playerId, championshipId],
    queryFn: async () => {
      const { count } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('motm_player_id', playerId!)
        .eq('championship_id', championshipId!)
        .eq('status', 'finished')
      return count ?? 0
    },
    enabled: !!playerId && !!championshipId,
  })

  // Upcoming matches for the player's teams in this championship
  const { data: upcomingMatches } = useQuery({
    queryKey: ['player_upcoming_matches', playerId, championshipId],
    queryFn: async () => {
      const teamIdList = playerTeams?.map((pt: any) => pt.team_id) ?? []
      if (teamIdList.length === 0) return []
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, phase, home_team_id, away_team_id, status, home_team:teams!matches_home_team_id_fkey(name, shield_url), away_team:teams!matches_away_team_id_fkey(name, shield_url)')
        .eq('championship_id', championshipId!)
        .neq('status', 'finished')
        .or(teamIdList.map((id: string) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(','))
        .order('match_date', { ascending: true })
      return data ?? []
    },
    enabled: !!playerId && !!championshipId && !!playerTeams && playerTeams.length > 0,
  })

  // Compute stats
  const goals = events?.filter(e => e.event_type === 'goal').length ?? 0
  const yellows = events?.filter(e => e.event_type === 'yellow_card').length ?? 0
  const reds = events?.filter(e => e.event_type === 'red_card').length ?? 0

  // Unique matches from events + attendance
  const teamIds = new Set(playerTeams?.map((pt: any) => pt.team_id) ?? [])
  const uniqueMatches = new Map<string, any>()
  for (const e of events ?? []) {
    if (!uniqueMatches.has(e.match_id)) uniqueMatches.set(e.match_id, e.match)
  }
  // Also include attendance matches if we have the match data
  const matchesParticipated = uniqueMatches.size || (attendedMatchIds?.size ?? 0)

  let wins = 0, draws = 0, losses = 0
  for (const match of uniqueMatches.values()) {
    if (!match || match.home_score == null || match.away_score == null) continue
    const isHome = teamIds.has(match.home_team_id)
    const isAway = teamIds.has(match.away_team_id)
    if (!isHome && !isAway) continue
    const teamGoals = isHome ? match.home_score : match.away_score
    const oppGoals = isHome ? match.away_score : match.home_score
    if (teamGoals > oppGoals) wins++
    else if (teamGoals === oppGoals) draws++
    else losses++
  }

  // Match list sorted by date desc
  const matchList = [...uniqueMatches.values()].sort((a, b) =>
    new Date(b.match_date ?? 0).getTime() - new Date(a.match_date ?? 0).getTime()
  )

  const handlePhotoUpload = async (file: File) => {
    if (!playerId) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${playerId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('player-photos').upload(path, file, { upsert: true })
    if (error) { alert('Erro ao enviar foto: ' + error.message); setUploading(false); return }
    const { data } = supabase.storage.from('player-photos').getPublicUrl(path)
    await supabase.from('players').update({ photo_url: data.publicUrl }).eq('id', playerId)
    queryClient.invalidateQueries({ queryKey: ['player', playerId] })
    queryClient.invalidateQueries({ queryKey: ['players'] })
    queryClient.invalidateQueries({ queryKey: ['team_roster'] })
    setUploading(false)
  }

  if (!player) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/admin/jogadores')}>
        <ChevronLeft className="h-4 w-4 mr-1" />Voltar aos Jogadores
      </Button>

      {/* Header */}
      <div className="flex items-start gap-5">
        {/* Photo + upload */}
        <div className="relative flex-shrink-0">
          <div
            className="h-24 w-24 rounded-full overflow-hidden border-2 border-navy-600 cursor-pointer group"
            onClick={() => fileRef.current?.click()}
          >
            {player.photo_url ? (
              <img src={player.photo_url} alt={player.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-navy-700 flex items-center justify-center text-3xl font-bold text-slate-300">
                {player.name.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className={`h-6 w-6 ${uploading ? 'text-pitch-400 animate-pulse' : 'text-white'}`} />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{player.name}</h1>
          {playerTeams && playerTeams.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {playerTeams.map((pt: any) => (
                <div key={pt.id} className="flex items-center gap-1.5">
                  {pt.team?.shield_url && <img src={pt.team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
                  <Link to={`/admin/times/${pt.team_id}`} className="text-sm text-pitch-400 hover:text-pitch-300 hover:underline">{pt.team?.name}</Link>
                  <Badge variant="secondary" className="text-[10px]">{pt.category?.name}</Badge>
                  {pt.is_captain && <Badge variant="warning" className="text-[10px] flex items-center gap-0.5"><Crown className="h-2.5 w-2.5" />C</Badge>}
                  {pt.jersey_number != null && <span className="text-xs text-slate-500">#{pt.jersey_number}</span>}
                </div>
              ))}
            </div>
          )}
          {player.user_id && (
            <p className="text-xs text-pitch-400 mt-1 flex items-center gap-1">🔗 Conta de usuário vinculada</p>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1"
          >
            <Camera className="h-3 w-3" />
            {uploading ? 'Enviando...' : player.photo_url ? 'Trocar foto' : 'Adicionar foto'}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {championshipId && (
        <>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-pitch-400" />
              <h2 className="text-sm font-semibold text-white">Estatísticas do Campeonato</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard value={matchesParticipated} label="Partidas" icon={<Calendar className="h-4 w-4" />} />
              <StatCard value={goals} label="Gols" color="text-pitch-400" icon={<Target className="h-4 w-4" />} />
              <StatCard value={yellows} label="Amarelos" color="text-yellow-400" icon={<span className="text-sm">🟨</span>} />
              <StatCard value={reds} label="Vermelhos" color="text-red-400" icon={<span className="text-sm">🟥</span>} />
              <StatCard value={wins} label="Vitórias" color="text-pitch-400" icon={<TrendingUp className="h-4 w-4" />} />
              <StatCard value={draws} label="Empates" icon={<span className="text-sm">🤝</span>} />
              <StatCard value={losses} label="Derrotas" color="text-red-400" icon={<ShieldAlert className="h-4 w-4" />} />
              <StatCard value={motmCount ?? 0} label="Destaque" color="text-gold-400" icon={<Star className="h-4 w-4" />} />
            </div>
          </div>

          {/* Upcoming matches */}
          {upcomingMatches && upcomingMatches.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-pitch-400" />
                <h2 className="text-sm font-semibold text-white">Próximas Partidas</h2>
              </div>
              <div className="space-y-2">
                {upcomingMatches.map((m: any) => {
                  const isHome = teamIds.has(m.home_team_id)
                  return (
                    <Link key={m.id} to={`/partidas/${m.id}/ao-vivo`}>
                      <Card className="hover:bg-navy-800/50 transition-colors cursor-pointer">
                        <CardContent className="p-3 flex items-center gap-3">
                          <span className="text-xs font-extrabold px-2 py-1 rounded border text-slate-400 bg-slate-700/20 border-slate-600/30 min-w-[28px] text-center">–</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              {m.home_team?.shield_url && <img src={m.home_team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
                              <span className={`font-medium ${isHome ? 'text-white' : 'text-slate-400'}`}>{m.home_team?.name}</span>
                              <span className="text-slate-500 font-bold">vs</span>
                              <span className={`font-medium ${!isHome ? 'text-white' : 'text-slate-400'}`}>{m.away_team?.name}</span>
                              {m.away_team?.shield_url && <img src={m.away_team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
                            </div>
                            {m.match_date && <p className="text-[10px] text-slate-500 mt-0.5">{formatDate(m.match_date)} · {phaseLabel(m.phase)}</p>}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Match history */}
          {matchList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-gold-400" />
                <h2 className="text-sm font-semibold text-white">Partidas Participadas</h2>
              </div>
              <div className="space-y-2">
                {matchList.map(m => {
                  const isHome = teamIds.has(m.home_team_id)
                  const teamGoals = isHome ? m.home_score : m.away_score
                  const oppGoals = isHome ? m.away_score : m.home_score
                  const result = teamGoals > oppGoals ? 'V' : teamGoals === oppGoals ? 'E' : 'D'
                  const resultColor = result === 'V' ? 'text-pitch-400 bg-pitch-500/10 border-pitch-500/30'
                    : result === 'E' ? 'text-slate-400 bg-slate-700/20 border-slate-600/30'
                    : 'text-red-400 bg-red-500/10 border-red-500/30'

                  const myEvents = events?.filter(e => e.match_id === m.id) ?? []
                  const myGoals = myEvents.filter(e => e.event_type === 'goal').length
                  const myYellows = myEvents.filter(e => e.event_type === 'yellow_card').length
                  const myReds = myEvents.filter(e => e.event_type === 'red_card').length

                  return (
                    <Link key={m.id} to={`/partidas/${m.id}/ao-vivo`}>
                      <Card className="hover:bg-navy-800/50 transition-colors cursor-pointer">
                        <CardContent className="p-3 flex items-center gap-3">
                          <span className={`text-xs font-extrabold px-2 py-1 rounded border ${resultColor} min-w-[28px] text-center`}>{result}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              {m.home_team?.shield_url && <img src={m.home_team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
                              <span className={`font-medium ${isHome ? 'text-white' : 'text-slate-400'}`}>{m.home_team?.name}</span>
                              <span className="text-white font-bold">{m.home_score} × {m.away_score}</span>
                              <span className={`font-medium ${!isHome ? 'text-white' : 'text-slate-400'}`}>{m.away_team?.name}</span>
                              {m.away_team?.shield_url && <img src={m.away_team.shield_url} alt="" className="h-4 w-4 rounded-full object-cover" />}
                            </div>
                            {m.match_date && <p className="text-[10px] text-slate-500 mt-0.5">{formatDate(m.match_date)} · {phaseLabel(m.phase)}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                            {myGoals > 0 && <span className="text-pitch-400 font-bold">{'⚽'.repeat(myGoals)}</span>}
                            {myYellows > 0 && Array.from({length: myYellows}).map((_, i) => <span key={i} className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-[2px]" />)}
                            {myReds > 0 && Array.from({length: myReds}).map((_, i) => <span key={i} className="inline-block w-2.5 h-3.5 bg-red-500 rounded-[2px]" />)}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {matchList.length === 0 && !upcomingMatches?.length && (
            <p className="text-sm text-slate-500 text-center py-4">Nenhuma partida registrada para este campeonato.</p>
          )}
        </>
      )}
    </div>
  )
}
