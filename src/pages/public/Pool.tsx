import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useActiveChampionship,
  useMatches,
  useCategories,
  useChampionshipCategories,
  useMyPoolBets,
  useSavePoolMatchBet,
  useTeams,
  usePlayersByChampionship,
  useMyPoolSeasonBets,
  useSavePoolSeasonBet,
} from '@/hooks/useSupabase'
import { canBetOnMatch, betDeadlineLabel } from '@/lib/pool-points'
import { phaseLabel } from '@/lib/utils'
import type { Match, PoolSeasonBetType } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Clock, Check, Lock, BarChart3, Film, ChevronDown, ChevronUp, LogIn } from 'lucide-react'

type TabId = 'apostas' | 'cinema'

export default function Pool() {
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const { data: allMatches } = useMatches(championship?.id)
  const { data: myBets } = useMyPoolBets(user?.id, championship?.id)
  const { data: teams } = useTeams(championship?.id)
  const { data: players } = usePlayersByChampionship(championship?.id)
  const { data: mySeasonBets } = useMyPoolSeasonBets(user?.id, championship?.id)
  const saveBet = useSavePoolMatchBet()
  const saveSeasonBet = useSavePoolSeasonBet()

  const [tab, setTab] = useState<TabId>('apostas')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedRound, setExpandedRound] = useState<string | null>(null)
  const [editingBets, setEditingBets] = useState<Record<string, { home: string; away: string }>>({})
  const [savingMatch, setSavingMatch] = useState<string | null>(null)

  // Group matches by round
  const matchesByRound = useMemo(() => {
    if (!allMatches) return new Map<string, Match[]>()
    const filtered = selectedCategory === 'all'
      ? allMatches
      : allMatches.filter(m => m.category_id === selectedCategory)

    const sorted = [...filtered].sort((a, b) => {
      if (a.match_date && b.match_date) return new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
      if (a.match_date) return -1
      if (b.match_date) return 1
      return 0
    })

    const map = new Map<string, Match[]>()
    for (const m of sorted) {
      const key = m.phase === 'grupos'
        ? `${m.round}º Turno — Rodada`
        : phaseLabel(m.phase)
      // Group by date within the key
      const dateStr = m.match_date
        ? new Date(m.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Sem data'
      const roundKey = `${key} — ${dateStr}`
      if (!map.has(roundKey)) map.set(roundKey, [])
      map.get(roundKey)!.push(m)
    }
    return map
  }, [allMatches, selectedCategory])

  // Auto-expand first round with bettable matches
  useMemo(() => {
    if (expandedRound) return
    for (const [key, matches] of matchesByRound) {
      if (matches.some(m => canBetOnMatch(m.match_date))) {
        setExpandedRound(key)
        return
      }
    }
    // If no bettable round, expand the first one
    const firstKey = matchesByRound.keys().next().value
    if (firstKey) setExpandedRound(firstKey)
  }, [matchesByRound])

  const myBetMap = useMemo(() => {
    const map = new Map<string, { id: string; home_score: number; away_score: number; points: number | null }>()
    for (const b of myBets ?? []) {
      map.set(b.match_id, { id: b.id, home_score: b.home_score, away_score: b.away_score, points: b.points })
    }
    return map
  }, [myBets])

  const handleEditBet = (matchId: string, side: 'home' | 'away', value: string) => {
    if (value !== '' && !/^\d{1,2}$/.test(value)) return
    setEditingBets(prev => ({
      ...prev,
      [matchId]: {
        home: side === 'home' ? value : (prev[matchId]?.home ?? ''),
        away: side === 'away' ? value : (prev[matchId]?.away ?? ''),
      },
    }))
  }

  const handleSaveBet = async (match: Match) => {
    if (!user) return
    const editing = editingBets[match.id]
    if (!editing || editing.home === '' || editing.away === '') return
    const homeScore = parseInt(editing.home)
    const awayScore = parseInt(editing.away)
    if (isNaN(homeScore) || isNaN(awayScore)) return

    setSavingMatch(match.id)
    const existing = myBetMap.get(match.id)
    await saveBet.mutateAsync({
      id: existing?.id,
      user_id: user.id,
      match_id: match.id,
      user_email: user.email ?? '',
      home_score: homeScore,
      away_score: awayScore,
    })
    setEditingBets(prev => {
      const next = { ...prev }
      delete next[match.id]
      return next
    })
    setSavingMatch(null)
  }

  const startEditing = (matchId: string) => {
    const existing = myBetMap.get(matchId)
    setEditingBets(prev => ({
      ...prev,
      [matchId]: {
        home: existing ? String(existing.home_score) : '',
        away: existing ? String(existing.away_score) : '',
      },
    }))
  }

  // Season bet helpers
  const mySeasonBetMap = useMemo(() => {
    const map = new Map<string, typeof mySeasonBets extends (infer T)[] | undefined ? T : never>()
    for (const b of mySeasonBets ?? []) {
      map.set(`${b.category_id}_${b.bet_type}`, b)
    }
    return map
  }, [mySeasonBets])

  const [cinemaBets, setCinemaBets] = useState<Record<string, string>>({})
  const [savingCinema, setSavingCinema] = useState<string | null>(null)

  const handleSaveCinemaBet = async (categoryId: string, betType: PoolSeasonBetType, teamId?: string, playerId?: string) => {
    if (!user || !championship) return
    const key = `${categoryId}_${betType}`
    setSavingCinema(key)
    const existing = mySeasonBetMap.get(key)
    await saveSeasonBet.mutateAsync({
      id: existing?.id,
      user_id: user.id,
      championship_id: championship.id,
      category_id: categoryId,
      user_email: user.email ?? '',
      bet_type: betType,
      team_id: teamId || null,
      player_id: playerId || null,
    })
    setCinemaBets(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setSavingCinema(null)
  }

  if (!championship) {
    return (
      <div className="text-center py-12 text-slate-400">
        Nenhum campeonato ativo no momento.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="h-6 w-6 text-gold-400" />
            Bolão — {championship.name}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Aposte nos resultados das partidas e ganhe pontos!
          </p>
        </div>
        <Link
          to="/bolao/classificacao"
          className="flex items-center gap-2 px-4 py-2 bg-pitch-600/20 text-pitch-400 rounded-lg hover:bg-pitch-600/30 transition-colors text-sm font-medium"
        >
          <BarChart3 className="h-4 w-4" />
          Classificação do Bolão
        </Link>
      </div>

      {!user && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <LogIn className="h-5 w-5 text-amber-400" />
            <p className="text-sm text-amber-300">
              <Link to="/login" className="font-semibold underline hover:text-amber-200">Faça login</Link> para participar do bolão
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-700 pb-2">
        {([
          { id: 'apostas' as TabId, label: 'Apostas', icon: Trophy },
          { id: 'cinema' as TabId, label: 'Cinema & Extras', icon: Film },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-navy-800 text-white border-b-2 border-pitch-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'apostas' && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-pitch-600 text-white'
                  : 'bg-navy-800 text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            {(categories ?? []).map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-pitch-600 text-white'
                    : 'bg-navy-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Rounds */}
          {matchesByRound.size === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">Nenhum jogo encontrado.</p>
          )}
          {Array.from(matchesByRound.entries()).map(([roundKey, matches]) => {
            const isExpanded = expandedRound === roundKey
            const bettableCount = matches.filter(m => canBetOnMatch(m.match_date)).length
            const bettedCount = matches.filter(m => myBetMap.has(m.id)).length

            return (
              <Card key={roundKey} className="bg-navy-900 border-navy-700">
                <button
                  onClick={() => setExpandedRound(isExpanded ? null : roundKey)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{roundKey}</span>
                    <Badge className="bg-slate-700/50 text-slate-300 border-slate-600 text-[10px]">
                      {matches.length} jogo{matches.length !== 1 ? 's' : ''}
                    </Badge>
                    {user && bettedCount > 0 && (
                      <Badge className="bg-pitch-600/20 text-pitch-400 border-pitch-600/30 text-[10px]">
                        {bettedCount}/{matches.length} apostado{bettedCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {bettableCount > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                        {bettableCount} aberto{bettableCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    {matches.map(match => {
                      const existing = myBetMap.get(match.id)
                      const editing = editingBets[match.id]
                      const isEditing = !!editing
                      const canBet = canBetOnMatch(match.match_date)
                      const isFinished = match.status === 'finished'
                      const isSaving = savingMatch === match.id

                      return (
                        <div
                          key={match.id}
                          className={`rounded-lg border p-3 ${
                            isFinished
                              ? 'bg-slate-800/30 border-slate-700/50'
                              : canBet
                                ? 'bg-navy-800 border-navy-600'
                                : 'bg-slate-800/20 border-slate-700/30'
                          }`}
                        >
                          {/* Match header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {match.category && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                  {match.category.name}
                                </Badge>
                              )}
                              <Badge className="bg-slate-600/40 text-slate-400 border-slate-500/30 text-[10px]">
                                {phaseLabel(match.phase)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              {canBet ? (
                                <>
                                  <Clock className="h-3 w-3" />
                                  Até {betDeadlineLabel(match.match_date)}
                                </>
                              ) : isFinished ? (
                                'Encerrado'
                              ) : (
                                <>
                                  <Lock className="h-3 w-3" />
                                  Fechado
                                </>
                              )}
                            </div>
                          </div>

                          {/* Match row */}
                          <div className="flex items-center gap-2">
                            {/* Home team */}
                            <div className="flex-1 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm font-semibold text-white truncate">
                                  {match.home_team?.name ?? '?'}
                                </span>
                                {match.home_team?.shield_url ? (
                                  <img src={match.home_team.shield_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                    {match.home_team?.name?.charAt(0)}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Score / Bet inputs */}
                            <div className="flex items-center gap-1 min-w-[120px] justify-center">
                              {isFinished && (
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">
                                    {match.home_score} × {match.away_score}
                                  </div>
                                  {existing && (
                                    <div className={`text-[10px] mt-0.5 ${
                                      existing.points != null && existing.points > 0 ? 'text-green-400' : 'text-slate-500'
                                    }`}>
                                      Aposta: {existing.home_score}×{existing.away_score}
                                      {existing.points != null && ` → ${existing.points} pts`}
                                    </div>
                                  )}
                                </div>
                              )}
                              {!isFinished && isEditing && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={editing.home}
                                    onChange={e => handleEditBet(match.id, 'home', e.target.value)}
                                    className="w-10 h-9 text-center bg-slate-800 border border-slate-600 rounded text-white font-bold text-lg focus:outline-none focus:border-pitch-500"
                                    maxLength={2}
                                  />
                                  <span className="text-slate-500 font-bold">×</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={editing.away}
                                    onChange={e => handleEditBet(match.id, 'away', e.target.value)}
                                    className="w-10 h-9 text-center bg-slate-800 border border-slate-600 rounded text-white font-bold text-lg focus:outline-none focus:border-pitch-500"
                                    maxLength={2}
                                  />
                                  <Button
                                    onClick={() => handleSaveBet(match)}
                                    disabled={isSaving || editing.home === '' || editing.away === ''}
                                    className="h-9 w-9 p-0 bg-pitch-600 hover:bg-pitch-700"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {!isFinished && !isEditing && (
                                <div className="text-center">
                                  {existing ? (
                                    <div>
                                      <div className="text-lg font-bold text-pitch-400">
                                        {existing.home_score} × {existing.away_score}
                                      </div>
                                      {canBet && user && (
                                        <button
                                          onClick={() => startEditing(match.id)}
                                          className="text-[10px] text-slate-500 hover:text-pitch-400 transition-colors"
                                        >
                                          Editar
                                        </button>
                                      )}
                                    </div>
                                  ) : canBet && user ? (
                                    <button
                                      onClick={() => startEditing(match.id)}
                                      className="px-3 py-1.5 rounded bg-pitch-600/20 text-pitch-400 text-xs font-medium hover:bg-pitch-600/30 transition-colors"
                                    >
                                      Apostar
                                    </button>
                                  ) : (
                                    <span className="text-sm text-slate-600">— × —</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Away team */}
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2">
                                {match.away_team?.shield_url ? (
                                  <img src={match.away_team.shield_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                    {match.away_team?.name?.charAt(0)}
                                  </div>
                                )}
                                <span className="text-sm font-semibold text-white truncate">
                                  {match.away_team?.name ?? '?'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Link to live match */}
                          {(match.match_state === 'first_half' || match.match_state === 'second_half' || match.match_state === 'halftime') && (
                            <div className="mt-2 text-center">
                              <Link
                                to={`/partidas/${match.id}/ao-vivo`}
                                className="text-[10px] text-green-400 hover:underline font-medium"
                              >
                                🟢 Ao vivo — ver partida
                              </Link>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'cinema' && (
        <div className="space-y-6">
          <Card className="bg-navy-900 border-navy-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Film className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-400">Apostas Cinema & Extras</h3>
              </div>
              <p className="text-xs text-slate-400 mb-1">
                <strong>Cinema</strong>: Aposte no campeão e no último colocado de cada categoria <strong>antes do início do 2º turno</strong>. Vale 50 pontos cada!
              </p>
              <p className="text-xs text-slate-400">
                <strong>Extras</strong>: Aposte no campeão (25 pts), vice (10 pts), 3º lugar (5 pts) e artilheiro (15 pts) de cada categoria.
              </p>
            </CardContent>
          </Card>

          {!user && (
            <p className="text-sm text-slate-500 text-center py-4">
              <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para fazer apostas cinema.
            </p>
          )}

          {user && champCategories && (categories ?? []).map(category => {
            const hasCat = champCategories.some((cc: any) => cc.category_id === category.id)
            if (!hasCat) return null
            const catTeams = teams ?? []
            const catPlayers = players ?? []

            const betTypes: { type: PoolSeasonBetType; label: string; points: number; needsTeam: boolean; needsPlayer: boolean }[] = [
              { type: 'champion_cinema', label: '🎬 Campeão Cinema', points: 50, needsTeam: true, needsPlayer: false },
              { type: 'relegated_cinema', label: '🎬 Último Colocado Cinema', points: 50, needsTeam: true, needsPlayer: false },
              { type: 'champion', label: 'Campeão', points: 25, needsTeam: true, needsPlayer: false },
              { type: 'runner_up', label: 'Vice-campeão', points: 10, needsTeam: true, needsPlayer: false },
              { type: 'third_place', label: '3º Lugar', points: 5, needsTeam: true, needsPlayer: false },
              { type: 'top_scorer', label: 'Artilheiro', points: 15, needsTeam: false, needsPlayer: true },
            ]

            return (
              <Card key={category.id} className="bg-navy-900 border-navy-700">
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {category.name}
                    </Badge>
                  </h3>
                  <div className="space-y-3">
                    {betTypes.map(bt => {
                      const key = `${category.id}_${bt.type}`
                      const existing = mySeasonBetMap.get(key)
                      const localValue = cinemaBets[key]
                      const isSaving = savingCinema === key

                      return (
                        <div key={bt.type} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{bt.label}</span>
                              <Badge className="bg-gold-500/20 text-gold-400 border-gold-500/30 text-[10px]">
                                {bt.points} pts
                              </Badge>
                            </div>
                            {existing && !localValue && (
                              <p className="text-[10px] text-pitch-400 mt-0.5">
                                Aposta: {bt.needsTeam && existing.team ? existing.team.name : ''}{bt.needsPlayer && existing.player ? existing.player.name : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {bt.needsTeam && (
                              <select
                                value={localValue ?? existing?.team_id ?? ''}
                                onChange={e => setCinemaBets(prev => ({ ...prev, [key]: e.target.value }))}
                                className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-pitch-500 max-w-[180px]"
                              >
                                <option value="">Selecionar time...</option>
                                {catTeams.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            )}
                            {bt.needsPlayer && (
                              <select
                                value={localValue ?? existing?.player_id ?? ''}
                                onChange={e => setCinemaBets(prev => ({ ...prev, [key]: e.target.value }))}
                                className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-pitch-500 max-w-[180px]"
                              >
                                <option value="">Selecionar jogador...</option>
                                {catPlayers.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            )}
                            {localValue && localValue !== (existing?.team_id ?? existing?.player_id ?? '') && (
                              <Button
                                onClick={() => handleSaveCinemaBet(
                                  category.id,
                                  bt.type,
                                  bt.needsTeam ? localValue : undefined,
                                  bt.needsPlayer ? localValue : undefined,
                                )}
                                disabled={isSaving}
                                className="h-8 px-3 bg-pitch-600 hover:bg-pitch-700 text-xs"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Salvar
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Scoring rules */}
      <Card className="bg-navy-900/50 border-navy-700/50">
        <CardContent className="p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pontuação</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              { pts: 15, label: 'Placar Exato', ex: '4×2 → 4×2' },
              { pts: 10, label: 'Venc. + Gols Vencedor', ex: '4×2 → 4×0' },
              { pts: 8, label: 'Venc. + Gols Perdedor', ex: '4×2 → 2×0' },
              { pts: 6, label: 'Venc. + Saldo de Gols', ex: '4×2 → 3×1' },
              { pts: 5, label: 'Apenas Vencedor', ex: '4×2 → 1×0' },
              { pts: 2, label: 'Gols de 1 Time', ex: '4×2 → 0×2' },
            ].map(r => (
              <div key={r.pts} className="bg-slate-800/30 rounded p-2">
                <div className="font-bold text-amber-400">{r.pts} pts</div>
                <div className="text-slate-300">{r.label}</div>
                <div className="text-slate-500 text-[10px]">{r.ex}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
