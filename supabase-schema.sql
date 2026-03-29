-- =============================================
-- FUTEBOL PAULISTANO - Schema Completo
-- Cole este SQL no SQL Editor do Supabase
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CORE TABLES
-- =============================================

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('Livre', 'Master', 'Veterano')),
  created_at TIMESTAMPTZ DEFAULT now(),
  display_order INT DEFAULT 0,
  description TEXT
);

CREATE TABLE championships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  season_year INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE championship_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  turns INT DEFAULT 1 CHECK (turns IN (1, 2)),
  qualify_count INT DEFAULT 4,
  has_third_place BOOLEAN DEFAULT true,
  custom_title TEXT,
  custom_description TEXT
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  shield_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  championship_id UUID NOT NULL REFERENCES championships(id),
  primary_color TEXT DEFAULT '#1d4ed8',
  secondary_color TEXT DEFAULT '#ffffff'
);

CREATE TABLE team_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id)
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  photo_url TEXT
);

CREATE TABLE player_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  positions TEXT[] DEFAULT '{}',
  is_captain BOOLEAN DEFAULT false,
  jersey_number INT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'injured', 'withdrawn')),
  status_note TEXT,
  replaced_by UUID REFERENCES players(id),
  status_changed_at TIMESTAMPTZ
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  phase TEXT NOT NULL CHECK (phase IN ('grupos', 'semifinal', 'terceiro_lugar', 'final')),
  home_team_id UUID NOT NULL REFERENCES teams(id),
  away_team_id UUID NOT NULL REFERENCES teams(id),
  match_date TIMESTAMPTZ,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'finished')),
  home_score INT,
  away_score INT,
  home_score_extra INT,
  away_score_extra INT,
  home_penalties INT,
  away_penalties INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  motm_player_id UUID REFERENCES players(id),
  home_fouls INT DEFAULT 0,
  away_fouls INT DEFAULT 0,
  match_state TEXT DEFAULT 'pre_match' CHECK (match_state IN ('pre_match', 'first_half', 'halftime', 'second_half', 'finished')),
  half_start_time TIMESTAMPTZ,
  round INT DEFAULT 1 CHECK (round IN (1, 2)),
  voting_open BOOLEAN DEFAULT false,
  voting_closed_at TIMESTAMPTZ
);

CREATE TABLE match_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('goal', 'own_goal', 'yellow_card', 'red_card')),
  minute INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  half INT DEFAULT 1 CHECK (half IN (1, 2))
);

CREATE TABLE suspensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  match_id_origin UUID NOT NULL REFERENCES matches(id),
  reason TEXT NOT NULL CHECK (reason IN ('three_yellows', 'red_card')),
  suspended_for_match_id UUID REFERENCES matches(id),
  served BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE match_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  present BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE match_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE motm_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  player_id UUID NOT NULL REFERENCES players(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_game_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_game_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_player_id UUID NOT NULL REFERENCES players(id),
  voted_player_id UUID NOT NULL REFERENCES players(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tactical_boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  match_id UUID REFERENCES matches(id),
  name TEXT NOT NULL DEFAULT 'Formação',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  drawings JSONB DEFAULT '[]',
  scenario TEXT DEFAULT 'Ataque',
  scenario_index INT DEFAULT 0
);

CREATE TABLE tactical_board_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL,
  player_id UUID REFERENCES players(id),
  team_side TEXT NOT NULL CHECK (team_side IN ('home', 'away')),
  label TEXT NOT NULL,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 50,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 50,
  jersey_number INT
);

CREATE TABLE friendly_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  challenger_team_id UUID NOT NULL REFERENCES teams(id),
  challenger_user_id UUID NOT NULL REFERENCES auth.users(id),
  opponent_team_id UUID REFERENCES teams(id),
  accepted_by_user_id UUID REFERENCES auth.users(id),
  match_date DATE NOT NULL,
  match_time TEXT NOT NULL CHECK (match_time IN ('19:00', '20:00', '21:00')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'cancelled')),
  location TEXT DEFAULT 'Campo do Condomínio',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE friendly_blocked_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocked_date DATE NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE referees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  roles TEXT[] DEFAULT ARRAY['field', 'table'],
  user_id UUID UNIQUE REFERENCES auth.users(id)
);

CREATE TABLE match_referees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES referees(id),
  role TEXT NOT NULL CHECK (role IN ('field_1', 'field_2', 'table')),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE food_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id),
  player_id UUID NOT NULL REFERENCES players(id),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  reason TEXT NOT NULL CHECK (reason IN ('yellow_card', 'red_card')),
  required_kg INT NOT NULL,
  delivered BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (match_id, player_id, reason)
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'public' CHECK (role IN ('admin', 'public')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bolão tables
CREATE TABLE pool_match_bets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  home_score INT NOT NULL CHECK (home_score >= 0),
  away_score INT NOT NULL CHECK (away_score >= 0),
  points INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, match_id)
);

