export type CategoryName = 'Livre' | 'Master' | 'Veterano'
export type ChampionshipStatus = 'draft' | 'active' | 'finished'
export type MatchPhase = 'grupos' | 'semifinal' | 'terceiro_lugar' | 'final'
export type MatchStatus = 'scheduled' | 'finished'
export type EventType = 'goal' | 'own_goal' | 'yellow_card' | 'red_card'
export type SuspensionReason = 'three_yellows' | 'red_card'

export interface Category {
  id: string
  name: CategoryName
  display_order: number
  description: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  shield_url: string | null
  championship_id: string
  primary_color: string
  secondary_color: string
  created_at: string
}

export interface TeamCategory {
  id: string
  team_id: string
  category_id: string
}

export interface Player {
  id: string
  name: string
  user_id: string | null
  photo_url: string | null
  created_at: string
}

export type PlayerPosition = 'Goleiro' | 'Zagueiro' | 'Ala' | 'Meio-campo' | 'Meia-atacante' | 'Atacante' | 'Centroavante' | 'Jogador'

export const ALL_POSITIONS: PlayerPosition[] = ['Goleiro', 'Zagueiro', 'Ala', 'Meio-campo', 'Meia-atacante', 'Atacante', 'Centroavante']

export interface PlayerTeam {
  id: string
  player_id: string
  team_id: string
  category_id: string
  positions: string[]
  is_captain: boolean
  jersey_number: number | null
  status: 'active' | 'injured' | 'withdrawn'
  status_note: string | null
  replaced_by: string | null
  player?: Player
  team?: Team
  category?: Category
}

export interface Championship {
  id: string
  name: string
  season_year: number
  status: ChampionshipStatus
  created_at: string
}

export interface ChampionshipCategory {
  id: string
  championship_id: string
  category_id: string
  turns: number
  qualify_count: number
  has_third_place: boolean
}

export interface Match {
  id: string
  championship_id: string
  category_id: string
  phase: MatchPhase
  home_team_id: string
  away_team_id: string
  match_date: string | null
  location: string | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  home_score_extra: number | null
  away_score_extra: number | null
  home_penalties: number | null
  away_penalties: number | null
  motm_player_id: string | null
  home_fouls: number
  away_fouls: number
  home_fouls_1h: number | null
  away_fouls_1h: number | null
  home_fouls_2h: number | null
  away_fouls_2h: number | null
  round: number
  matchday: number | null
  match_state: 'pre_match' | 'first_half' | 'halftime' | 'second_half' | 'finished'
  half_start_time: string | null
  voting_open: boolean
  voting_closed_at: string | null
  created_at: string
  home_team?: Team
  away_team?: Team
  category?: Category
  motm_player?: Player
}

export interface MatchEvent {
  id: string
  match_id: string
  player_id: string
  team_id: string
  event_type: EventType
  minute: number | null
  half: number
  created_at: string
  player?: Player
  team?: Team
}

export interface Suspension {
  id: string
  player_id: string
  championship_id: string
  category_id: string
  match_id_origin: string
  reason: SuspensionReason
  suspended_for_match_id: string | null
  served: boolean
  created_at: string
  player?: Player
  category?: Category
  match_origin?: Match
}

export interface Standing {
  championship_id: string
  category_id: string
  team_id: string
  team_name: string
  shield_url: string | null
  matches_played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  yellow_cards: number
  red_cards: number
}

export interface TopScorer {
  player_id: string
  player_name: string
  team_id: string
  team_name: string
  championship_id: string
  category_id: string
  goals: number
}

// Bolão (Betting Pool)
export type PoolSeasonBetType = 'champion' | 'runner_up' | 'third_place' | 'top_scorer' | 'champion_cinema' | 'relegated_cinema'

export interface PoolMatchBet {
  id: string
  user_id: string
  match_id: string
  user_email: string
  home_score: number
  away_score: number
  points: number | null
  created_at: string
  updated_at: string
  match?: Match
}

export interface PoolSeasonBet {
  id: string
  user_id: string
  championship_id: string
  category_id: string
  user_email: string
  bet_type: PoolSeasonBetType
  team_id: string | null
  player_id: string | null
  points: number | null
  created_at: string
  updated_at: string
  team?: Team
  player?: Player
  category?: Category
}
