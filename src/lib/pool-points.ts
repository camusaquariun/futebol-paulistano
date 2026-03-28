/**
 * Bolão point calculation system
 *
 * Scoring tiers (highest applicable wins):
 *  15 - Exact score (placar exato)
 *  10 - Correct winner + winner's goals correct
 *   8 - Correct winner + loser's goals correct
 *   6 - Correct winner + correct goal difference
 *   5 - Correct winner/draw only
 *   2 - One team's goals correct (wrong result)
 *   0 - Nothing correct
 *
 * Knockout bonus: +5 if correctly predicted advancing team
 */

export function calculateMatchPoints(
  betHome: number,
  betAway: number,
  actualHome: number,
  actualAway: number,
): number {
  // Exact score
  if (betHome === actualHome && betAway === actualAway) return 15

  const betResult = betHome > betAway ? 'home' : betHome < betAway ? 'away' : 'draw'
  const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw'

  if (betResult === actualResult) {
    // Draw correct but not exact
    if (betResult === 'draw') return 5

    // Winner correct — check sub-tiers
    const winnerBetGoals = betResult === 'home' ? betHome : betAway
    const winnerActualGoals = actualResult === 'home' ? actualHome : actualAway
    const loserBetGoals = betResult === 'home' ? betAway : betHome
    const loserActualGoals = actualResult === 'home' ? actualAway : actualHome

    if (winnerBetGoals === winnerActualGoals) return 10
    if (loserBetGoals === loserActualGoals) return 8
    if ((betHome - betAway) === (actualHome - actualAway)) return 6
    return 5
  }

  // Wrong result — check if any team's goals match
  if (betHome === actualHome || betAway === actualAway) return 2

  return 0
}

/** Point tier labels in Portuguese (used in leaderboard tiebreaker display) */
export const POINT_TIER_LABELS: Record<number, string> = {
  15: 'Placar Exato',
  10: 'Venc. + Gols Venc.',
  8: 'Venc. + Gols Perd.',
  6: 'Venc. + Saldo',
  5: 'Apenas Vencedor',
  2: 'Gols de 1 Time',
}

/** Tiebreaker order: most exact scores, then most 10-pt, etc. */
export const TIEBREAKER_ORDER = [15, 10, 8, 6, 5, 2] as const

export interface PoolLeaderboardEntry {
  userId: string
  email: string
  totalPoints: number
  matchPoints: number
  seasonPoints: number
  tierCounts: Record<number, number> // count of bets per point tier
  totalBets: number
}

export function buildLeaderboard(
  matchBets: { user_id: string; user_email: string; points: number | null }[],
  seasonBets: { user_id: string; user_email: string; points: number | null }[],
): PoolLeaderboardEntry[] {
  const map = new Map<string, PoolLeaderboardEntry>()

  const getOrCreate = (userId: string, email: string): PoolLeaderboardEntry => {
    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        email,
        totalPoints: 0,
        matchPoints: 0,
        seasonPoints: 0,
        tierCounts: { 15: 0, 10: 0, 8: 0, 6: 0, 5: 0, 2: 0 },
        totalBets: 0,
      })
    }
    return map.get(userId)!
  }

  for (const bet of matchBets) {
    if (bet.points == null) continue
    const entry = getOrCreate(bet.user_id, bet.user_email)
    entry.totalPoints += bet.points
    entry.matchPoints += bet.points
    entry.totalBets++
    if (bet.points in entry.tierCounts) {
      entry.tierCounts[bet.points]++
    }
  }

  for (const bet of seasonBets) {
    if (bet.points == null) continue
    const entry = getOrCreate(bet.user_id, bet.user_email)
    entry.totalPoints += bet.points
    entry.seasonPoints += bet.points
  }

  const entries = Array.from(map.values())

  // Sort: total points desc, then tiebreakers
  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    for (const tier of TIEBREAKER_ORDER) {
      if ((b.tierCounts[tier] ?? 0) !== (a.tierCounts[tier] ?? 0)) {
        return (b.tierCounts[tier] ?? 0) - (a.tierCounts[tier] ?? 0)
      }
    }
    return 0
  })

  return entries
}

/** Check if betting is still open for a match (1h before kickoff, Brasilia time) */
export function canBetOnMatch(matchDate: string | null): boolean {
  if (!matchDate) return false
  const kickoff = new Date(matchDate).getTime()
  const deadline = kickoff - 60 * 60 * 1000 // 1 hour before
  return Date.now() < deadline
}

/** Human-readable deadline */
export function betDeadlineLabel(matchDate: string | null): string {
  if (!matchDate) return 'Data não definida'
  const deadline = new Date(new Date(matchDate).getTime() - 60 * 60 * 1000)
  return deadline.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
