import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayer, useMyTeams, useActiveChampionship } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, Clock, MapPin, Trophy } from 'lucide-react'
import { TeamBadge } from '@/components/TeamBadge'
import { phaseLabel } from '@/lib/utils'

export default function MyGames() {
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: myTeamLinks } = useMyTeams(myPlayer?.id)

  const links = (myTeamLinks ?? []).filter((l: any) => l.team?.championship?.id === championship?.id)
  // (team_id, category_id) pairs where the user plays
  const pairs = links.map((l: any) => ({
    teamId: l.team_id as string,
    categoryId: l.category_id as string,
    teamName: l.team?.name as string,
    categoryName: l.category?.name as string,
    primaryColor: l.team?.primary_color,
    secondaryColor: l.team?.secondary_color,
    shieldUrl: l.team?.shield_url,
  }))

  const teamIds = [...new Set(pairs.map(p => p.teamId))]

  const { data: matches } = useQuery({
    queryKey: ['my_games', championship?.id, teamIds.join(',')],
    queryFn: async () => {
      if (!championship?.id || teamIds.length === 0) return []
      const inList = teamIds.join(',')
      const { data } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*)')
        .eq('championship_id', championship.id)
        .eq('is_test', false)
        .or(`home_team_id.in.(${inList}),away_team_id.in.(${inList})`)
      return data ?? []
    },
    enabled: !!championship?.id && teamIds.length > 0,
  })

  const sorted = useMemo(() => {
    if (!matches) return []
    // Only include the (match, viewer team) combination — a match shows once per team the user plays for.
    const rows: { match: any; pair: typeof pairs[number] }[] = []
    for (const m of matches) {
      for (const p of pairs) {
        if (p.categoryId !== m.category_id) continue
        if (m.home_team_id === p.teamId || m.away_team_id === p.teamId) {
          rows.push({ match: m, pair: p })
        }
      }
    }
    // Sort by date asc, nulls last
    rows.sort((a, b) => {
      const da = a.match.match_date ? new Date(a.match.match_date).getTime() : Infinity
      const db = b.match.match_date ? new Date(b.match.match_date).getTime() : Infinity
      return da - db
    })
    return rows
  }, [matches, pairs])

  const upcoming = sorted.filter(r => r.match.status === 'scheduled')
  const past = sorted.filter(r => r.match.status === 'finished')

  if (!user) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Faça <Link to="/login" className="text-pitch-400 hover:underline">login</Link> para ver seus jogos.</p>
      </div>
    )
  }

  if (!myPlayer) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Você ainda não está vinculado a nenhum jogador. Peça ao administrador para fazer o vínculo.</p>
      </div>
    )
  }

  if (pairs.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Você não está inscrito em nenhum time do campeonato atual.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-pitch-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Jogos</h1>
          <p className="text-sm text-slate-400">
            Todas as partidas em {pairs.length} {pairs.length === 1 ? 'time' : 'times'}
            {' '}({pairs.map(p => `${p.teamName} (${p.categoryName})`).join(', ')})
          </p>
        </div>
      </div>

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-pitch-400 mb-3">
            Próximos jogos ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.map(({ match, pair }) => <GameRow key={pair.teamId + '_' + match.id} match={match} pair={pair} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Jogos disputados ({past.length})
          </h2>
          <div className="space-y-2">
            {past.map(({ match, pair }) => <GameRow key={pair.teamId + '_' + match.id} match={match} pair={pair} />)}
          </div>
        </section>
      )}

      {sorted.length === 0 && (
        <p className="text-center py-12 text-slate-500">Nenhuma partida agendada ainda.</p>
      )}
    </div>
  )
}

function GameRow({ match, pair }: { match: any; pair: any }) {
  const isHome = match.home_team_id === pair.teamId
  const myTeam = isHome ? match.home_team : match.away_team
  const opponent = isHome ? match.away_team : match.home_team
  const isFinished = match.status === 'finished'
  const myScore = isHome ? match.home_score : match.away_score
  const oppScore = isHome ? match.away_score : match.home_score
  const result = isFinished && myScore != null && oppScore != null
    ? myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E'
    : null
  const date = match.match_date
    ? new Date(match.match_date).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'Data a definir'

  return (
    <Link to={isFinished ? `/partidas/${match.id}/ao-vivo` : `/meu-time/preparo/${match.id}`}>
      <Card className={`card-hover ${result === 'V' ? 'border-l-2 border-l-pitch-500'
        : result === 'D' ? 'border-l-2 border-l-red-500'
        : result === 'E' ? 'border-l-2 border-l-yellow-500'
        : 'border-l-2 border-l-slate-700'}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{pair.categoryName}</Badge>
            <Badge variant="outline" className="text-[10px]">{phaseLabel(match.phase)}</Badge>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3 w-3" />{date}
            </div>
            {match.location && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3" />{match.location}
              </div>
            )}
            {isFinished && (
              <Badge className={result === 'V' ? 'bg-pitch-600 text-white text-[10px]'
                : result === 'D' ? 'bg-red-600 text-white text-[10px]'
                : 'bg-yellow-600 text-navy-950 text-[10px]'}>
                {result === 'V' ? 'Vitória' : result === 'D' ? 'Derrota' : 'Empate'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="font-semibold text-white text-sm truncate">{myTeam?.name}</span>
              <TeamBadge name={myTeam?.name} shieldUrl={myTeam?.shield_url} primaryColor={myTeam?.primary_color} secondaryColor={myTeam?.secondary_color} size="sm" />
            </div>
            {isFinished ? (
              <div className="text-xl font-extrabold text-white whitespace-nowrap">
                {myScore} <span className="text-slate-500 font-normal">×</span> {oppScore}
              </div>
            ) : (
              <span className="text-slate-500 text-sm">vs</span>
            )}
            <div className="flex items-center gap-2 flex-1">
              <TeamBadge name={opponent?.name} shieldUrl={opponent?.shield_url} primaryColor={opponent?.primary_color} secondaryColor={opponent?.secondary_color} size="sm" />
              <span className="font-semibold text-white text-sm truncate">{opponent?.name}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
