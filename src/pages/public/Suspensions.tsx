import { useActiveChampionship, useSuspensions } from '@/hooks/useSupabase'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamBadge } from '@/components/TeamBadge'
import { ShieldAlert } from 'lucide-react'
import { reasonLabel } from '@/lib/utils'

function SuspensionsList({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: suspensions, isLoading } = useSuspensions(championship?.id, categoryId)

  // Fetch player_teams to get team info for each suspended player
  const { data: playerTeams } = useQuery({
    queryKey: ['player_teams_suspensions', championship?.id, categoryId],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_teams')
        .select('player_id, team:teams(id, name, shield_url)')
        .eq('category_id', categoryId)
      return data ?? []
    },
    enabled: !!championship?.id && !!categoryId,
  })

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  const activeSuspensions = suspensions?.filter(s => !s.served) ?? []

  if (activeSuspensions.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum jogador suspenso nesta categoria.</div>
  }

  const playerTeamMap = new Map(playerTeams?.map(pt => [pt.player_id, pt.team as any]) ?? [])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {activeSuspensions.map(s => {
        const team = playerTeamMap.get(s.player_id)
        return (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {team && (
                  <TeamBadge name={team.name} shieldUrl={team.shield_url} size="md" showName={false} />
                )}
                <div>
                  <p className="font-bold text-white">{s.player?.name}</p>
                  <p className="text-xs text-slate-400">{team?.name}</p>
                  <p className="text-sm text-slate-400">Motivo: {reasonLabel(s.reason)}</p>
                </div>
              </div>
              <Badge variant="destructive">Suspenso</Badge>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function Suspensions() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-red-400" />
        <h1 className="text-2xl font-bold text-white">Suspensões</h1>
      </div>
      <CategoryTabs>
        {(categoryId) => <SuspensionsList categoryId={categoryId} />}
      </CategoryTabs>
    </div>
  )
}
