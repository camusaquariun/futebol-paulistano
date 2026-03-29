import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category, Championship, Team, Player, Match, MatchEvent, Suspension, Standing, TopScorer, PlayerTeam, PoolMatchBet, PoolSeasonBet, PoolSeasonBetType } from '@/types/database'

// Categories
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('display_order')
      if (error) throw error
      return data as Category[]
    },
  })
}

// Championships
export function useChampionships() {
  return useQuery({
    queryKey: ['championships'],
    queryFn: async () => {
      const { data, error } = await supabase.from('championships').select('*').order('season_year', { ascending: false })
      if (error) throw error
      return data as Championship[]
    },
  })
}

export function useActiveChampionship() {
  return useQuery({
    queryKey: ['championship', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('championships').select('*').eq('status', 'active').single()
      if (error && error.code !== 'PGRST116') throw error
      return data as Championship | null
    },
  })
}

export function useChampionshipCategories(championshipId: string | undefined) {
  return useQuery({
    queryKey: ['championship_categories', championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('championship_categories')
        .select('*, category:categories(*)')
        .eq('championship_id', championshipId!)
      if (error) throw error
      return data
    },
    enabled: !!championshipId,
  })
}

// Teams (scoped to championship)
export function useTeams(championshipId: string | undefined) {
  return useQuery({
    queryKey: ['teams', championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('championship_id', championshipId!)
        .order('name')
      if (error) throw error
      return data as Team[]
    },
    enabled: !!championshipId,
  })
}

export function useTeamsByCategory(championshipId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ['teams', 'category', championshipId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*, team_categories!inner(category_id)')
        .eq('championship_id', championshipId!)
        .eq('team_categories.category_id', categoryId!)
        .order('name')
      if (error) throw error
      return data as Team[]
    },
    enabled: !!championshipId && !!categoryId,
  })
}

// Players
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('*').order('name')
      if (error) throw error
      return data as Player[]
    },
  })
}

export function usePlayersByChampionship(championshipId: string | undefined) {
  return useQuery({
    queryKey: ['players', 'championship', championshipId],
    queryFn: async () => {
      // Get all team IDs for this championship, then get players linked to those teams
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('championship_id', championshipId!)
      if (!teams || teams.length === 0) return [] as Player[]
      const teamIds = teams.map(t => t.id)
      const { data, error } = await supabase
        .from('player_teams')
        .select('player:players!player_teams_player_id_fkey(*)')
        .in('team_id', teamIds)
      if (error) throw error
      // Deduplicate players (a player may be on multiple teams)
      const seen = new Set<string>()
      const players: Player[] = []
      for (const pt of data) {
        const p = (pt as any).player as Player
        if (p && !seen.has(p.id)) {
          seen.add(p.id)
          players.push(p)
        }
      }
      return players.sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: !!championshipId,
  })
}

export function useTeamRoster(teamId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ['team_roster', teamId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_teams')
        .select('*, player:players!player_teams_player_id_fkey(*)')
        .eq('team_id', teamId!)
        .eq('category_id', categoryId!)
      if (error) throw error
      return (data as PlayerTeam[]).sort((a, b) => {
        const aGk = a.positions?.includes('Goleiro') ? 0 : 1
        const bGk = b.positions?.includes('Goleiro') ? 0 : 1
        if (aGk !== bGk) return aGk - bGk
        return (a.player?.name ?? '').localeCompare(b.player?.name ?? '')
      })
    },
    enabled: !!teamId && !!categoryId,
  })
}

export function useUpdatePlayerPositions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ playerTeamId, positions }: { playerTeamId: string; positions: string[] }) => {
      const { error } = await supabase
        .from('player_teams')
        .update({ positions })
        .eq('id', playerTeamId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_roster'] })
      queryClient.invalidateQueries({ queryKey: ['player_teams'] })
    },
  })
}

export function useUpdateJerseyNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ playerTeamId, jerseyNumber }: { playerTeamId: string; jerseyNumber: number | null }) => {
      const { error } = await supabase
        .from('player_teams')
        .update({ jersey_number: jerseyNumber })
        .eq('id', playerTeamId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_roster'] })
    },
  })
}

