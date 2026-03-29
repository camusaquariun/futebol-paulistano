import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useActiveChampionship, useTeamRoster, useTeamMatches, useCategories, useTeams } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Calendar, MapPin, Crown, TrendingUp, UserCircle, Star, ShieldAlert } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import type { Match, PlayerTeam } from '@/types/database'

const POSITION_COLORS: Record<string, string> = {
  'Goleiro': 'bg-gold-500 text-navy-950',
  'Zagueiro': 'bg-blue-600 text-white',
  'Ala': 'bg-cyan-600 text-white',
  'Meio-campo': 'bg-pitch-600 text-white',
  'Meia-atacante': 'bg-purple-600 text-white',
  'Atacante': 'bg-red-500 text-white',
  'Centroavante': 'bg-orange-500 text-white',
}

function PositionBadge({ pos }: { pos: string }) {
  const colors = POSITION_COLORS[pos] ?? 'bg-navy-600 text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors}`}>
      {pos}
    </span>
  )
}

function StatCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-extrabold ${color ?? 'text-white'}`}>{value}</p>
        <p className="text-xs text-slate-400 mt-1">{label}</p>
      </CardContent>
    </Card>
  )
}

function YellowCardIcons({ count }: { count: number }) {
  const shown = Math.min(count, 2)
  if (shown === 0) return null
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-[2px] shadow-sm" />
      ))}
    </span>
  )
}

function TeamMatchCard({ match, teamId }: { match: Match; teamId: string }) {
  const isFinished = match.status === 'finished'
  const isHome = match.home_team_id === teamId

  return (
    <Card className="card-hover cursor-pointer transition-all hover:ring-1 hover:ring-pitch-500/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Badge variant="secondary" className="text-[10px]">
            {phaseLabel(match.phase)}
          </Badge>
          <Badge variant={isFinished ? 'default' : 'secondary'}>
            {isFinished ? 'Encerrado' : 'A realizar'}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-right">
            <div className="flex items-center justify-end gap-2">
              {match.home_team?.shield_url ? (
                <img src={match.home_team.shield_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : null}
              <span className={`font-bold text-sm sm:text-base ${match.home_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                {match.home_team?.name}
              </span>
            </div>
          </div>

          <div className="flex-shrink-0 text-center min-w-[80px]">
            {isFinished ? (
              <div className="text-2xl font-extrabold text-white">
                {match.home_score} <span className="text-slate-500">&times;</span> {match.away_score}
              </div>
            ) : (
              <span className="text-lg text-slate-500 font-bold">VS</span>
            )}
          </div>

          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm sm:text-base ${match.away_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                {match.away_team?.name}
              </span>
              {match.away_team?.shield_url ? (
                <img src={match.away_team.shield_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {match.match_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(match.match_date)}
              </span>
            )}
            {match.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {match.location}
              </span>
            )}
          </div>
          {isFinished && match.motm_player && (
            <span className="flex items-center gap-1 text-xs text-gold-400">
              <Star className="h-3 w-3 fill-gold-400" />
              {match.motm_player.name}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function TeamProfile() {
  const { teamId } = useParams()
  const { data: championship } = useActiveChampionship()
  const championshipId = championship?.id
  const { data: teams } = useTeams(championshipId)
  const { data: categories } = useCategories()
  const { data: matches } = useTeamMatches(championshipId, teamId)

  const team = teams?.find(t => t.id === teamId)

  // Find category: try all 3, use whichever has players
  const masterCatId = categories?.find(c => c.name === 'Master')?.id
  const livreCatId = categories?.find(c => c.name === 'Livre')?.id
  const veteranoCatId = categories?.find(c => c.name === 'Veterano')?.id

  const { data: masterRoster } = useTeamRoster(teamId, masterCatId)
  const { data: livreRoster } = useTeamRoster(teamId, livreCatId)
  const { data: veteranoRoster } = useTeamRoster(teamId, veteranoCatId)

  const activeRoster = (masterRoster?.length ?? 0) > 0
    ? { roster: masterRoster!, catName: 'Master', catId: masterCatId! }
    : (livreRoster?.length ?? 0) > 0
    ? { roster: livreRoster!, catName: 'Livre', catId: livreCatId! }
    : (veteranoRoster?.length ?? 0) > 0
    ? { roster: veteranoRoster!, catName: 'Veterano', catId: veteranoCatId! }
    : null

  // Sort: captain first, then goalkeepers, then alphabetical
  const sortedRoster = activeRoster?.roster.slice().sort((a: PlayerTeam, b: PlayerTeam) => {
    if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1
    const aGk = a.positions?.includes('Goleiro') ? 0 : 1
    const bGk = b.positions?.includes('Goleiro') ? 0 : 1
    if (aGk !== bGk) return aGk - bGk
    return (a.player?.name ?? '').localeCompare(b.player?.name ?? '')
  })

  const captain = activeRoster?.roster.find(pt => pt.is_captain)

  // Match events (cards)
  const { data: events } = useQuery({
    queryKey: ['team_events', teamId, championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_events')
        .select('*, match:matches!inner(championship_id)')
        .eq('team_id', teamId!)
        .eq('match.championship_id', championshipId!)
      if (error) throw error
      return data
    },
    enabled: !!teamId && !!championshipId,
  })

  const yellowCards = events?.filter(e => e.event_type === 'yellow_card').length ?? 0
  const redCards = events?.filter(e => e.event_type === 'red_card').length ?? 0

  // Per-player card counts
  const playerYellowCards = new Map<string, number>()
  const playerRedCards = new Map<string, number>()
  events?.forEach(e => {
    if (!e.player_id) return
    if (e.event_type === 'yellow_card') {
      playerYellowCards.set(e.player_id, (playerYellowCards.get(e.player_id) ?? 0) + 1)
    } else if (e.event_type === 'red_card') {
      playerRedCards.set(e.player_id, (playerRedCards.get(e.player_id) ?? 0) + 1)
    }
  })

  // Calculate stats from matches
  const finishedMatches = matches?.filter(m => m.status === 'finished') ?? []

  const stats = finishedMatches.reduce(
    (acc, m) => {
      const isHome = m.home_team_id === teamId
      const goalsFor = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0)
      const goalsAgainst = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0)

      acc.matches_played += 1
      acc.goals_for += goalsFor
      acc.goals_against += goalsAgainst

      if (goalsFor > goalsAgainst) acc.wins += 1
      else if (goalsFor === goalsAgainst) acc.draws += 1
      else acc.losses += 1

      return acc
    },
    { matches_played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 }
  )

  const points = stats.wins * 3 + stats.draws
  const goalDifference = stats.goals_for - stats.goals_against
  const avgGoals = stats.matches_played > 0 ? (stats.goals_for / stats.matches_played).toFixed(1) : '0.0'

  // Count MOTM awards: matches where motm_player_id matches any player in team roster
  const rosterPlayerIds = activeRoster?.roster.map(pt => pt.player_id) ?? []
  const motmCount = finishedMatches.filter(m => m.motm_player_id && rosterPlayerIds.includes(m.motm_player_id)).length

  // Active suspensions for this team's players
  const { data: suspendedSet } = useQuery({
    queryKey: ['team_suspensions', teamId, activeRoster?.catId, championshipId],
    queryFn: async () => {
      const { data } = await supabase
        .from('suspensions')
        .select('player_id')
        .eq('championship_id', championshipId!)
        .eq('category_id', activeRoster!.catId)
        .eq('served', false)
        .in('player_id', rosterPlayerIds)
      return new Set(data?.map((s: any) => s.player_id) ?? [])
    },
    enabled: !!championshipId && !!activeRoster?.catId && rosterPlayerIds.length > 0,
  })

  // Map for player name lookup
  const rosterNameMap = new Map(sortedRoster?.map(pt => [pt.player_id, pt.player?.name ?? '?']) ?? [])

  // Split matches
  const scheduledMatches = matches?.filter(m => m.status === 'scheduled') ?? []

  if (!team) {
    return (
      <div className="space-y-4">
        <Link to="/classificacao" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="h-4 w-4" />Voltar
        </Link>
        <p className="text-slate-400">Time nao encontrado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <Link to="/classificacao" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" />Voltar para Classificacao
      </Link>

      {/* Team Header */}
      <div className="flex items-center gap-4">
        {team.shield_url ? (
          <img src={team.shield_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-navy-700 flex items-center justify-center text-xl font-bold text-slate-300">
            {team.name.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{team.name}</h1>
          {activeRoster && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{activeRoster.catName}</Badge>
              <span className="text-sm text-slate-400">{activeRoster.roster.length} jogadores</span>
              {captain && (
                <span className="text-sm text-gold-400 flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5" />
                  {captain.player?.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Dashboard */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-pitch-400" />
          <h2 className="text-base font-semibold text-white">Estatisticas</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard value={stats.matches_played} label="Jogos" />
          <StatCard value={stats.wins} label="Vitorias" color="text-pitch-400" />
          <StatCard value={stats.draws} label="Empates" />
          <StatCard value={stats.losses} label="Derrotas" color="text-red-400" />
          <StatCard value={points} label="Pontos" color="text-gold-400" />
          <StatCard value={stats.goals_for} label="Gols Marcados" color="text-pitch-400" />
          <StatCard value={stats.goals_against} label="Gols Sofridos" color="text-red-400" />
          <StatCard
            value={goalDifference > 0 ? `+${goalDifference}` : goalDifference}
            label="Saldo"
            color={goalDifference > 0 ? 'text-pitch-400' : goalDifference < 0 ? 'text-red-400' : 'text-slate-400'}
          />
          <StatCard value={avgGoals} label="Media Gols/Jogo" />
          <StatCard value={yellowCards} label="Cartoes Amarelos" color="text-yellow-400" />
          <StatCard value={redCards} label="Cartoes Vermelhos" color="text-red-400" />
          <StatCard value={motmCount} label="Melhor em Campo" color="text-gold-400" />
        </div>
      </div>

      {/* Cartões por Jogador */}
      {(playerYellowCards.size > 0 || playerRedCards.size > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-5 w-5 text-yellow-400" />
            <h2 className="text-base font-semibold text-white">Cartões por Jogador</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {playerYellowCards.size > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-yellow-400 mb-3 flex items-center gap-1.5">
                    <span className="inline-block w-3 h-4 bg-yellow-400 rounded-[2px]" />
                    Cartões Amarelos
                  </p>
                  <div className="space-y-2">
                    {[...playerYellowCards.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([pid, count]) => (
                        <div key={pid} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300 truncate flex-1">{rosterNameMap.get(pid) ?? '?'}</span>
                          <div className="flex items-center gap-1.5 ml-2">
                            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                              <span key={i} className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-[2px]" />
                            ))}
                            {count >= 3 && <Badge variant="destructive" className="text-[9px] px-1 py-0">Susp</Badge>}
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {playerRedCards.size > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-1.5">
                    <span className="inline-block w-3 h-4 bg-red-500 rounded-[2px]" />
                    Cartões Vermelhos
                  </p>
                  <div className="space-y-2">
                    {[...playerRedCards.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([pid, count]) => (
                        <div key={pid} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300 truncate flex-1">{rosterNameMap.get(pid) ?? '?'}</span>
                          <div className="flex items-center gap-1.5 ml-2">
                            {Array.from({ length: count }).map((_, i) => (
                              <span key={i} className="inline-block w-2.5 h-3.5 bg-red-500 rounded-[2px]" />
                            ))}
                            <Badge variant="destructive" className="text-[9px] px-1 py-0">Susp</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Elenco */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <UserCircle className="h-5 w-5 text-pitch-400" />
          <h2 className="text-base font-semibold text-white">Elenco</h2>
        </div>
        {!sortedRoster || sortedRoster.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-slate-400 text-center">Nenhum jogador vinculado a este time.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            {sortedRoster.map((pt: PlayerTeam) => {
              const positions = pt.positions?.filter(p => p !== 'Jogador') ?? []
              const isGk = positions.includes('Goleiro')
              const isSuspended = suspendedSet?.has(pt.player_id) ?? false
              const yellows = playerYellowCards.get(pt.player_id) ?? 0
              return (
                <div key={pt.id} className="flex items-center gap-3 py-3 px-4 border-b border-navy-800 last:border-0">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 relative ${isGk ? 'bg-gold-500/20 text-gold-400' : 'bg-navy-700 text-slate-300'}`}>
                    {pt.player?.name?.charAt(0) ?? '?'}
                    {pt.is_captain && (
                      <div className="absolute -top-1 -right-1 bg-gold-500 rounded-full p-0.5">
                        <Crown className="h-2.5 w-2.5 text-navy-950" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-white text-sm">{pt.player?.name}</p>
                      {pt.is_captain && <Badge variant="warning" className="text-[9px] px-1 py-0">C</Badge>}
                      {isSuspended
                        ? <Badge variant="destructive" className="text-[9px] px-1 py-0">Suspenso</Badge>
                        : <YellowCardIcons count={yellows} />
                      }
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {positions.length > 0 ? positions.map(pos => (
                      <PositionBadge key={pos} pos={pos} />
                    )) : (
                      <span className="text-xs text-slate-600">&mdash;</span>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      {/* Partidas */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-pitch-400" />
          <h2 className="text-base font-semibold text-white">Partidas</h2>
        </div>

        {(!matches || matches.length === 0) ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-slate-400 text-center">Nenhuma partida encontrada.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {finishedMatches.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Resultados</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {finishedMatches.map(match => (
                    <Link key={match.id} to={`/partidas/${match.id}/ao-vivo`} className="block">
                      <TeamMatchCard match={match} teamId={teamId!} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {scheduledMatches.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Proximos Jogos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scheduledMatches.map(match => (
                    <Link key={match.id} to={`/times/${teamId}/preparacao/${match.id}`} className="block">
                      <TeamMatchCard match={match} teamId={teamId!} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