CREATE TABLE pool_season_bets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  championship_id UUID NOT NULL REFERENCES championships(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  user_email TEXT NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('champion', 'runner_up', 'third_place', 'top_scorer', 'champion_cinema', 'relegated_cinema')),
  team_id UUID REFERENCES teams(id),
  player_id UUID REFERENCES players(id),
  points INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, championship_id, category_id, bet_type)
);

-- =============================================
-- VIEWS
-- =============================================

CREATE OR REPLACE VIEW standings AS
SELECT
  m.championship_id,
  tc.category_id,
  t.id AS team_id,
  t.name AS team_name,
  t.shield_url,
  COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos') AS matches_played,
  COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos' AND (
    (t.id = m.home_team_id AND m.home_score > m.away_score) OR
    (t.id = m.away_team_id AND m.away_score > m.home_score)
  )) AS wins,
  COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos' AND m.home_score = m.away_score) AS draws,
  COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos' AND (
    (t.id = m.home_team_id AND m.home_score < m.away_score) OR
    (t.id = m.away_team_id AND m.away_score < m.home_score)
  )) AS losses,
  COALESCE(SUM(CASE WHEN m.status = 'finished' AND m.phase = 'grupos' THEN
    CASE WHEN t.id = m.home_team_id THEN m.home_score ELSE m.away_score END
  END), 0)::INT AS goals_for,
  COALESCE(SUM(CASE WHEN m.status = 'finished' AND m.phase = 'grupos' THEN
    CASE WHEN t.id = m.home_team_id THEN m.away_score ELSE m.home_score END
  END), 0)::INT AS goals_against,
  COALESCE(SUM(CASE WHEN m.status = 'finished' AND m.phase = 'grupos' THEN
    CASE WHEN t.id = m.home_team_id THEN m.home_score - m.away_score ELSE m.away_score - m.home_score END
  END), 0)::INT AS goal_difference,
  (COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos' AND (
    (t.id = m.home_team_id AND m.home_score > m.away_score) OR
    (t.id = m.away_team_id AND m.away_score > m.home_score)
  )) * 3 +
  COUNT(*) FILTER (WHERE m.status = 'finished' AND m.phase = 'grupos' AND m.home_score = m.away_score))::INT AS points,
  COALESCE((SELECT COUNT(*) FROM match_events me WHERE me.match_id = ANY(ARRAY_AGG(m.id)) AND me.team_id = t.id AND me.event_type = 'yellow_card'), 0)::INT AS yellow_cards,
  COALESCE((SELECT COUNT(*) FROM match_events me WHERE me.match_id = ANY(ARRAY_AGG(m.id)) AND me.team_id = t.id AND me.event_type = 'red_card'), 0)::INT AS red_cards
FROM teams t
JOIN team_categories tc ON tc.team_id = t.id
JOIN matches m ON m.championship_id = t.championship_id
  AND m.category_id = tc.category_id
  AND (m.home_team_id = t.id OR m.away_team_id = t.id)
GROUP BY m.championship_id, tc.category_id, t.id, t.name, t.shield_url;

CREATE OR REPLACE VIEW top_scorers AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  pt.team_id,
  t.name AS team_name,
  m.championship_id,
  m.category_id,
  COUNT(*)::INT AS goals
FROM match_events me
JOIN matches m ON m.id = me.match_id
JOIN players p ON p.id = me.player_id
JOIN player_teams pt ON pt.player_id = p.id AND pt.team_id = me.team_id AND pt.category_id = m.category_id
JOIN teams t ON t.id = pt.team_id
WHERE me.event_type = 'goal'
GROUP BY p.id, p.name, pt.team_id, t.name, m.championship_id, m.category_id
ORDER BY goals DESC;

CREATE OR REPLACE VIEW player_yellow_counts AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  m.championship_id,
  m.category_id,
  me.team_id,
  COUNT(*)::INT AS yellow_count
FROM match_events me
JOIN matches m ON m.id = me.match_id
JOIN players p ON p.id = me.player_id
WHERE me.event_type = 'yellow_card'
GROUP BY p.id, p.name, m.championship_id, m.category_id, me.team_id;

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE motm_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_game_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_game_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_board_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendly_blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_match_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_season_bets ENABLE ROW LEVEL SECURITY;