export function useSetCaptain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ playerTeamId, teamId, categoryId }: { playerTeamId: string; teamId: string; categoryId: string }) => {
      // Remove captain from all players in this team+category
      await supabase
        .from('player_teams')
        .update({ is_captain: false })
        .eq('team_id', teamId)
        .eq('category_id', categoryId)
      // Set the new captain
      const { error } = await supabase
        .from('player_teams')
        .update({ is_captain: true })
        .eq('id', playerTeamId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_roster'] })
      queryClient.invalidateQueries({ queryKey: ['player_teams'] })
    },
  })
}

export function usePlayerTeams(playerId?: string) {
  return useQuery({
    queryKey: ['player_teams', playerId],
    queryFn: async () => {
      let query = supabase.from('player_teams').select('*, player:players!player_teams_player_id_fkey(*), team:teams(*), category:categories(*)')
      if (playerId) query = query.eq('player_id', playerId)
      const { data, error } = await query
      if (error) throw error
      return data as PlayerTeam[]
    },
    enabled: playerId ? !!playerId : true,
  })
}

export function usePlayersByTeamCategory(teamId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ['player_teams', teamId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_teams')
        .select('*, player:players!player_teams_player_id_fkey(*)')
        .eq('team_id', teamId!)
        .eq('category_id', categoryId!)
      if (error) throw error
      return data.map((pt: any) => pt.player) as Player[]
    },
    enabled: !!teamId && !!categoryId,
  })
}

// Matches
export function useMatches(championshipId: string | undefined, categoryId?: string) {
  return useQuery({
    queryKey: ['matches', championshipId, categoryId],
    queryFn: async () => {
      let query = supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*)')
        .eq('championship_id', championshipId!)
        .order('phase')
        .order('match_date', { nullsFirst: false })
      if (categoryId) query = query.eq('category_id', categoryId)
      const { data, error } = await query
      if (error) throw error
      return data as Match[]
    },
    enabled: !!championshipId,
  })
}

export function useTeamMatches(championshipId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['team_matches', championshipId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*), motm_player:players!matches_motm_player_id_fkey(*)')
        .eq('championship_id', championshipId!)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('match_date', { nullsFirst: false })
      if (error) throw error
      return data as Match[]
    },
    enabled: !!championshipId && !!teamId,
  })
}

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*)')
        .eq('id', matchId!)
        .single()
      if (error) throw error
      return data as Match
    },
    enabled: !!matchId,
  })
}

// Match Events
export function useMatchEvents(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match_events', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_events')
        .select('*, player:players(*), team:teams(*)')
        .eq('match_id', matchId!)
        .order('minute', { nullsFirst: false })
      if (error) throw error
      return data as MatchEvent[]
    },
    enabled: !!matchId,
  })
}

// Standings
export function useStandings(championshipId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ['standings', championshipId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('standings')
        .select('*')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
      if (error) throw error
      // Sort by tiebreaker rules
      return (data as Standing[]).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
        if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for
        if (a.yellow_cards !== b.yellow_cards) return a.yellow_cards - b.yellow_cards
        return a.red_cards - b.red_cards
      })
    },
    enabled: !!championshipId && !!categoryId,
  })
}

// Top Scorers
export function useTopScorers(championshipId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ['top_scorers', championshipId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('top_scorers')
        .select('*')
        .eq('championship_id', championshipId!)
        .eq('category_id', categoryId!)
      if (error) throw error
      return data as TopScorer[]
    },
    enabled: !!championshipId && !!categoryId,
  })
}

// Suspensions
export function useSuspensions(championshipId: string | undefined, categoryId?: string) {
  return useQuery({
    queryKey: ['suspensions', championshipId, categoryId],
    queryFn: async () => {
      let query = supabase
        .from('suspensions')
        .select('*, player:players(*), category:categories(*)')
        .eq('championship_id', championshipId!)
      if (categoryId) query = query.eq('category_id', categoryId)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data as Suspension[]
    },
    enabled: !!championshipId,
  })
}

