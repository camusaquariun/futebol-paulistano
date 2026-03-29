import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  'https://euufoowdghcczoovulfq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dWZvb3dkZ2hjY3pvb3Z1bGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTY3ODAsImV4cCI6MjA5MDIzMjc4MH0.D4ue1yXLWulLSW7pKHf_8S9NkdSgwg0yDM2QisRZmP8'
)

// Same logic as pool-points.ts
function calculateMatchPoints(betHome, betAway, actualHome, actualAway) {
  if (betHome === actualHome && betAway === actualAway) return 15
  const betResult = betHome > betAway ? 'home' : betHome < betAway ? 'away' : 'draw'
  const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw'
  if (betResult === actualResult) {
    if (betResult === 'draw') return 5
    const winnerBetGoals = betResult === 'home' ? betHome : betAway
    const winnerActualGoals = actualResult === 'home' ? actualHome : actualAway
    const loserBetGoals = betResult === 'home' ? betAway : betHome
    const loserActualGoals = actualResult === 'home' ? actualAway : actualHome
    if (winnerBetGoals === winnerActualGoals) return 10
    if (loserBetGoals === loserActualGoals) return 8
    if ((betHome - betAway) === (actualHome - actualAway)) return 6
    return 5
  }
  if (betHome === actualHome || betAway === actualAway) return 2
  return 0
}

// Seeded random always returning [0, 1)
function rand(seed) {
  const x = Math.sin(seed + 1) * 43758.5453123
  return x - Math.floor(x)
}

const nn = (v) => Math.max(0, Math.round(v)) // non-negative integer

// Generate a realistic bet prediction for a given actual score
function generateBet(homeActual, awayActual, seed) {
  const r  = rand(seed)
  const r2 = rand(seed + 1000)
  const r3 = rand(seed + 2000)
  const actualResult = homeActual > awayActual ? 'H' : homeActual < awayActual ? 'A' : 'D'

  // ~6%: exact score (15 pts)
  if (r < 0.06) return { home: homeActual, away: awayActual }

  // ~44%: correct direction (5–10 pts)
  if (r < 0.50) {
    if (actualResult === 'D') {
      const options = [0, 1, 1, 2, 2, 3]
      const s = options[Math.floor(r2 * options.length)]
      return s === homeActual ? { home: s + 1, away: s + 1 } : { home: s, away: s }
    }
    if (actualResult === 'H') {
      const h = Math.max(1, homeActual + Math.round(r2 * 2 - 1))
      const a = nn(r3 * Math.max(0, h - 1))
      if (h === homeActual && a === awayActual) return { home: h + 1, away: a }
      return { home: h, away: Math.min(a, h - 1) }
    }
    // actualResult === 'A'
    const a = Math.max(1, awayActual + Math.round(r2 * 2 - 1))
    const h = nn(r3 * Math.max(0, a - 1))
    if (a === awayActual && h === homeActual) return { home: h, away: a + 1 }
    return { home: Math.min(h, a - 1), away: a }
  }

  // ~50%: wrong direction (0–2 pts)
  if (actualResult === 'H') {
    // bet away win or draw
    if (r2 < 0.5) {
      const a = nn(r3 * 3) + 1  // 1–4
      return { home: nn(r2 * a), away: a }  // home <= away → away win (sometimes draw if equal)
    }
    const s = nn(r3 * 3)
    return { home: s, away: s }  // draw
  }
  if (actualResult === 'A') {
    // bet home win or draw
    if (r2 < 0.5) {
      const h = nn(r3 * 3) + 1
      return { home: h, away: nn(r2 * h) }
    }
    const s = nn(r3 * 3)
    return { home: s, away: s }
  }
  // actualResult === 'D' → bet a winner
  if (r2 < 0.5) {
    const h = nn(r3 * 3) + 1
    return { home: h, away: nn(r2 * (h - 1)) }
  }
  const a = nn(r3 * 3) + 1
  return { home: nn(r2 * (a - 1)), away: a }
}

function nameToEmail(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    + '@bolao.demo'
}

