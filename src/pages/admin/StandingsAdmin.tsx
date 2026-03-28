import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { useStandings, useTeamsByCategory, useCategories, useChampionshipCategories } from '@/hooks/useSupabase'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { BarChart3 } from 'lucide-react'
import type { Standing } from '@/types/database'

function CategoryStandings({ championshipId, categoryId }: { championshipId: string; categoryId: string }) {
  const { data: standings, isLoading: loadingStandings } = useStandings(championshipId, categoryId)
  const { data: teams, isLoading: loadingTeams } = useTeamsByCategory(championshipId, categoryId)

  if (loadingStandings || loadingTeams) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  if (!teams || teams.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum time cadastrado nesta categoria.</div>
  }

  const merged: Standing[] = teams.map(team => {
    const found = standings?.find(s => s.team_id === team.id)
    if (found) return found
    return {
      championship_id: championshipId,
      category_id: categoryId,
      team_id: team.id,
      team_name: team.name,
      shield_url: team.shield_url,
      matches_played: 0, wins: 0, draws: 0, losses: 0,
      goals_for: 0, goals_against: 0, goal_difference: 0, points: 0,
      yellow_cards: 0, red_cards: 0,
    }
  })

  merged.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for
    if (a.yellow_cards !== b.yellow_cards) return a.yellow_cards - b.yellow_cards
    return a.red_cards - b.red_cards
  })

  const medals = ['🥇', '🥈', '🥉']

  return (
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
            <TableHead className="text-center">CA</TableHead>
            <TableHead className="text-center">CV</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {merged.map((team, idx) => {
            const qualified = idx < 4 && team.matches_played > 0
            return (
              <TableRow
                key={team.team_id}
                className={qualified ? 'bg-pitch-600/5 border-l-2 border-l-pitch-500' : idx % 2 === 0 ? 'bg-navy-900/30' : ''}
              >
                <TableCell className="text-center font-bold">
                  {idx < 3 && team.matches_played > 0 ? <span className="text-lg">{medals[idx]}</span> : <span className="text-slate-400">{idx + 1}</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {team.shield_url ? (
                      <img src={team.shield_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-navy-700 flex items-center justify-center text-xs text-slate-400 font-bold">
                        {team.team_name.charAt(0)}
                      </div>
                    )}
                    <span className="font-semibold text-white">{team.team_name}</span>
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
                <TableCell className="text-center"><span className="text-yellow-400">{team.yellow_cards}</span></TableCell>
                <TableCell className="text-center"><span className="text-red-400">{team.red_cards}</span></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function StandingsAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Selecione um campeonato no menu lateral.</div>
  }

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-pitch-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Classificação</h1>
          {championship && <p className="text-sm text-slate-400">{championship.name} — {championship.season_year}</p>}
        </div>
      </div>

      {activeCategories.length === 0 ? (
        <div className="text-center py-8 text-slate-400">Nenhuma categoria neste campeonato.</div>
      ) : (
        <Tabs defaultValue={activeCategories[0]?.id}>
          <TabsList className="mb-4">
            {activeCategories.map(cat => (
              <TabsTrigger key={cat.id} value={cat.id} className="min-w-[100px]">{cat.name}</TabsTrigger>
            ))}
          </TabsList>
          {activeCategories.map(cat => (
            <TabsContent key={cat.id} value={cat.id}>
              <CategoryStandings championshipId={championshipId} categoryId={cat.id} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