// Mutations
export function useSaveChampionship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (champ: Partial<Championship> & { categories?: string[] }) => {
      const { categories, ...champData } = champ
      if (champ.id) {
        const { error } = await supabase.from('championships').update(champData).eq('id', champ.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('championships').insert(champData).select().single()
        if (error) throw error
        if (categories && categories.length > 0) {
          const { error: catError } = await supabase.from('championship_categories').insert(
            categories.map(cid => ({ championship_id: data.id, category_id: cid }))
          )
          if (catError) throw catError
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['championships'] })
      queryClient.invalidateQueries({ queryKey: ['championship'] })
    },
  })
}

export function useSaveTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ team, categoryIds }: { team: Partial<Team>; categoryIds: string[] }) => {
      let teamId = team.id
      if (teamId) {
        const { error } = await supabase.from('teams').update({ name: team.name, shield_url: team.shield_url, primary_color: team.primary_color, secondary_color: team.secondary_color }).eq('id', teamId)
        if (error) throw error
        await supabase.from('team_categories').delete().eq('team_id', teamId)
      } else {
        const { data, error } = await supabase.from('teams').insert({
          name: team.name,
          shield_url: team.shield_url,
          championship_id: team.championship_id,
          primary_color: team.primary_color,
          secondary_color: team.secondary_color,
        }).select().single()
        if (error) throw error
        teamId = data.id
      }
      if (categoryIds.length > 0) {
        const { error } = await supabase.from('team_categories').insert(
          categoryIds.map(cid => ({ team_id: teamId!, category_id: cid }))
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export function useDeleteTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  })
}

export function useSavePlayer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ player, teams }: { player: Partial<Player>; teams: { team_id: string; category_id: string }[] }) => {
      let playerId = player.id
      if (playerId) {
        const { error } = await supabase.from('players').update({ name: player.name }).eq('id', playerId)
        if (error) throw error
        await supabase.from('player_teams').delete().eq('player_id', playerId)
      } else {
        const { data, error } = await supabase.from('players').insert({ name: player.name }).select().single()
        if (error) throw error
        playerId = data.id
      }
      if (teams.length > 0) {
        const { error } = await supabase.from('player_teams').insert(
          teams.map(t => ({ player_id: playerId!, team_id: t.team_id, category_id: t.category_id }))
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      queryClient.invalidateQueries({ queryKey: ['player_teams'] })
    },
  })
}

export function useDeletePlayer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('players').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      queryClient.invalidateQueries({ queryKey: ['player_teams'] })
    },
  })
}

export function useSaveMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (match: Partial<Match>) => {
      if (match.id) {
        const { error } = await supabase.from('matches').update(match).eq('id', match.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('matches').insert(match)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['standings'] })
    },
  })
}

export function useSaveMatchEvents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, events }: { matchId: string; events: Partial<MatchEvent>[] }) => {
      // Delete existing events for this match
      await supabase.from('match_events').delete().eq('match_id', matchId)
      if (events.length > 0) {
        const { error } = await supabase.from('match_events').insert(
          events.map(e => ({ ...e, match_id: matchId }))
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match_events'] })
      queryClient.invalidateQueries({ queryKey: ['top_scorers'] })
      queryClient.invalidateQueries({ queryKey: ['standings'] })
    },
  })
}

export function useSaveSuspension() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (suspension: Partial<Suspension>) => {
      if (suspension.id) {
        const { error } = await supabase.from('suspensions').update(suspension).eq('id', suspension.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suspensions').insert(suspension)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suspensions'] }),
  })
}

export function useDeleteSuspension() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suspensions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suspensions'] }),
  })
}

// ========== MY TEAM ==========

export function useMyPlayer(userId: string | undefined) {
  return useQuery({
    queryKey: ['my_player', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as Player | null
    },
    enabled: !!userId,
  })
}

export function useMyTeams(playerId: string | undefined) {
  return useQuery({
    queryKey: ['my_teams', playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_teams')
        .select('*, team:teams(*, championship:championships(*)), category:categories(*)')
        .eq('player_id', playerId!)
      if (error) throw error
      return data
    },
    enabled: !!playerId,
  })
}

