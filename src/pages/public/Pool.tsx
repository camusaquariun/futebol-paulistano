import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  useActiveChampionship,
  useMatches,
  useCategories,
  useChampionshipCategories,
  useMyPoolBets,
  useSavePoolMatchBet,
  useTeamsByCategory,
  usePlayersByChampionship,
  useMyPoolSeasonBets,
  useSavePoolSeasonBet,
} from '@/hooks/useSupabase'
import { canBetOnMatch, betDeadlineLabel, calculateMatchPoints, buildLeaderboard, POINT_TIER_LABELS } from '@/lib/pool-points'
import { phaseLabel } from '@/lib/utils'
import type { Category, Championship, Match, PoolSeasonBetType } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Trophy, Clock, Check, Lock, BarChart3, Film, ChevronDown, ChevronUp, LogIn, Star, Target, TrendingUp, AlertTriangle } from 'lucide-react'
import { usePoolMatchBets, usePoolSeasonBets } from '@/hooks/useSupabase'

type TabId = 'apostas' | 'cinema'

// Cinema bets: até 18/05/2026 20:00 BRT (início da 1ª rodada) = 18/05 23:00 UTC
// Extras (non-cinema) season bets: até fim de 30/08/2026 BRT = 31/08 03:00 UTC
const CINEMA_DEADLINE_MS = Date.UTC(2026, 4, 18, 23, 0, 0)
const EXTRAS_DEADLINE_MS = Date.UTC(2026, 7, 31, 3, 0, 0)
const cinemaDeadlineLabel = '18/05/2026, 20:00 (Brasília) — antes da 1ª rodada'
const extrasDeadlineLabel = '30/08/2026, 23:59 (Brasília)'
const isCinemaOpen = () => Date.now() < CINEMA_DEADLINE_MS
const isExtrasOpen = () => Date.now() < EXTRAS_DEADLINE_MS
const isBetOpen = (betType: string) => betType.endsWith('_cinema') ? isCinemaOpen() : isExtrasOpen()
const deadlineLabelFor = (betType: string) => betType.endsWith('_cinema') ? cinemaDeadlineLabel : extrasDeadlineLabel

interface CinemaCategorySectionProps {
  category: Category
  championship: Championship
  cinemaBets: Record<string, string>
  setCinemaBets: React.Dispatch<React.SetStateAction<Record<string, string>>>
  savingCinema: string | null
  setSavingCinema: React.Dispatch<React.SetStateAction<string | null>>
  mySeasonBetMap: Map<string, any>
  handleSaveCinemaBet: (categoryId: string, betType: PoolSeasonBetType, teamId?: string, playerId?: string, betLabel?: string, selectionName?: string) => void
  players: any[]
}

