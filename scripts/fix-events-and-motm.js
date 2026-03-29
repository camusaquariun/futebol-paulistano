import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://euufoowdghcczoovulfq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1dWZvb3dkZ2hjY3pvb3Z1bGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTY3ODAsImV4cCI6MjA5MDIzMjc4MH0.D4ue1yXLWulLSW7pKHf_8S9NkdSgwg0yDM2QisRZmP8'
)

function spreadMinutes(count, max = 24) {
  if (count === 0) return []
  // Distribute events at roughly equal intervals, with small random variation
  const base = Math.floor(max / (count + 1))
  return Array.from({ length: count }, (_, i) => {
    const m = (i + 1) * base + Math.floor(Math.random() * 2)
    return Math.min(max, Math.max(1, m))
  }).sort((a, b) => a - b)
}

async function main() {
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score, motm_player_id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
    .eq('status', 'finished')

  if (mErr) { console.error('Error fetching matches:', mErr); process.exit(1) }
  console.log(`Found ${matches.length} finished matches\n`)

  for (const match of matches) {
    const label = `${match.home_team?.name} ${match.home_score ?? '?'}-${match.away_score ?? '?'} ${match.away_team?.name}`

    const { data: events } = await supabase
      .from('match_events')
      .select('id, event_type, half, minute, player_id, team_id')
      .eq('match_id', match.id)
      .order('created_at')

    if (!events || events.length === 0) {
      console.log(`[SKIP] ${label}: no events`)
      continue
    }

    // Fix minutes per half
    const h1 = events.filter(e => e.half === 1)
    const h2 = events.filter(e => e.half === 2)

    // If half is null/undefined, split by order
    const noHalf = events.filter(e => !e.half)
    if (noHalf.length > 0 && h1.length === 0 && h2.length === 0) {
      const mid = Math.ceil(noHalf.length / 2)
      const m1 = spreadMinutes(mid)
      const m2 = spreadMinutes(noHalf.length - mid)
      for (let i = 0; i < mid; i++) {
        await supabase.from('match_events').update({ half: 1, minute: m1[i] }).eq('id', noHalf[i].id)
      }
      for (let i = 0; i < noHalf.length - mid; i++) {
        await supabase.from('match_events').update({ half: 2, minute: m2[i] }).eq('id', noHalf[mid + i].id)
      }
    } else {
      const m1 = spreadMinutes(h1.length)
      const m2 = spreadMinutes(h2.length)
      for (let i = 0; i < h1.length; i++) {
        await supabase.from('match_events').update({ minute: m1[i] }).eq('id', h1[i].id)
      }
      for (let i = 0; i < h2.length; i++) {
        await supabase.from('match_events').update({ minute: m2[i] }).eq('id', h2[i].id)
      }
    }

    // Pick MOTM if not already set
    if (!match.motm_player_id) {
      const goals = events.filter(e => e.event_type === 'goal' && e.player_id)
      let motmPlayerId = null

      if (goals.length > 0) {
        const goalMap = {}
        for (const g of goals) goalMap[g.player_id] = (goalMap[g.player_id] || 0) + 1
        motmPlayerId = Object.entries(goalMap).sort((a, b) => b[1] - a[1])[0][0]
      } else {
        // Pick from winning team or any event player
        const homeScore = match.home_score ?? 0
        const awayScore = match.away_score ?? 0
        const winnerTeamId = homeScore > awayScore
          ? match.home_team_id
          : awayScore > homeScore
          ? match.away_team_id
          : null
        const candidate = winnerTeamId
          ? events.find(e => e.team_id === winnerTeamId && e.player_id)
          : events.find(e => e.player_id)
        motmPlayerId = candidate?.player_id ?? null
      }

      if (motmPlayerId) {
        await supabase.from('matches').update({ motm_player_id: motmPlayerId }).eq('id', match.id)
        const { data: p } = await supabase.from('players').select('name').eq('id', motmPlayerId).single()
        console.log(`[OK] ${label} → Destaque: ${p?.name} (${events.length} eventos corrigidos)`)
      } else {
        console.log(`[WARN] ${label}: eventos corrigidos mas sem jogador para MOTM`)
      }
    } else {
      const { data: p } = await supabase.from('players').select('name').eq('id', match.motm_player_id).single()
      console.log(`[OK] ${label} → Destaque já definido: ${p?.name} (${events.length} eventos corrigidos)`)
    }
  }

  console.log('\nConcluído!')
}

main().catch(console.error)
