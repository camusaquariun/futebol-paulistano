import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { useMatches, usePoolMatchBets, usePoolSeasonBets } from '@/hooks/useSupabase'
import { buildLeaderboard, calculateMatchPoints, POINT_TIER_LABELS } from '@/lib/pool-points'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trophy, Crown, Medal, ChevronDown, ChevronUp, Users, Link2, Activity, Film, Target, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { PoolMatchBet } from '@/types/database'

type TabId = 'classificacao' | 'apostas' | 'todas' | 'participantes'

const TIER_COLOR: Record<number, string> = {
  15: 'bg-pitch-500/20 text-pitch-400 border-pitch-500/30',
  10: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  8: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  6: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  5: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  2: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  0: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function PoolAdmin() {
  const { selectedId: championshipId } = useAdminChampionship()
  const [tab, setTab] = useState<TabId>('classificacao')
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { data: matches } = useMatches(championshipId)
  const { data: matchBets } = usePoolMatchBets(championshipId)
  const { data: seasonBets } = usePoolSeasonBets(championshipId)

  // Auth users (for display_name)
  const { data: authUsers } = useQuery({
    queryKey: ['auth_users'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-users' }),
      })
      const d = await res.json()
      return (d.users ?? []) as { id: string; email: string; display_name: string | null }[]
    },
  })
  const userById = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>()
    for (const u of authUsers ?? []) m.set(u.id, { name: u.display_name || u.email, email: u.email })
    return m
  }, [authUsers])

  // Filters / pagination for "Todas as Apostas"
  const [feedSearch, setFeedSearch] = useState('')
  const [feedPage, setFeedPage] = useState(0)
  const FEED_PAGE_SIZE = 50

  // Realtime: invalidate bet queries whenever a row changes
  useEffect(() => {
    if (!championshipId) return
    const ch = supabase
      .channel('pool-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_match_bets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pool_match_bets'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_season_bets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pool_season_bets'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [championshipId, queryClient])

  // Players with linked user accounts in this championship
  const { data: linkedPlayers } = useQuery({
    queryKey: ['pool_linked_players', championshipId],
    queryFn: async () => {
      const { data: teams } = await supabase.from('teams').select('id').eq('championship_id', championshipId!)
      if (!teams || teams.length === 0) return []
      const teamIds = teams.map(t => t.id)
      const { data } = await supabase
        .from('player_teams')
        .select('player:players!player_teams_player_id_fkey(id, name, photo_url, user_id), team:teams(name, shield_url)')
        .in('team_id', teamIds)
      if (!data) return []
      // Deduplicate by player id
      const seen = new Set<string>()
      const out: { player: any; team: any }[] = []
      for (const pt of data as any[]) {
        if (!seen.has(pt.player.id)) {
          seen.add(pt.player.id)
          out.push(pt)
        }
      }
      return out
    },
    enabled: !!championshipId,
  })

  const leaderboard = useMemo(() => buildLeaderboard(matchBets ?? [], seasonBets ?? []), [matchBets, seasonBets])

  // Group bets by match
  const betsByMatch = useMemo(() => {
    const map = new Map<string, PoolMatchBet[]>()
    for (const bet of matchBets ?? []) {
      if (!map.has(bet.match_id)) map.set(bet.match_id, [])
      map.get(bet.match_id)!.push(bet)
    }
    return map
  }, [matchBets])

  // Finished matches sorted by date desc
  const finishedMatches = useMemo(() =>
    (matches ?? [])
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(b.match_date ?? 0).getTime() - new Date(a.match_date ?? 0).getTime()),
    [matches]
  )

  // Participants: unique users from bets, enriched with player link
  const participants = useMemo(() => {
    const userMap = new Map<string, { email: string; bets: number; points: number }>()
    for (const bet of matchBets ?? []) {
      if (!userMap.has(bet.user_id)) userMap.set(bet.user_id, { email: bet.user_email, bets: 0, points: 0 })
      const e = userMap.get(bet.user_id)!
      e.bets++
      e.points += bet.points ?? 0
    }
    return Array.from(userMap.entries())
      .map(([userId, data]) => ({
        userId,
        ...data,
        player: linkedPlayers?.find(lp => lp.player?.user_id === userId)?.player ?? null,
        team: linkedPlayers?.find(lp => lp.player?.user_id === userId)?.team ?? null,
      }))
      .sort((a, b) => b.points - a.points)
  }, [matchBets, linkedPlayers])

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Selecione um campeonato no menu lateral.</div>
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'classificacao', label: 'Classificação' },
    { id: 'apostas', label: 'Apostas por Partida' },
    { id: 'todas', label: 'Todas as Apostas' },
    { id: 'participantes', label: 'Participantes' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-gold-400" />
        <h1 className="text-2xl font-bold text-white">Bolão</h1>
        <Badge variant="secondary">{leaderboard.length} participantes</Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-800/50 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-navy-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CLASSIFICAÇÃO ── */}
      {tab === 'classificacao' && (
        <Card>
          <CardContent className="p-0">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-12">Nenhuma aposta computada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-xs">#</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-xs">Participante</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs">Pts</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden sm:table-cell" title="Placar Exato (15)">PE</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden sm:table-cell" title="Venc+Gols Venc (10)">VG</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Venc+Gols Perd (8)">VP</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Venc+Saldo (6)">VS</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Apenas Venc (5)">AV</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs">Apostas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, idx) => {
                      const rank = idx + 1
                      const linkedPlayer = linkedPlayers?.find(lp => lp.player?.user_id === entry.userId)?.player
                      return (
                        <tr key={entry.userId} className="border-b border-navy-800/50 hover:bg-navy-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {rank === 1 && <Crown className="h-4 w-4 text-gold-400" />}
                              {rank === 2 && <Medal className="h-4 w-4 text-slate-300" />}
                              {rank === 3 && <Medal className="h-4 w-4 text-amber-700" />}
                              <span className={`font-bold ${rank === 1 ? 'text-gold-400' : rank <= 3 ? 'text-amber-400' : 'text-slate-500'}`}>
                                {rank}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {linkedPlayer?.photo_url ? (
                                <img src={linkedPlayer.photo_url} className="h-6 w-6 rounded-full object-cover" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-navy-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                  {(linkedPlayer?.name ?? entry.email).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-white truncate max-w-[180px]">
                                  {linkedPlayer?.name ?? entry.email.split('@')[0]}
                                </p>
                                {linkedPlayer && (
                                  <p className="text-[10px] text-slate-500">{entry.email.split('@')[0]}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-bold text-base ${rank === 1 ? 'text-gold-400' : rank <= 3 ? 'text-amber-400' : 'text-white'}`}>
                              {entry.totalPoints}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center hidden sm:table-cell text-slate-300">{entry.tierCounts[15] || '–'}</td>
                          <td className="py-3 px-4 text-center hidden sm:table-cell text-slate-300">{entry.tierCounts[10] || '–'}</td>
                          <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[8] || '–'}</td>
                          <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[6] || '–'}</td>
                          <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[5] || '–'}</td>
                          <td className="py-3 px-4 text-center text-slate-400">{entry.totalBets}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── APOSTAS POR PARTIDA ── */}
      {tab === 'apostas' && (
        <div className="space-y-2">
          {finishedMatches.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-12">Nenhuma partida encerrada ainda.</p>
          )}
          {finishedMatches.map(m => {
            const bets = betsByMatch.get(m.id) ?? []
            const isExpanded = expandedMatch === m.id
            const betsSorted = [...bets].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

            return (
              <Card key={m.id} className="overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-navy-800/40 transition-colors"
                  onClick={() => setExpandedMatch(isExpanded ? null : m.id)}
                >
                  {/* Teams + score */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      {m.home_team?.shield_url && <img src={m.home_team.shield_url} className="h-4 w-4 rounded-full object-cover" />}
                      <span className="font-medium text-white">{m.home_team?.name}</span>
                      <span className="font-bold text-white px-1">{m.home_score} × {m.away_score}</span>
                      <span className="font-medium text-white">{m.away_team?.name}</span>
                      {m.away_team?.shield_url && <img src={m.away_team.shield_url} className="h-4 w-4 rounded-full object-cover" />}
                    </div>
                    {m.match_date && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{formatDate(m.match_date)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="secondary" className="text-[10px]">{bets.length} aposta{bets.length !== 1 ? 's' : ''}</Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-navy-700">
                    {bets.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Nenhuma aposta nesta partida.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-navy-800">
                            <th className="text-left py-2 px-4 text-xs text-slate-500 font-medium">Participante</th>
                            <th className="text-center py-2 px-4 text-xs text-slate-500 font-medium">Aposta</th>
                            <th className="text-center py-2 px-4 text-xs text-slate-500 font-medium">Pontos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {betsSorted.map(bet => {
                            const pts = bet.points ?? (m.home_score != null && m.away_score != null
                              ? calculateMatchPoints(bet.home_score, bet.away_score, m.home_score!, m.away_score!)
                              : null)
                            const linkedPlayer = linkedPlayers?.find(lp => lp.player?.user_id === bet.user_id)?.player
                            const tierStyle = pts != null ? (TIER_COLOR[pts] ?? TIER_COLOR[0]) : 'bg-slate-800 text-slate-400 border-slate-700'
                            const tierLabel = pts != null ? POINT_TIER_LABELS[pts] : null

                            return (
                              <tr key={bet.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    {linkedPlayer?.photo_url ? (
                                      <img src={linkedPlayer.photo_url} className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
                                    ) : (
                                      <div className="h-5 w-5 rounded-full bg-navy-700 flex items-center justify-center text-[9px] font-bold text-slate-300 flex-shrink-0">
                                        {(linkedPlayer?.name ?? bet.user_email).charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="text-white font-medium">
                                      {linkedPlayer?.name ?? bet.user_email.split('@')[0]}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <span className="font-bold text-slate-200 tabular-nums">
                                    {bet.home_score} × {bet.away_score}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {pts != null ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${tierStyle}`}>
                                        {pts} pts
                                      </span>
                                      {tierLabel && pts > 0 && (
                                        <span className="text-[9px] text-slate-500">{tierLabel}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-600 text-xs">–</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── TODAS AS APOSTAS ── */}
      {tab === 'todas' && (() => {
        const matchById = new Map((matches ?? []).map(m => [m.id, m]))
        type Entry = {
          id: string
          kind: 'match' | 'season'
          ts: string
          isEdit: boolean
          userId: string | null
          name: string
          email: string
          description: React.ReactNode
          extra?: React.ReactNode
        }
        const fmtBetType = (t: string) => ({
          champion: 'Campeão',
          runner_up: 'Vice-campeão',
          third_place: '3º Lugar',
          relegated: 'Eliminado 1ª Fase',
          relegated_2: '2º Eliminado 1ª Fase',
          top_scorer: 'Artilheiro',
          champion_cinema: '🎬 Campeão Cinema',
          runner_up_cinema: '🎬 2º Cinema',
          third_place_cinema: '🎬 3º Cinema',
          relegated_cinema: '🎬 Eliminado 1ª Fase Cinema',
          relegated_cinema_2: '🎬 2º Eliminado 1ª Fase Cinema',
          top_scorer_cinema: '🎬 Artilheiro Cinema',
        } as Record<string, string>)[t] ?? t
        const entries: Entry[] = []
        for (const b of matchBets ?? []) {
          const m = matchById.get(b.match_id)
          const updated = (b as any).updated_at ?? b.created_at
          const isEdit = !!(b as any).updated_at && (b as any).updated_at !== b.created_at
          const uid = (b as any).user_id ?? null
          const uMeta = uid ? userById.get(uid) : undefined
          entries.push({
            id: 'm_' + b.id,
            kind: 'match',
            ts: updated,
            isEdit,
            userId: uid,
            name: uMeta?.name ?? (b as any).user_email ?? '—',
            email: (b as any).user_email ?? '',
            description: (
              <span>
                <span className="text-slate-300">{m?.home_team?.name ?? '?'}</span>
                {' '}
                <strong className="text-pitch-400">{b.home_score} × {b.away_score}</strong>
                {' '}
                <span className="text-slate-300">{m?.away_team?.name ?? '?'}</span>
              </span>
            ),
            extra: m?.match_date ? (
              <span className="text-[10px] text-slate-500">
                jogo: {new Date(m.match_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null,
          })
        }
        for (const b of (seasonBets as any[]) ?? []) {
          const updated = b.updated_at ?? b.created_at
          const isEdit = !!b.updated_at && b.updated_at !== b.created_at
          const target = b.team?.name ?? b.player?.name ?? '?'
          const uid = b.user_id ?? null
          const uMeta = uid ? userById.get(uid) : undefined
          entries.push({
            id: 's_' + b.id,
            kind: 'season',
            ts: updated,
            isEdit,
            userId: uid,
            name: uMeta?.name ?? b.user_email ?? '—',
            email: b.user_email ?? '',
            description: (
              <span>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] mr-2">
                  {b.category?.name ?? '?'}
                </Badge>
                <span className="text-slate-300">{fmtBetType(b.bet_type)}</span>
                {' → '}
                <strong className="text-pitch-400">{target}</strong>
              </span>
            ),
          })
        }
        entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

        const normStr = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
        const q = normStr(feedSearch)
        const filtered = q
          ? entries.filter(e => normStr(e.name).includes(q) || normStr(e.email).includes(q))
          : entries

        const totalPages = Math.max(1, Math.ceil(filtered.length / FEED_PAGE_SIZE))
        const page = Math.min(feedPage, totalPages - 1)
        const pageStart = page * FEED_PAGE_SIZE
        const pageEntries = filtered.slice(pageStart, pageStart + FEED_PAGE_SIZE)

        const uniqueUsers = Array.from(new Set(entries.map(e => e.name))).sort()

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
              <p>Todas as apostas registradas, em ordem do mais recente. Atualiza em tempo real.</p>
              <span className="flex items-center gap-1 text-pitch-400">
                <Activity className="h-3 w-3 animate-pulse" />
                ao vivo • {filtered.length}{q ? ` de ${entries.length}` : ''} apostas
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Filtrar por nome de usuário..."
                  value={feedSearch}
                  onChange={e => { setFeedSearch(e.target.value); setFeedPage(0) }}
                  className="pl-10"
                  list="user-name-list"
                />
                <datalist id="user-name-list">
                  {uniqueUsers.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              {feedSearch && (
                <Button variant="ghost" size="sm" onClick={() => { setFeedSearch(''); setFeedPage(0) }} className="text-slate-400">
                  Limpar
                </Button>
              )}
            </div>

            {pageEntries.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-slate-500">
                {q ? 'Nenhuma aposta encontrada para esse usuário.' : 'Nenhuma aposta registrada.'}
              </CardContent></Card>
            ) : (
              pageEntries.map(e => (
                <Card key={e.id} className="border-navy-700">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={e.kind === 'match'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] gap-1'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] gap-1'}>
                            {e.kind === 'match' ? <Target className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                            {e.kind === 'match' ? 'Partida' : 'Temporada'}
                          </Badge>
                          {e.isEdit && (
                            <Badge className="bg-slate-700/40 text-slate-300 border-slate-600/40 text-[10px]">editada</Badge>
                          )}
                          <span className="text-xs text-white font-medium">{e.name}</span>
                          {e.email && e.email !== e.name && (
                            <span className="text-[10px] text-slate-500">({e.email})</span>
                          )}
                        </div>
                        <div className="text-sm">{e.description}</div>
                        {e.extra && <div className="mt-0.5">{e.extra}</div>}
                      </div>
                      <div className="text-[11px] text-slate-500 text-right whitespace-nowrap">
                        {new Date(e.ts).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setFeedPage(p => Math.max(0, p - 1))} className="text-slate-300">
                  <ChevronLeft className="h-4 w-4" />Anterior
                </Button>
                <span className="text-xs text-slate-400 px-2">Página {page + 1} de {totalPages}</span>
                <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setFeedPage(p => p + 1)} className="text-slate-300">
                  Próxima<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── PARTICIPANTES ── */}
      {tab === 'participantes' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Jogadores do campeonato com conta vinculada e participantes do bolão.
          </p>

          {/* Players with user accounts */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="h-4 w-4 text-pitch-400" />
              <h2 className="text-sm font-semibold text-white">Jogadores com conta vinculada</h2>
            </div>
            <Card>
              <CardContent className="p-0">
                {!linkedPlayers || linkedPlayers.filter(lp => lp.player?.user_id).length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum jogador com conta vinculada.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-700">
                        <th className="text-left py-2.5 px-4 text-xs text-slate-500 font-medium">Jogador</th>
                        <th className="text-left py-2.5 px-4 text-xs text-slate-500 font-medium hidden sm:table-cell">Time</th>
                        <th className="text-center py-2.5 px-4 text-xs text-slate-500 font-medium">No Bolão</th>
                        <th className="text-center py-2.5 px-4 text-xs text-slate-500 font-medium">Pts</th>
                        <th className="text-center py-2.5 px-4 text-xs text-slate-500 font-medium">Apostas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedPlayers.filter(lp => lp.player?.user_id).map(lp => {
                        const participant = participants.find(p => p.userId === lp.player.user_id)
                        return (
                          <tr key={lp.player.id} className="border-b border-navy-800/50 hover:bg-navy-800/20 transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                {lp.player.photo_url ? (
                                  <img src={lp.player.photo_url} className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-navy-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                    {lp.player.name.charAt(0)}
                                  </div>
                                )}
                                <span className="font-medium text-white">{lp.player.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 hidden sm:table-cell">
                              <div className="flex items-center gap-1.5">
                                {lp.team?.shield_url && <img src={lp.team.shield_url} className="h-4 w-4 rounded-full object-cover" />}
                                <span className="text-sm text-slate-300">{lp.team?.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {participant ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pitch-500/20 text-pitch-400 border border-pitch-500/30">
                                  Sim
                                </span>
                              ) : (
                                <span className="text-xs text-slate-600">–</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-center font-bold text-white">
                              {participant?.points ?? '–'}
                            </td>
                            <td className="py-2.5 px-4 text-center text-slate-400">
                              {participant?.bets ?? '–'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All pool participants (including non-linked) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Todos os participantes do bolão</h2>
            </div>
            <Card>
              <CardContent className="p-0">
                {participants.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum participante ainda.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-700">
                        <th className="text-left py-2.5 px-4 text-xs text-slate-500 font-medium">Email / Jogador</th>
                        <th className="text-center py-2.5 px-4 text-xs text-slate-500 font-medium">Apostas</th>
                        <th className="text-center py-2.5 px-4 text-xs text-slate-500 font-medium">Pts totais</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map(p => (
                        <tr key={p.userId} className="border-b border-navy-800/50 hover:bg-navy-800/20 transition-colors">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              {p.player?.photo_url ? (
                                <img src={p.player.photo_url} className="h-6 w-6 rounded-full object-cover" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-navy-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                  {(p.player?.name ?? p.email).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-white">{p.player?.name ?? p.email.split('@')[0]}</p>
                                {p.player && <p className="text-[10px] text-slate-500">{p.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center text-slate-300">{p.bets}</td>
                          <td className="py-2.5 px-4 text-center font-bold text-white">{p.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