-- Read policies (public access)
CREATE POLICY "Public read" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON championships FOR SELECT USING (true);
CREATE POLICY "Public read" ON championship_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON players FOR SELECT USING (true);
CREATE POLICY "Public read" ON player_teams FOR SELECT USING (true);
CREATE POLICY "Public read" ON matches FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_events FOR SELECT USING (true);
CREATE POLICY "Public read" ON suspensions FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_attendance FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_messages FOR SELECT USING (true);
CREATE POLICY "Public read" ON motm_votes FOR SELECT USING (true);
CREATE POLICY "Public read" ON post_game_comments FOR SELECT USING (true);
CREATE POLICY "Public read" ON post_game_votes FOR SELECT USING (true);
CREATE POLICY "Public read" ON tactical_boards FOR SELECT USING (true);
CREATE POLICY "Public read" ON tactical_board_players FOR SELECT USING (true);
CREATE POLICY "Public read" ON friendly_challenges FOR SELECT USING (true);
CREATE POLICY "Public read" ON friendly_blocked_dates FOR SELECT USING (true);
CREATE POLICY "Public read" ON referees FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_referees FOR SELECT USING (true);
CREATE POLICY "Public read" ON food_donations FOR SELECT USING (true);
CREATE POLICY "Public read" ON user_roles FOR SELECT USING (true);
CREATE POLICY "Public read" ON pool_match_bets FOR SELECT USING (true);
CREATE POLICY "Public read" ON pool_season_bets FOR SELECT USING (true);

-- Write policies (authenticated users)
CREATE POLICY "Auth write" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON championships FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON championship_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON team_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON player_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON match_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON suspensions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON match_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON match_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth write" ON motm_votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON post_game_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth write" ON post_game_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth write" ON tactical_boards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON tactical_board_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON friendly_challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON friendly_blocked_dates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON referees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON match_referees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON food_donations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Auth write" ON user_roles FOR ALL USING (true) WITH CHECK (true);

-- Pool bets: users manage their own
CREATE POLICY "Users insert own bets" ON pool_match_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bets" ON pool_match_bets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own season bets" ON pool_season_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own season bets" ON pool_season_bets FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_pool_match_bets_user ON pool_match_bets(user_id);
CREATE INDEX idx_pool_match_bets_match ON pool_match_bets(match_id);
CREATE INDEX idx_pool_season_bets_user ON pool_season_bets(user_id);
CREATE INDEX idx_pool_season_bets_championship ON pool_season_bets(championship_id);

-- =============================================
-- FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION calculate_pool_points(p_match_id UUID)
RETURNS void AS $$
DECLARE
  v_home_score INT;
  v_away_score INT;
  bet RECORD;
  v_points INT;
  v_bet_result TEXT;
  v_actual_result TEXT;
  v_winner_bet_goals INT;
  v_winner_actual_goals INT;
  v_loser_bet_goals INT;
  v_loser_actual_goals INT;
BEGIN
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM matches WHERE id = p_match_id AND status = 'finished';
  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  FOR bet IN SELECT * FROM pool_match_bets WHERE match_id = p_match_id LOOP
    IF bet.home_score = v_home_score AND bet.away_score = v_away_score THEN
      v_points := 15;
    ELSE
      v_bet_result := CASE WHEN bet.home_score > bet.away_score THEN 'home' WHEN bet.home_score < bet.away_score THEN 'away' ELSE 'draw' END;
      v_actual_result := CASE WHEN v_home_score > v_away_score THEN 'home' WHEN v_home_score < v_away_score THEN 'away' ELSE 'draw' END;
      IF v_bet_result = v_actual_result THEN
        IF v_bet_result = 'draw' THEN v_points := 5;
        ELSE
          IF v_bet_result = 'home' THEN
            v_winner_bet_goals := bet.home_score; v_winner_actual_goals := v_home_score;
            v_loser_bet_goals := bet.away_score; v_loser_actual_goals := v_away_score;
          ELSE
            v_winner_bet_goals := bet.away_score; v_winner_actual_goals := v_away_score;
            v_loser_bet_goals := bet.home_score; v_loser_actual_goals := v_home_score;
          END IF;
          IF v_winner_bet_goals = v_winner_actual_goals THEN v_points := 10;
          ELSIF v_loser_bet_goals = v_loser_actual_goals THEN v_points := 8;
          ELSIF (bet.home_score - bet.away_score) = (v_home_score - v_away_score) THEN v_points := 6;
          ELSE v_points := 5;
          END IF;
        END IF;
      ELSE
        IF bet.home_score = v_home_score OR bet.away_score = v_away_score THEN v_points := 2;
        ELSE v_points := 0;
        END IF;
      END IF;
    END IF;
    UPDATE pool_match_bets SET points = v_points, updated_at = now() WHERE id = bet.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = p_email LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SEED DATA: Categories
-- =============================================

INSERT INTO categories (name, display_order, description) VALUES
  ('Livre', 1, 'Categoria Livre - Sem restrição de idade'),
  ('Master', 2, 'Categoria Master'),
  ('Veterano', 3, 'Categoria Veterano');