// Create a deterministic UUID-like user_id from player_id
// Uses a prefix so it's clearly fake but looks like a UUID
function playerToUserId(playerId) {
  // Flip parts of the UUID to get a unique fake user ID
  const parts = playerId.split('-')
  return `${parts[4]}-${parts[3]}-${parts[2]}-${parts[1]}-${parts[0]}`
}

async function main() {
  console.log('🎲 Seeding pool bets for demo...\n')

  // Get active championship
  const { data: championships } = await supabase
    .from('championships')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
  if (!championships || championships.length === 0) {
    console.error('No active championship found')
    process.exit(1)
  }
  const championship = championships[0]
  console.log(`📅 Championship: ${championship.name}`)

  // Get all teams in championship
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('championship_id', championship.id)
  if (!teams || teams.length === 0) {
    console.error('No teams found')
    process.exit(1)
  }
  const teamIds = teams.map(t => t.id)

  // Get players via player_teams (up to 50, deduplicated)
  const { data: playerTeams } = await supabase
    .from('player_teams')
    .select('player_id, player:players!player_teams_player_id_fkey(id, name)')
    .in('team_id', teamIds)
    .eq('status', 'active')
  if (!playerTeams) { console.error('No players found'); process.exit(1) }

  const seen = new Set()
  const players = []
  for (const pt of playerTeams) {
    if (pt.player && !seen.has(pt.player.id)) {
      seen.add(pt.player.id)
      players.push(pt.player)
    }
    if (players.length >= 50) break
  }
  console.log(`👥 ${players.length} players selected for pool\n`)

  // Get all finished matches in championship
  const { data: matches } = await supabase
    .from('matches')
    .select('id, home_score, away_score, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
    .eq('championship_id', championship.id)
    .eq('status', 'finished')
  if (!matches || matches.length === 0) {
    console.error('No finished matches found')
    process.exit(1)
  }
  console.log(`⚽ ${matches.length} finished matches found\n`)

  // Generate bets
  const bets = []
  for (const match of matches) {
    if (match.home_score == null || match.away_score == null) continue
    const label = `${match.home_team?.name} ${match.home_score}-${match.away_score} ${match.away_team?.name}`
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const seed = i + 1 + matches.indexOf(match) * 100
      const bet = generateBet(match.home_score, match.away_score, seed)
      const points = calculateMatchPoints(bet.home, bet.away, match.home_score, match.away_score)
      bets.push({
        user_id: playerToUserId(player.id),
        user_email: nameToEmail(player.name),
        match_id: match.id,
        home_score: bet.home,
        away_score: bet.away,
        points,
      })
    }
    console.log(`  ✓ ${label} — ${players.length} apostas`)
  }

  // Generate SQL file (FK bypass needed since user_ids are fake)
  const sql = [
    '-- Pool bets seed — run in Supabase SQL Editor',
    `-- ${bets.length} bets: ${matches.length} matches × ${players.length} players`,
    '',
    '-- Disable FK checks for this session',
    "SET session_replication_role = 'replica';",
    '',
    "DELETE FROM pool_match_bets WHERE user_email LIKE '%@bolao.demo';",
    '',
    'INSERT INTO pool_match_bets (user_id, user_email, match_id, home_score, away_score, points) VALUES',
    ...bets.map((b, i) =>
      `  ('${b.user_id}','${b.user_email}','${b.match_id}',${b.home_score},${b.away_score},${b.points})${i < bets.length - 1 ? ',' : ';'}`
    ),
    '',
    '-- Re-enable FK checks',
    "SET session_replication_role = 'origin';",
  ].join('\n')

  const outPath = 'scripts/pool-bets-seed.sql'
  writeFileSync(outPath, sql, 'utf8')

  const pts = bets.map(b => b.points)
  const exact = pts.filter(p => p === 15).length
  const scored = pts.filter(p => p > 0).length
  const zero = pts.filter(p => p === 0).length

  console.log(`\n✅ SQL gerado: ${outPath}`)
  console.log(`   ${bets.length} apostas | Exato: ${exact} (${(exact/bets.length*100).toFixed(1)}%) | Pontuaram: ${scored} | Zerados: ${zero}`)
  console.log('\n📋 Próximo passo:')
  console.log('   Supabase Dashboard → SQL Editor → cole o arquivo e clique Run')
}

main().catch(console.error)