export function usePostGameComments(matchId: string | undefined) {
  return useQuery({
    queryKey: ['post_game_comments', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_game_comments')
        .select('*, player:players(name)')
        .eq('match_id', matchId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as { id: string; player_id: string; user_id: string; comment: string; created_at: string; player: { name: string } }[]
    },
    enabled: !!matchId,
  })
}

export function usePostGameVotes(matchId: string | undefined) {
  return useQuery({
    queryKey: ['post_game_votes', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_game_votes')
        .select('*, voted_player:players!post_game_votes_voted_player_id_fkey(name)')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as { id: string; voter_player_id: string; voted_player_id: string; user_id: string; voted_player: { name: string } }[]
    },
    enabled: !!matchId,
  })
}

// ========== BOLÃO (Betting Pool) ==========

export function usePoolMatchBets(championshipId: string | undefined) {
  return useQuery({
    queryKey: ['pool_match_bets', championshipId],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from('matches')
        .select('id')
        .eq('championship_id', championshipId!)
      if (!matches || matches.length === 0) return [] as PoolMatchBet[]
      const matchIds = matches.map(m => m.id)
      const { data, error } = await supabase
        .from('pool_match_bets')
        .select('*')
        .in('match_id', matchIds)
      if (error) throw error
      return data as PoolMatchBet[]
    },
    enabled: !!championshipId,
  })
}

export function usePoolMatchBetsByMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['pool_match_bets', 'match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_match_bets')
        .select('*')
        .eq('match_id', matchId!)
      if (error) throw error
      return data as PoolMatchBet[]
    },
    enabled: !!matchId,
    refetchInterval: 5000,
  })
}

export function useMyPoolBets(userId: string | undefined, championshipId: string | undefined) {
  return useQuery({
    queryKey: ['pool_match_bets', 'my', userId, championshipId],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from('matches')
        .select('id')
        .eq('championship_id', championshipId!)
      if (!matches || matches.length === 0) return [] as PoolMatchBet[]
      const matchIds = matches.map(m => m.id)
      const { data, error } = await supabase
        .from('pool_match_bets')
        .select('*')
        .eq('user_id', userId!)
        .in('match_id', matchIds)
      if (error) throw error
      return data as PoolMatchBet[]
    },
    enabled: !!userId && !!championshipId,
  })
}

export function useSavePoolMatchBet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bet: { id?: string; user_id: string; match_id: string; user_email: string; home_score: number; away_score: number }) => {
      if (bet.id) {
        const { error } = await supabase
          .from('pool_match_bets')
          .update({ home_score: bet.home_score, away_score: bet.away_score, updated_at: new Date().toISOString() })
          .eq('id', bet.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pool_match_bets')
          .insert(bet)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool_match_bets'] })
    },
  })
}

export function usePoolSeasonBets(championshipId: string | undefined) {
  return useQuery({
    queryKey: ['pool_season_bets', championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_season_bets')
        .select('*, team:teams(*), player:players(*), category:categories(*)')
        .eq('championship_id', championshipId!)
      if (error) throw error
      return data as PoolSeasonBet[]
    },
    enabled: !!championshipId,
  })
}

export function useMyPoolSeasonBets(userId: string | undefined, championshipId: string | undefined) {
  return useQuery({
    queryKey: ['pool_season_bets', 'my', userId, championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_season_bets')
        .select('*, team:teams(*), player:players(*), category:categories(*)')
        .eq('user_id', userId!)
        .eq('championship_id', championshipId!)
      if (error) throw error
      return data as PoolSeasonBet[]
    },
    enabled: !!userId && !!championshipId,
  })
}

export function useSavePoolSeasonBet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bet: {
      id?: string
      user_id: string
      championship_id: string
      category_id: string
      user_email: string
      bet_type: PoolSeasonBetType
      team_id?: string | null
      player_id?: string | null
    }) => {
      if (bet.id) {
        const { error } = await supabase
          .from('pool_season_bets')
          .update({ team_id: bet.team_id, player_id: bet.player_id, updated_at: new Date().toISOString() })
          .eq('id', bet.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pool_season_bets')
          .insert(bet)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool_season_bets'] })
    },
  })
}