function CinemaCategorySection({
  category,
  championship,
  cinemaBets,
  setCinemaBets,
  savingCinema,
  mySeasonBetMap,
  handleSaveCinemaBet,
  players,
}: CinemaCategorySectionProps) {
  const { data: catTeams } = useTeamsByCategory(championship.id, category.id)

  const catPlayers = players.filter((p: any) =>
    p.links?.some((l: any) => l.category_id === category.id)
  )

  const isLivre = category.name === 'Livre'
  const isVeterano = category.name === 'Veterano'
  const betTypes: { type: PoolSeasonBetType; label: string; points: number; needsTeam: boolean; needsPlayer: boolean }[] = [
    { type: 'champion_cinema', label: '🎬 Campeão Cinema', points: 50, needsTeam: true, needsPlayer: false },
    { type: 'runner_up_cinema', label: '🎬 2º Colocado Cinema', points: 20, needsTeam: true, needsPlayer: false },
    { type: 'third_place_cinema', label: '🎬 3º Colocado Cinema', points: 10, needsTeam: true, needsPlayer: false },
    { type: 'relegated_cinema', label: isVeterano ? '🎬 1º Eliminado 1ª Fase Cinema' : '🎬 Eliminado 1ª Fase Cinema', points: 20, needsTeam: true, needsPlayer: false },
    { type: 'relegated_cinema_2', label: '🎬 2º Eliminado 1ª Fase Cinema', points: 20, needsTeam: true, needsPlayer: false },
    { type: 'top_scorer_cinema', label: '🎬 Artilheiro Cinema', points: 30, needsTeam: false, needsPlayer: true },
    { type: 'champion', label: 'Campeão', points: 25, needsTeam: true, needsPlayer: false },
    { type: 'runner_up', label: 'Vice-campeão', points: 10, needsTeam: true, needsPlayer: false },
    { type: 'third_place', label: '3º Lugar', points: 5, needsTeam: true, needsPlayer: false },
    { type: 'relegated', label: isVeterano ? '1º Eliminado 1ª Fase' : 'Eliminado 1ª Fase', points: 10, needsTeam: true, needsPlayer: false },
    { type: 'relegated_2', label: '2º Eliminado 1ª Fase', points: 10, needsTeam: true, needsPlayer: false },
    { type: 'top_scorer', label: 'Artilheiro', points: 15, needsTeam: false, needsPlayer: true },
  ].filter(bt => {
    if (isLivre && (bt.type === 'third_place' || bt.type === 'third_place_cinema')) return false
    if (!isVeterano && (bt.type === 'relegated_cinema_2' || bt.type === 'relegated_2')) return false
    return true
  })

  return (
    <Card className="bg-navy-900 border-navy-700">
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
            const isCinema = bt.type.endsWith('_cinema')
            const open = isBetOpen(bt.type)
            const isLocked = (isCinema && !!existing) || !open
            const deadlineLabel = deadlineLabelFor(bt.type)

            return (
              <div key={bt.type} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{bt.label}</span>
                    <Badge className="bg-gold-500/20 text-gold-400 border-gold-500/30 text-[10px]">
                      {bt.points} pts
                    </Badge>
                    {isLocked && (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px] gap-1">
                        <Lock className="h-3 w-3" />
                        {isCinema && existing ? 'Bloqueada' : 'Encerrada'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Aposte até <span className="text-slate-300">{deadlineLabel}</span>
                  </p>
                  {existing && !localValue && (
                    <p className="text-[10px] text-pitch-400 mt-0.5">
                      Aposta: {bt.needsTeam && existing.team ? existing.team.name : ''}{bt.needsPlayer && existing.player ? existing.player.name : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isLocked ? null : (
                    <>
                      {bt.needsTeam && (
                        <select
                          value={localValue ?? existing?.team_id ?? ''}
                          onChange={e => setCinemaBets(prev => ({ ...prev, [key]: e.target.value }))}
                          className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-pitch-500 max-w-[180px]"
                        >
                          <option value="">Selecionar time...</option>
                          {(catTeams ?? []).map(t => (
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
                          {catPlayers.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      {localValue && localValue !== (existing?.team_id ?? existing?.player_id ?? '') && (
                        <Button
                          onClick={() => {
                            const selName = bt.needsTeam
                              ? (catTeams ?? []).find(t => t.id === localValue)?.name ?? ''
                              : catPlayers.find((p: any) => p.id === localValue)?.name ?? ''
                            handleSaveCinemaBet(
                              category.id,
                              bt.type,
                              bt.needsTeam ? localValue : undefined,
                              bt.needsPlayer ? localValue : undefined,
                              bt.label,
                              selName,
                            )
                          }}
                          disabled={isSaving}
                          className="h-8 px-3 bg-pitch-600 hover:bg-pitch-700 text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Salvar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Pool() {
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const { data: allMatches } = useMatches(championship?.id)
  const { data: myBets } = useMyPoolBets(user?.id, championship?.id)
  const { data: players } = usePlayersByChampionship(championship?.id)
  const { data: mySeasonBets } = useMyPoolSeasonBets(user?.id, championship?.id)
  const saveBet = useSavePoolMatchBet()
  const saveSeasonBet = useSavePoolSeasonBet()
  const { data: allMatchBets } = usePoolMatchBets(championship?.id)
  const { data: allSeasonBets } = usePoolSeasonBets(championship?.id)
  const { data: isPoolMember } = useQuery({
    queryKey: ['my_pool_membership', user?.id],
    queryFn: async () => {
      if (!user) return false
      const { data } = await supabase.from('pool_participants').select('user_id').eq('user_id', user.id).maybeSingle()
      return !!data
    },
    enabled: !!user,
  })
  const canBetThisUser = !!user && isPoolMember === true

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
    const matchLookup = new Map((allMatches ?? []).map(m => [m.id, m]))
    for (const b of myBets ?? []) {
      let points = b.points
      if (points == null) {
        const match = matchLookup.get(b.match_id)
        if (match?.status === 'finished' && match.home_score != null && match.away_score != null) {
          points = calculateMatchPoints(b.home_score, b.away_score, match.home_score, match.away_score)
        }
      }
      map.set(b.match_id, { id: b.id, home_score: b.home_score, away_score: b.away_score, points })
    }
    return map
  }, [myBets, allMatches])

  // My stats
  const myStats = useMemo(() => {
    const entries = Array.from(myBetMap.values())
    const finished = entries.filter(b => b.points != null)
    const totalPoints = finished.reduce((s, b) => s + (b.points ?? 0), 0)
    const exactScores = finished.filter(b => b.points === 15).length
    const correctWinner = finished.filter(b => (b.points ?? 0) >= 5).length
    const noPoints = finished.filter(b => b.points === 0).length
    return { totalBets: myBetMap.size, finishedBets: finished.length, totalPoints, exactScores, correctWinner, noPoints }
  }, [myBetMap])

  // My rank in leaderboard
  const leaderboard = useMemo(() => buildLeaderboard(allMatchBets ?? [], allSeasonBets ?? []), [allMatchBets, allSeasonBets])
  const myRank = user ? leaderboard.findIndex(e => e.userId === user.id) : -1

  // Bet result label for a finished match
  const getBetResultLabel = (points: number | null | undefined): { label: string; color: string } | null => {
    if (points == null) return null
    if (points === 0) return { label: 'Sem pontos', color: 'text-red-400' }
    if (points === 15) return { label: '⭐ Placar Exato', color: 'text-amber-400' }
    if (points === 10) return { label: '✓ Venc. + Gols Venc.', color: 'text-pitch-400' }
    if (points === 8) return { label: '✓ Venc. + Gols Perd.', color: 'text-pitch-400' }
    if (points === 6) return { label: '✓ Venc. + Saldo', color: 'text-pitch-400' }
    if (points === 5) return { label: '✓ Vencedor', color: 'text-blue-400' }
    if (points === 2) return { label: '~ Gols de 1 time', color: 'text-slate-400' }
    return { label: `${points} pts`, color: 'text-slate-400' }
  }

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
  const [pendingCinema, setPendingCinema] = useState<{
    categoryId: string
    betType: PoolSeasonBetType
    teamId?: string
    playerId?: string
    label: string
    selectionName: string
  } | null>(null)
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1)

  const executeCinemaSave = async (p: NonNullable<typeof pendingCinema>) => {
    if (!user || !championship) return
    const key = `${p.categoryId}_${p.betType}`
    setSavingCinema(key)
    try {
      await saveSeasonBet.mutateAsync({
        user_id: user.id,
        championship_id: championship.id,
        category_id: p.categoryId,
        user_email: user.email ?? '',
        bet_type: p.betType,
        team_id: p.teamId || null,
        player_id: p.playerId || null,
      })
      setCinemaBets(prev => { const next = { ...prev }; delete next[key]; return next })
    } catch (e: any) {
      alert('Erro ao salvar aposta: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setSavingCinema(null)
    }
  }

  const handleSaveCinemaBet = async (
    categoryId: string,
    betType: PoolSeasonBetType,
    teamId?: string,
    playerId?: string,
    betLabel?: string,
    selectionName?: string,
  ) => {
    if (!user || !championship) return
    if (!canBetThisUser) {
      alert('Você ainda não foi habilitado para apostar. Solicite acesso ao administrador.')
      return
    }
    const isCinema = betType.endsWith('_cinema')
    if (!isBetOpen(betType)) {
      alert(`Apostas encerradas em ${deadlineLabelFor(betType)}.`)
      return
    }
    if (isCinema) {
      setPendingCinema({
        categoryId,
        betType,
        teamId,
        playerId,
        label: betLabel ?? betType,
        selectionName: selectionName ?? '',
      })
      setConfirmStep(1)
      return
    }
    // Non-cinema season bets save directly (still editable)
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
    setCinemaBets(prev => { const next = { ...prev }; delete next[key]; return next })
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

      {user && isPoolMember === false && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm text-amber-300 font-medium">Você ainda não está habilitado para apostar.</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Solicite ao administrador para liberar seu acesso ao Bolão. Enquanto isso, você pode ver a classificação e as apostas registradas.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My stats dashboard */}
      {user && myStats.totalBets > 0 && (
        <Card className="bg-gradient-to-r from-pitch-900/40 via-navy-900 to-navy-900 border-pitch-600/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-pitch-400 uppercase tracking-wider">Seu desempenho</p>
              {myRank >= 0 && (
                <span className="text-xs text-slate-400">
                  <span className="font-bold text-white text-sm">#{myRank + 1}</span> na classificação
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-navy-800/60 rounded-lg p-3 text-center">
                <div className="text-2xl font-extrabold text-pitch-400">{myStats.totalPoints}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Pontos</div>
              </div>
              <div className="bg-navy-800/60 rounded-lg p-3 text-center">
                <div className="text-2xl font-extrabold text-white">{myStats.totalBets}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Apostas</div>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center border border-amber-500/20">
                <div className="text-2xl font-extrabold text-amber-400">{myStats.exactScores}</div>
                <div className="text-[10px] text-amber-400/70 mt-0.5 uppercase tracking-wide">Placar Exato</div>
              </div>
              <div className="bg-pitch-600/10 rounded-lg p-3 text-center border border-pitch-500/20">
                <div className="text-2xl font-extrabold text-pitch-400">{myStats.correctWinner}</div>
                <div className="text-[10px] text-pitch-400/70 mt-0.5 uppercase tracking-wide">Acertou Venc.</div>
              </div>
            </div>
            {myStats.finishedBets > 0 && (
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                <span>{myStats.finishedBets} partidas finalizadas</span>
                <span>·</span>
                <span className="text-red-400/70">{myStats.noPoints} sem ponto</span>
                <span>·</span>
                <span className="text-pitch-400/70">{((myStats.correctWinner / myStats.finishedBets) * 100).toFixed(0)}% de acerto</span>
              </div>
            )}
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
          {user && !canBetThisUser && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Lock className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Acesso ao Bolão pendente</p>
                  <p className="text-xs text-slate-400 mt-0.5">Sua conta ainda não foi habilitada para apostar. Solicite acesso ao administrador.</p>
                </div>
              </CardContent>
            </Card>
          )}
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
                            <div className="text-[10px] text-slate-500">
                              {canBet ? (
                                <span>Aposte até {betDeadlineLabel(match.match_date)}</span>
                              ) : isFinished ? (
                                'Encerrado'
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Lock className="h-3 w-3" />
                                  Apostas fechadas
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Kickoff time (centered above teams) */}
                          {match.match_date && (
                            <div className="flex justify-center mb-1.5">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-pitch-300">
                                <Clock className="h-3.5 w-3.5" />
                                {new Date(match.match_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}

                          {/* Match row */}
                          <div className="flex items-center gap-2">
                            {/* Home team */}
                            <div className="flex-1 text-right">
                              {match.home_team ? (
                                <Link
                                  to={`/times/${match.home_team.id}`}
                                  className="flex items-center justify-end gap-2 hover:text-pitch-400 transition-colors"
                                >
                                  <span className="text-sm font-semibold text-white truncate hover:text-pitch-400">
                                    {match.home_team.name}
                                  </span>
                                  {match.home_team.shield_url ? (
                                    <img src={match.home_team.shield_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                      {match.home_team.name?.charAt(0)}
                                    </div>
                                  )}
                                </Link>
                              ) : (
                                <span className="text-sm font-semibold text-white">?</span>
                              )}
                            </div>

                            {/* Score / Bet inputs */}
                            <div className="flex items-center gap-1 min-w-[120px] justify-center">
                              {isFinished && (
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">
                                    {match.home_score} × {match.away_score}
                                  </div>
                                  {existing && (() => {
                                    const result = getBetResultLabel(existing.points)
                                    return (
                                      <div className="mt-1 space-y-0.5">
                                        <div className="text-[10px] text-slate-400">
                                          Sua aposta: <span className="font-bold text-white">{existing.home_score}×{existing.away_score}</span>
                                        </div>
                                        {result && (
                                          <div className={`text-[10px] font-semibold ${result.color}`}>
                                            {result.label}
                                            {existing.points != null && existing.points > 0 && (
                                              <span className="ml-1 bg-black/20 px-1 rounded">+{existing.points} pts</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {!existing && user && (
                                    <div className="text-[10px] text-slate-600 mt-0.5">Sem aposta</div>
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
                                      {canBet && canBetThisUser && (
                                        <button
                                          onClick={() => startEditing(match.id)}
                                          className="text-[10px] text-slate-500 hover:text-pitch-400 transition-colors"
                                        >
                                          Editar
                                        </button>
                                      )}
                                    </div>
                                  ) : canBet && canBetThisUser ? (
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
                              {match.away_team ? (
                                <Link
                                  to={`/times/${match.away_team.id}`}
                                  className="flex items-center gap-2 hover:text-pitch-400 transition-colors"
                                >
                                  {match.away_team.shield_url ? (
                                    <img src={match.away_team.shield_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                      {match.away_team.name?.charAt(0)}
                                    </div>
                                  )}
                                  <span className="text-sm font-semibold text-white truncate hover:text-pitch-400">
                                    {match.away_team.name}
                                  </span>
                                </Link>
                              ) : (
                                <span className="text-sm font-semibold text-white">?</span>
                              )}
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
                <strong>Cinema</strong>: aposta feita <strong>antes do início do campeonato</strong> (até {cinemaDeadlineLabel}). Uma vez registrada, NÃO pode ser alterada.
              </p>
              <p className="text-xs text-slate-400">
                <strong>Extras</strong>: aposta até a <strong>metade do campeonato</strong> (até {extrasDeadlineLabel}).
              </p>
              {!isCinemaOpen() && (
                <p className="mt-2 text-xs text-red-300 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" />
                  Apostas Cinema encerradas em {cinemaDeadlineLabel}.
                </p>
              )}
              {!isExtrasOpen() && (
                <p className="mt-1 text-xs text-red-300 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" />
                  Apostas Extras encerradas em {extrasDeadlineLabel}.
                </p>
              )}
            </CardContent>
          </Card>

          {!user && (
            <p className="text-sm text-slate-500 text-center py-4">
              <Link to="/login" className="text-pitch-400 hover:underline">Faça login</Link> para fazer apostas cinema.
            </p>
          )}

          {user && !canBetThisUser && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Lock className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Acesso ao Bolão pendente</p>
                  <p className="text-xs text-slate-400 mt-0.5">Sua conta ainda não foi habilitada para apostar. Solicite acesso ao administrador. Você continua vendo a classificação e os palpites dos outros usuários.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {user && canBetThisUser && champCategories && (categories ?? []).map(category => {
            const hasCat = champCategories.some((cc: any) => cc.category_id === category.id)
            if (!hasCat) return null
            return (
              <CinemaCategorySection
                key={category.id}
                category={category}
                championship={championship}
                cinemaBets={cinemaBets}
                setCinemaBets={setCinemaBets}
                savingCinema={savingCinema}
                setSavingCinema={setSavingCinema}
                mySeasonBetMap={mySeasonBetMap}
                handleSaveCinemaBet={handleSaveCinemaBet}
                players={players ?? []}
              />
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

      <Dialog open={pendingCinema !== null} onOpenChange={open => { if (!open) setPendingCinema(null) }}>
        <DialogContent>
          {pendingCinema && confirmStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  Atenção: aposta permanente
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-slate-300">
                <p>Você está prestes a registrar uma <strong className="text-white">aposta Cinema</strong>:</p>
                <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3">
                  <div className="text-white font-medium">{pendingCinema.label}</div>
                  <div className="text-pitch-400 mt-1">→ {pendingCinema.selectionName}</div>
                </div>
                <p className="text-red-300">
                  <Lock className="inline h-4 w-4 mr-1" />
                  Uma vez registrada, <strong>essa aposta NÃO poderá ser alterada</strong> nem por um administrador.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPendingCinema(null)}>Cancelar</Button>
                <Button onClick={() => setConfirmStep(2)} className="bg-amber-600 hover:bg-amber-700">
                  Continuar
                </Button>
              </DialogFooter>
            </>
          )}
          {pendingCinema && confirmStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  Última confirmação
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-slate-300">
                <p>Confirma definitivamente esta aposta?</p>
                <div className="rounded-lg bg-slate-800/50 border border-red-500/30 p-3">
                  <div className="text-white font-medium">{pendingCinema.label}</div>
                  <div className="text-pitch-400 mt-1">→ {pendingCinema.selectionName}</div>
                </div>
                <p className="text-red-400 font-medium">Esta ação é IRREVERSÍVEL.</p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPendingCinema(null)}>Cancelar</Button>
                <Button
                  onClick={async () => {
                    const p = pendingCinema
                    setPendingCinema(null)
                    setConfirmStep(1)
                    await executeCinemaSave(p)
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Sim, registrar aposta
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
