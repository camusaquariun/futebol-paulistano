import { Link } from 'react-router-dom'
import { useActiveChampionship, useStandings, useTeamsByCategory, useChampionshipCategories, useTopScorers, useMatches } from '@/hooks/useSupabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart3, Target, Shield, ShieldAlert, Calendar, Clock } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Standing } from '@/types/database'

function CategoryHighlights({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: standings } = useStandings(championship?.id, categoryId)
  const { data: scorers } = useTopScorers(championship?.id, categoryId)
  const { data: matches } = useMatches(championship?.id, categoryId)

  const sorted = standings?.slice().sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference) ?? []
  const topScorer = scorers?.[0]
  const bestAttack = sorted.length > 0 ? [...sorted].sort((a, b) => b.goals_for - a.goals_for)[0] : null
  const bestDefense = sorted.length > 0 ? [...sorted].filter(t => t.matches_played > 0).sort((a, b) => a.goals_against - b.goals_against)[0] : null

  const nextMatches = matches
    ?.filter(m => m.status === 'scheduled' && m.match_date)
    .sort((a, b) => new Date(a.match_date!).getTime() - new Date(b.match_date!).getTime())
    .slice(0, 3) ?? []

  const hasData = topScorer || bestAttack?.goals_for || nextMatches.length > 0

  if (!hasData) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {/* Top scorer */}
      <Card className="bg-gradient-to-br from-gold-500/10 to-gold-600/5 border-gold-500/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3.5 w-3.5 text-gold-400" />
            <span className="text-[10px] text-gold-400 font-semibold uppercase">Artilheiro</span>
          </div>
          {topScorer ? (
            <>
              <p className="font-bold text-white text-sm truncate">{topScorer.player_name}</p>
              <p className="text-xs text-slate-400">{topScorer.team_name} · <span className="text-gold-400 font-bold">{topScorer.goals} gols</span></p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Sem gols ainda</p>
          )}
        </CardContent>
      </Card>

      {/* Best attack */}
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

      {/* Best defense */}
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

      {/* Next matches */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-[10px] text-purple-400 font-semibold uppercase">Próxima Rodada</span>
          </div>
          {nextMatches.length > 0 ? (
            <div className="space-y-1">
              {nextMatches.map(m => (
                <div key={m.id} className="text-[10px]">
                  <span className="text-white font-medium">{m.home_team?.name}</span>
                  <span className="text-slate-500"> vs </span>
                  <span className="text-white font-medium">{m.away_team?.name}</span>
                  {m.match_date && (
                    <span className="text-slate-500 ml-1 flex items-center gap-0.5 inline-flex">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(m.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      {' '}
                      {new Date(m.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sem jogos agendados</p>
          )}
        </CardContent>
      </Card>
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
    if (found) return found
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
      <CategoryHighlights categoryId={categoryId} />
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
                      const bg = teamData?.primary_color || '#1e293b'
                      const fg = teamData?.secondary_color || '#94a3b8'
                      return team.shield_url ? (
                        <img src={team.shield_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border border-white/20"
                          style={{ backgroundColor: bg, color: fg }}>
                          {team.team_name.charAt(0)}
                        </div>
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
