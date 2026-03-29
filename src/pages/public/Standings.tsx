import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveChampionship, useStandings, useTeamsByCategory, useChampionshipCategories, useTopScorers, useMatches } from '@/hooks/useSupabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart3, Target, Shield, ShieldAlert, Calendar, Clock, Star } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { TeamBadge } from '@/components/TeamBadge'
import type { Standing } from '@/types/database'

function CategoryHighlights({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: standings } = useStandings(championship?.id, categoryId)
  const { data: scorers } = useTopScorers(championship?.id, categoryId)
  const { data: matches } = useMatches(championship?.id, categoryId)

  // Top cards and donations
  const { data: topYellows } = useQuery({
    queryKey: ['top_yellows', championship?.id, categoryId],
    queryFn: async () => {
      const { data } = await supabase.from('match_events')
        .select('player_id, player:players(name), team:teams(name), match:matches!inner(championship_id, category_id)')
        .eq('event_type', 'yellow_card')
        .eq('match.championship_id', championship!.id)
        .eq('match.category_id', categoryId)
      if (!data) return []
      const counts: Record<string, { name: string; team: string; count: number }> = {}
      for (const e of data as any[]) {
        const pid = e.player_id
        if (!counts[pid]) counts[pid] = { name: e.player?.name ?? '?', team: e.team?.name ?? '?', count: 0 }
        counts[pid].count++
      }
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
    },
    enabled: !!championship?.id,
  })

  const { data: topReds } = useQuery({
    queryKey: ['top_reds', championship?.id, categoryId],
    queryFn: async () => {
      const { data } = await supabase.from('match_events')
        .select('player_id, player:players(name), team:teams(name), match:matches!inner(championship_id, category_id)')
        .eq('event_type', 'red_card')
        .eq('match.championship_id', championship!.id)
        .eq('match.category_id', categoryId)
      if (!data) return []
      const counts: Record<string, { name: string; team: string; count: number }> = {}
      for (const e of data as any[]) {
        const pid = e.player_id
        if (!counts[pid]) counts[pid] = { name: e.player?.name ?? '?', team: e.team?.name ?? '?', count: 0 }
        counts[pid].count++
      }
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
    },
    enabled: !!championship?.id,
  })

  // Top MOTM (destaque do jogo)
  const { data: topMotm } = useQuery({
    queryKey: ['top_motm', championship?.id, categoryId],
    queryFn: async () => {
      const { data } = await supabase.from('matches')
        .select('motm_player_id, motm_player:players!matches_motm_player_id_fkey(name)')
        .eq('championship_id', championship!.id)
        .eq('category_id', categoryId)
        .eq('status', 'finished')
        .not('motm_player_id', 'is', null)
      if (!data) return []
      const counts: Record<string, { name: string; count: number }> = {}
      for (const m of data as any[]) {
        const pid = m.motm_player_id
        if (!counts[pid]) counts[pid] = { name: m.motm_player?.name ?? '?', count: 0 }
        counts[pid].count++
      }
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
    },
    enabled: !!championship?.id,
  })

  // Donations calculated from cards: yellow=5kg, red=15kg
  const { data: topDonors } = useQuery({
    queryKey: ['top_donors_cards', championship?.id, categoryId],
    queryFn: async () => {
      const { data } = await supabase.from('match_events')
        .select('player_id, event_type, player:players(name), match:matches!inner(championship_id, category_id)')
        .in('event_type', ['yellow_card', 'red_card'])
        .eq('match.championship_id', championship!.id)
        .eq('match.category_id', categoryId)
      if (!data) return []
      const totals: Record<string, { name: string; kg: number }> = {}
      for (const e of data as any[]) {
        const pid = e.player_id
        if (!totals[pid]) totals[pid] = { name: e.player?.name ?? '?', kg: 0 }
        totals[pid].kg += e.event_type === 'yellow_card' ? 5 : 15
      }
      return Object.values(totals).sort((a, b) => b.kg - a.kg).slice(0, 5)
    },
    enabled: !!championship?.id,
  })

  const sorted = standings?.slice().sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference) ?? []
  const top5Scorers = scorers?.slice(0, 5) ?? []
  const bestAttack = sorted.length > 0 ? [...sorted].sort((a, b) => b.goals_for - a.goals_for)[0] : null
  const bestDefense = sorted.length > 0 ? [...sorted].filter(t => t.matches_played > 0).sort((a, b) => a.goals_against - b.goals_against)[0] : null

  const nextMatches = matches
    ?.filter(m => m.status === 'scheduled' && m.match_date)
    .sort((a, b) => new Date(a.match_date!).getTime() - new Date(b.match_date!).getTime())
    .slice(0, 6) ?? []

  const finishedMatches = matches
    ?.filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.match_date ?? 0).getTime() - new Date(a.match_date ?? 0).getTime()) ?? []

  const hasData = top5Scorers.length > 0 || bestAttack?.goals_for || nextMatches.length > 0 || finishedMatches.length > 0

  if (!hasData) return null

  return (
    <div className="space-y-3 mb-4">
      {/* Row 1: Top Destaques + Top Artilheiros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {topMotm && topMotm.length > 0 && (
          <Card className="bg-gradient-to-br from-amber-500/5 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] text-amber-400 font-semibold uppercase">Top Destaques</span>
              </div>
              <div className="space-y-1">
                {topMotm.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate">{i + 1}. {p.name}</span>
                    <span className="text-amber-400 font-bold flex-shrink-0 ml-1">{p.count}⭐</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {top5Scorers.length > 0 && (
          <Card className="bg-gradient-to-br from-gold-500/5 to-gold-600/5 border-gold-500/20">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-gold-400" />
                <span className="text-[10px] text-gold-400 font-semibold uppercase">Top Artilheiros</span>
              </div>
              <div className="space-y-1">
                {top5Scorers.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate">{i + 1}. {s.player_name}</span>
                    <span className="text-gold-400 font-bold flex-shrink-0 ml-1">{s.goals}⚽</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 2: Melhor Ataque + Melhor Defesa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-pitch-500/10 to-pitch-600/5 border-pitch-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="h-3.5 w-3.5 text-pitch-400" />
              <span className="text-[10px] text-pitch-400 font-semibold uppercase">Melhor Ataque</span>
            </div>
            {bestAttack && bestAttack.goals_for > 0 ? (
              <>
                <p className="font-bold text-white text-sm truncate">{bestAttack.team_name}</p>
                <p className="text-xs text-slate-400"><span className="text-pitch-400 font-bold">{bestAttack.goals_for} gols</span> marcados</p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Sem dados</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldAlert className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] text-blue-400 font-semibold uppercase">Melhor Defesa</span>
            </div>
            {bestDefense ? (
              <>
                <p className="font-bold text-white text-sm truncate">{bestDefense.team_name}</p>
                <p className="text-xs text-slate-400"><span className="text-blue-400 font-bold">{bestDefense.goals_against} gols</span> sofridos</p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Cartões + Doações */}
      {((topYellows && topYellows.length > 0) || (topReds && topReds.length > 0) || (topDonors && topDonors.length > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topYellows && topYellows.length > 0 && (
            <Card className="bg-gradient-to-br from-yellow-500/5 to-yellow-600/5 border-yellow-500/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">🟨</span>
                  <span className="text-[10px] text-yellow-400 font-semibold uppercase">Top Cartões Amarelos</span>
                </div>
                <div className="space-y-1">
                  {topYellows.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate">{i + 1}. {p.name}</span>
                      <span className="text-yellow-400 font-bold">{p.count}🟨</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {topReds && topReds.length > 0 && (
            <Card className="bg-gradient-to-br from-red-500/5 to-red-600/5 border-red-500/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">🟥</span>
                  <span className="text-[10px] text-red-400 font-semibold uppercase">Top Cartões Vermelhos</span>
                </div>
                <div className="space-y-1">
                  {topReds.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate">{i + 1}. {p.name}</span>
                      <span className="text-red-400 font-bold">{p.count}🟥</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {topDonors && topDonors.length > 0 && (
            <Card className="bg-gradient-to-br from-orange-500/5 to-orange-600/5 border-orange-500/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">🥫</span>
                  <span className="text-[10px] text-orange-400 font-semibold uppercase">Maior Doador de Alimentos</span>
                </div>
                <div className="space-y-1">
                  {topDonors.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate">{i + 1}. {p.name}</span>
                      <span className="text-orange-400 font-bold">{p.kg}kg</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Row 4: Próxima Rodada (full width) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-purple-400" />
          <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider">Próxima Rodada</span>
        </div>
        {nextMatches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nextMatches.map(m => (
              <Link key={m.id} to={`/partidas/${m.id}/ao-vivo`}>
                <Card className="bg-[#0f1a2e] border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer hover:ring-1 hover:ring-purple-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamBadge name={m.home_team?.name} shieldUrl={m.home_team?.shield_url} size="sm" />
                        <span className="text-sm font-semibold text-white truncate">{m.home_team?.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-500 flex-shrink-0">VS</span>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-sm font-semibold text-white truncate">{m.away_team?.name}</span>
                        <TeamBadge name={m.away_team?.name} shieldUrl={m.away_team?.shield_url} size="sm" />
                      </div>
                    </div>
                    {m.match_date && (
                      <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(m.match_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        {' '}
                        {new Date(m.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {m.location && (
                      <p className="text-[10px] text-slate-500 text-center mt-1 truncate">{m.location}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Sem jogos agendados</p>
        )}
      </div>

      {/* Row 5: Resultados (finished matches) */}
      {finishedMatches.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Resultados</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {finishedMatches.map(m => (
              <Link key={m.id} to={`/partidas/${m.id}/ao-vivo`}>
                <Card className="bg-[#0f1a2e] border-slate-700/50 hover:border-pitch-500/50 transition-all cursor-pointer hover:ring-1 hover:ring-pitch-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamBadge name={m.home_team?.name} shieldUrl={m.home_team?.shield_url} size="sm" />
                        <span className="text-sm font-semibold text-white truncate">{m.home_team?.name}</span>
                      </div>
                      <div className="flex-shrink-0 text-center">
                        <span className="text-lg font-extrabold text-gold-400">{m.home_score} <span className="text-slate-500">×</span> {m.away_score}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-sm font-semibold text-white truncate">{m.away_team?.name}</span>
                        <TeamBadge name={m.away_team?.name} shieldUrl={m.away_team?.shield_url} size="sm" />
                      </div>
                    </div>
                    {m.match_date && (
                      <p className="text-[10px] text-slate-500 text-center mt-2">
                        {new Date(m.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StandingsTable({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: standings, isLoading: loadingStandings } = useStandings(championship?.id, categoryId)
  const { data: teams, isLoading: loadingTeams } = useTeamsByCategory(championship?.id, categoryId)
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const catConfig = champCategories?.find((cc: any) => cc.category_id === categoryId)

  if (loadingStandings || loadingTeams) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  if (!teams || teams.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum time cadastrado nesta categoria.</div>
  }

  // Merge: all teams with standings data (fill zeros for teams without finished matches)
  const merged: Standing[] = teams.map(team => {
    const found = standings?.find(s => s.team_id === team.id)
    if (found) return { ...found, shield_url: team.shield_url ?? found.shield_url }
    return {
      championship_id: championship!.id,
      category_id: categoryId,
      team_id: team.id,
      team_name: team.name,
      shield_url: team.shield_url,
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      yellow_cards: 0,
      red_cards: 0,
    }
  })

  // Sort by tiebreaker rules
  merged.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for
    if (a.yellow_cards !== b.yellow_cards) return a.yellow_cards - b.yellow_cards
    return a.red_cards - b.red_cards
  })

  const medals = ['🥇', '🥈', '🥉']
  const totalTeams = merged.length
  const qualifyCount = (catConfig as any)?.qualify_count ?? (totalTeams >= 6 ? 4 : totalTeams >= 4 ? Math.min(4, totalTeams) : totalTeams)
  const turns = (catConfig as any)?.turns ?? 1

  return (
    <div>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-navy-600 bg-navy-900/50">
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="text-center font-bold">P</TableHead>
            <TableHead className="text-center">J</TableHead>
            <TableHead className="text-center">V</TableHead>
            <TableHead className="text-center">E</TableHead>
            <TableHead className="text-center">D</TableHead>
            <TableHead className="text-center">GP</TableHead>
            <TableHead className="text-center">GC</TableHead>
            <TableHead className="text-center">SG</TableHead>
            <TableHead className="text-center hidden sm:table-cell">CA</TableHead>
            <TableHead className="text-center hidden sm:table-cell">CV</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {merged.map((team, idx) => {
            const qualified = idx < qualifyCount && team.matches_played > 0
            const isLast = idx === merged.length - 1 && merged.length > 1
            return (
              <TableRow
                key={team.team_id}
                className={
                  isLast
                    ? 'bg-red-600/8 border-l-2 border-l-red-500'
                    : qualified
                    ? 'bg-pitch-600/5 border-l-2 border-l-pitch-500'
                    : idx % 2 === 0
                    ? 'bg-navy-900/30'
                    : ''
                }
              >
                <TableCell className="text-center font-bold">
                  {idx < 3 && team.matches_played > 0 ? (
                    <span className="text-lg">{medals[idx]}</span>
                  ) : (
                    <span className="text-slate-400">{idx + 1}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const teamData = teams?.find(t => t.id === team.team_id)
                      return (
                        <TeamBadge
                          name={team.team_name}
                          shieldUrl={teamData?.shield_url ?? team.shield_url}
                          primaryColor={teamData?.primary_color}
                          secondaryColor={teamData?.secondary_color}
                          size="sm"
                        />
                      )
                    })()}
                    <Link to={`/times/${team.team_id}`} className="font-semibold text-white hover:text-pitch-400 transition-colors">{team.team_name}</Link>
                    {qualified && <Badge variant="default" className="ml-1 text-[10px] px-1.5 py-0">Classificado</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-center font-extrabold text-lg text-gold-400">{team.points}</TableCell>
                <TableCell className="text-center text-slate-300">{team.matches_played}</TableCell>
                <TableCell className="text-center text-pitch-400 font-medium">{team.wins}</TableCell>
                <TableCell className="text-center text-slate-300">{team.draws}</TableCell>
                <TableCell className="text-center text-red-400 font-medium">{team.losses}</TableCell>
                <TableCell className="text-center text-slate-300">{team.goals_for}</TableCell>
                <TableCell className="text-center text-slate-300">{team.goals_against}</TableCell>
                <TableCell className="text-center font-semibold">
                  <span className={team.goal_difference > 0 ? 'text-pitch-400' : team.goal_difference < 0 ? 'text-red-400' : 'text-slate-400'}>
                    {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                  </span>
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  <span className="text-yellow-400">{team.yellow_cards}</span>
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  <span className="text-red-400">{team.red_cards}</span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex items-center gap-3 mt-3 px-2 text-xs">
        <span className="text-pitch-400 font-medium">
          {turns === 2 ? 'Ida e volta' : 'Turno único'} · {qualifyCount} classificam
        </span>
      </div>
      <div className="flex items-center gap-4 mt-1 px-2 text-xs text-slate-500">
        <span>P = Pontos</span>
        <span>J = Jogos</span>
        <span>V = Vitórias</span>
        <span>E = Empates</span>
        <span>D = Derrotas</span>
        <span>GP = Gols Pró</span>
        <span>GC = Gols Contra</span>
        <span>SG = Saldo de Gols</span>
        <span className="hidden sm:inline">CA = Cartões Amarelos</span>
        <span className="hidden sm:inline">CV = Cartões Vermelhos</span>
      </div>
      </div>
      <CategoryHighlights categoryId={categoryId} />
    </div>
  )
}

export default function Standings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-pitch-400" />
        <h1 className="text-2xl font-bold text-white">Classificação</h1>
      </div>
      <CategoryTabs>
        {(categoryId) => <StandingsTable categoryId={categoryId} />}
      </CategoryTabs>
    </div>
  )
}
