import { useActiveChampionship, useTopScorers } from '@/hooks/useSupabase'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TeamBadge } from '@/components/TeamBadge'
import { Target } from 'lucide-react'

function ScorersTable({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: scorers, isLoading } = useTopScorers(championship?.id, categoryId)

  const { data: teams } = useQuery({
    queryKey: ['teams_shields', championship?.id],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('id, name, shield_url').eq('championship_id', championship!.id)
      return data ?? []
    },
    enabled: !!championship?.id,
  })

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  if (!scorers || scorers.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum gol registrado nesta categoria.</div>
  }

  const teamMap = new Map(teams?.map(t => [t.id, t]) ?? [])
  const medals = ['🥇', '🥈', '🥉']

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-navy-600">
          <TableHead className="w-12 text-center">#</TableHead>
          <TableHead>Jogador</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-center">Gols</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scorers.map((scorer, idx) => {
          const team = teamMap.get(scorer.team_id)
          return (
            <TableRow key={`${scorer.player_id}-${scorer.team_id}`}>
              <TableCell className="text-center font-bold">
                {idx < 3 ? <span className="text-lg">{medals[idx]}</span> : <span className="text-slate-400">{idx + 1}</span>}
              </TableCell>
              <TableCell className="font-medium text-white">{scorer.player_name}</TableCell>
              <TableCell className="text-slate-300">
                <TeamBadge name={scorer.team_name} shieldUrl={team?.shield_url} size="sm" />
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xl font-extrabold text-gold-400">{scorer.goals}</span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function Scorers() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-7 w-7 text-gold-400" />
        <h1 className="text-2xl font-bold text-white">Artilharia</h1>
      </div>
      <CategoryTabs>
        {(categoryId) => <ScorersTable categoryId={categoryId} />}
      </CategoryTabs>
    </div>
  )
}
