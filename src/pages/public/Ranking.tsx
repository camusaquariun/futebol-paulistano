import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveChampionship, useTopScorers } from '@/hooks/useSupabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamBadge } from '@/components/TeamBadge'
import { Trophy, Target, Star } from 'lucide-react'

const TOP_N = 20
const medals = ['🥇', '🥈', '🥉']

type Row = {
  player_id: string
  player_name: string
  team_id?: string | null
  team_name?: string | null
  value: number
}

function useTeamShields(championshipId?: string) {
  return useQuery({
    queryKey: ['teams_shields_for_ranking', championshipId],
    queryFn: async () => {
      const { data } = await supabase
        .from('teams')
        .select('id, name, shield_url')
        .eq('championship_id', championshipId!)
      return new Map((data ?? []).map(t => [t.id, t]))
    },
    enabled: !!championshipId,
  })
}

function useYellow(championshipId?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['rank_yellow', championshipId, categoryId],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('player_yellow_counts')
        .select('player_id, player_name, team_id, yellow_count')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
        .order('yellow_count', { ascending: false })
        .limit(TOP_N)
      return (data ?? []).map(r => ({
        player_id: r.player_id, player_name: r.player_name,
        team_id: r.team_id, value: r.yellow_count,
      }))
    },
    enabled: !!championshipId && !!categoryId,
  })
}

function useRed(championshipId?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['rank_red', championshipId, categoryId],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('player_red_counts')
        .select('player_id, player_name, team_id, team_name, red_count')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
        .order('red_count', { ascending: false })
        .limit(TOP_N)
      return (data ?? []).map(r => ({
        player_id: r.player_id, player_name: r.player_name,
        team_id: r.team_id, team_name: r.team_name, value: r.red_count,
      }))
    },
    enabled: !!championshipId && !!categoryId,
  })
}

function useOwnGoals(championshipId?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['rank_own_goals', championshipId, categoryId],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('player_own_goal_counts')
        .select('player_id, player_name, team_id, team_name, own_goals')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
        .order('own_goals', { ascending: false })
        .limit(10)
      return (data ?? []).map(r => ({
        player_id: r.player_id, player_name: r.player_name,
        team_id: r.team_id, team_name: r.team_name, value: r.own_goals,
      }))
    },
    enabled: !!championshipId && !!categoryId,
  })
}

function useMotm(championshipId?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['rank_motm', championshipId, categoryId],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('player_motm_counts')
        .select('player_id, player_name, team_id, team_name, motm_count')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
        .order('motm_count', { ascending: false })
        .limit(TOP_N)
      return (data ?? []).map(r => ({
        player_id: r.player_id, player_name: r.player_name,
        team_id: r.team_id, team_name: r.team_name, value: r.motm_count,
      }))
    },
    enabled: !!championshipId && !!categoryId,
  })
}

function RankCard({
  title, icon, accent, rows, unit, teamShields,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  rows: Row[] | undefined
  unit: string
  teamShields: Map<string, { id: string; name: string; shield_url: string | null }> | undefined
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={accent}>{icon}</span>
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!rows ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">Sem dados ainda.</div>
        ) : (
          <ol className="divide-y divide-navy-800">
            {rows.map((r, idx) => {
              const team = r.team_id ? teamShields?.get(r.team_id) : undefined
              return (
                <li key={`${r.player_id}-${r.team_id ?? ''}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-7 text-center font-bold text-sm flex-shrink-0">
                    {idx < 3 ? <span className="text-lg">{medals[idx]}</span> : <span className="text-slate-400">{idx + 1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{r.player_name}</p>
                    {(team || r.team_name) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <TeamBadge name={team?.name ?? r.team_name ?? '—'} shieldUrl={team?.shield_url} size="sm" showName={false} />
                        <span className="text-xs text-slate-400 truncate">{team?.name ?? r.team_name}</span>
                      </div>
                    )}
                  </div>
                  <span className={`text-lg font-extrabold ${accent} flex-shrink-0`}>{r.value}</span>
                  <span className="text-[10px] text-slate-500 -ml-1.5 flex-shrink-0">{unit}</span>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function RankingPanel({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: shields } = useTeamShields(championship?.id)
  const { data: scorers } = useTopScorers(championship?.id, categoryId)
  const { data: yellow } = useYellow(championship?.id, categoryId)
  const { data: red } = useRed(championship?.id, categoryId)
  const { data: motm } = useMotm(championship?.id, categoryId)
  const { data: ownGoals } = useOwnGoals(championship?.id, categoryId)

  const scorerRows: Row[] | undefined = scorers?.slice(0, TOP_N).map(s => ({
    player_id: s.player_id, player_name: s.player_name,
    team_id: s.team_id, team_name: s.team_name, value: s.goals,
  }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <RankCard title="Artilharia" icon={<Target className="h-5 w-5" />} accent="text-gold-400"
                rows={scorerRows} unit="gols" teamShields={shields} />
      <RankCard title="Melhor em Campo" icon={<Star className="h-5 w-5" />} accent="text-pitch-400"
                rows={motm} unit="MOTM" teamShields={shields} />
      <RankCard title="Cartões Amarelos" icon={<span className="inline-block w-4 h-5 bg-yellow-400 rounded-sm" />} accent="text-yellow-400"
                rows={yellow} unit="amar." teamShields={shields} />
      <RankCard title="Cartões Vermelhos" icon={<span className="inline-block w-4 h-5 bg-red-500 rounded-sm" />} accent="text-red-400"
                rows={red} unit="verm." teamShields={shields} />
      <RankCard title="Gols Contra (Top 10)" icon={<Target className="h-5 w-5 rotate-180" />} accent="text-orange-400"
                rows={ownGoals} unit="G.C." teamShields={shields} />
    </div>
  )
}

export default function Ranking() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Ranking</h1>
          <p className="text-sm text-slate-400">Top {TOP_N} de cada categoria</p>
        </div>
      </div>
      <CategoryTabs>
        {(categoryId) => <RankingPanel categoryId={categoryId} />}
      </CategoryTabs>
    </div>
  )
}
