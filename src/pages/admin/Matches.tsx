import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMatches, useCategories, useTeamsByCategory, useSaveMatch, useChampionshipCategories, useMatchEvents, useTeamRoster } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar, Plus, Edit, ChevronRight, Star, Trash2, Pencil, Undo2, Zap } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { MatchPhase } from '@/types/database'

const VALID_DAYS = [1, 2, 4] // Monday, Tuesday, Thursday
const DAY_NAMES: Record<number, string> = { 1: 'Seg', 2: 'Ter', 4: 'Qui' }

function toLocalISOString(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const mm = String(Math.abs(off) % 60).padStart(2, '0')
  return `${date}T${time}:00${sign}${hh}:${mm}`
}

function getValidDates(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (dates.length < count) {
    if (VALID_DAYS.includes(d.getDay())) dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const day = DAY_NAMES[d.getDay()] ?? ''
  return `${day}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

// Searchable combobox for MOTM player selection.
function MotmCombobox({ players, homeName, awayName, homeId, value, onChange }: {
  players: { id: string; name: string; jersey_number: number | null; teamId: string }[]
  homeName?: string
  awayName?: string
  homeId?: string
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = players.find(p => p.id === value)
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const q = norm(query)
  const filtered = q
    ? players.filter(p => norm(p.name).includes(q) || (p.jersey_number != null && String(p.jersey_number).includes(q)))
    : players
  const labelFor = (p: { name: string; jersey_number: number | null; teamId: string }) =>
    `${p.jersey_number != null ? p.jersey_number + ' - ' : ''}${p.name} (${p.teamId === homeId ? homeName : awayName})`
  return (
    <div className="relative">
      <Label className="text-slate-400 text-xs mb-2 block">Destaque do Jogo</Label>
      <Input
        value={open ? query : (selected ? labelFor(selected) : '')}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        placeholder="Digite para buscar um jogador..."
        className="bg-navy-700 border-navy-600"
      />
      {selected && !open && (
        <button type="button" onClick={() => onChange('')}
          className="absolute right-2 top-9 text-slate-400 hover:text-white text-xs">✕</button>
      )}
      {open && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-navy-800 border border-navy-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          <button type="button"
            onMouseDown={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-navy-700">
            — Nenhum —
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Nenhum jogador encontrado</p>
          ) : filtered.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { onChange(p.id); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-navy-700 ${value === p.id ? 'bg-pitch-600/20 text-pitch-300' : 'text-white'}`}>
              {labelFor(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MatchesAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPhase, setFilterPhase] = useState<string>('all')
  const [filterMatchday, setFilterMatchday] = useState<string>('all')
  const { data: matches, isLoading } = useMatches(championshipId, filterCategory !== 'all' ? filterCategory : undefined)

  const saveMutation = useSaveMatch()
  const queryClient = useQueryClient()
  const validDates = useMemo(() => getValidDates(24), [])
  const [open, setOpen] = useState(false)
  // Schedule editor
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleMatchId, setScheduleMatchId] = useState('')
  const [scheduleDay, setScheduleDay] = useState('')
  const [scheduleTime, setScheduleTime] = useState('20:00')
  const [scheduleLocation, setScheduleLocation] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [phase, setPhase] = useState<MatchPhase>('grupos')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('20:00')
  const [location, setLocation] = useState('')
  const [round, setRound] = useState(1)
  const { data: teamsForCategory } = useTeamsByCategory(championshipId, categoryId || undefined)

  // Edit match state
  const [editOpen, setEditOpen] = useState(false)
  const [editMatchId, setEditMatchId] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editPhase, setEditPhase] = useState<MatchPhase>('grupos')
  const [editHomeTeamId, setEditHomeTeamId] = useState('')
  const [editAwayTeamId, setEditAwayTeamId] = useState('')
  const [editMatchDate, setEditMatchDate] = useState('')
  const [editMatchTime, setEditMatchTime] = useState('20:00')
  const [editLocation, setEditLocation] = useState('')
  const [editRound, setEditRound] = useState(1)
  const [editSaving, setEditSaving] = useState(false)
  const { data: teamsForEditCategory } = useTeamsByCategory(championshipId, editCategoryId || undefined)

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null)

  // Events editor state
  const [eventsOpen, setEventsOpen] = useState(false)
  const [eventsMatch, setEventsMatch] = useState<any>(null)
  const [evtEditId, setEvtEditId] = useState<string | null>(null)
  const [evtEditType, setEvtEditType] = useState<'goal' | 'own_goal' | 'yellow_card' | 'red_card'>('goal')
  const [evtEditPlayer, setEvtEditPlayer] = useState('')
  const [evtEditMinute, setEvtEditMinute] = useState('')
  const [evtEditHalf, setEvtEditHalf] = useState(1)
  const [addingEvent, setAddingEvent] = useState(false)
  const [newEvtTeam, setNewEvtTeam] = useState('')
  const [newEvtType, setNewEvtType] = useState<'goal' | 'own_goal' | 'yellow_card' | 'red_card'>('goal')
  const [newEvtPlayer, setNewEvtPlayer] = useState('')
  const [newEvtMinute, setNewEvtMinute] = useState('')
  const [newEvtHalf, setNewEvtHalf] = useState(1)

  const { data: eventsMatchEvents, refetch: refetchEventsMatchEvents } = useMatchEvents(eventsMatch?.id)
  const { data: eventsHomeRoster } = useTeamRoster(eventsMatch?.home_team_id, eventsMatch?.category_id)
  const { data: eventsAwayRoster } = useTeamRoster(eventsMatch?.away_team_id, eventsMatch?.category_id)

  // Quick finalize state
  const [qfOpen, setQfOpen] = useState(false)
  const [qfMatch, setQfMatch] = useState<any>(null)
  const [qfHomeScore, setQfHomeScore] = useState(0)
  const [qfAwayScore, setQfAwayScore] = useState(0)
  const [qfHomeFouls, setQfHomeFouls] = useState(0)
  const [qfAwayFouls, setQfAwayFouls] = useState(0)
  const [qfMotm, setQfMotm] = useState('')
  // Per-player stat tally for quick finalize
  // Map: player_id -> { goals, yellow, red }
  const [qfPlayerStats, setQfPlayerStats] = useState<Record<string, { goals: number; yellow: number; red: number }>>({})
  const [qfOwnGoalsHome, setQfOwnGoalsHome] = useState(0)
  const [qfOwnGoalsAway, setQfOwnGoalsAway] = useState(0)
  // Referees: 1 table + up to 2 field
  const [qfRefTable, setQfRefTable] = useState('')
  const [qfRefField1, setQfRefField1] = useState('')
  const [qfRefField2, setQfRefField2] = useState('')

  const { data: qfReferees } = useQuery({
    queryKey: ['referees_list'],
    queryFn: async () => {
      const { data } = await supabase.from('referees').select('id, name, roles').order('name')
      return (data ?? []) as { id: string; name: string; roles: string[] | null }[]
    },
  })
  const [qfSaving, setQfSaving] = useState(false)
  const [qfPresentPlayers, setQfPresentPlayers] = useState<Set<string>>(new Set())
  const [qfRosterLoaded, setQfRosterLoaded] = useState(false)

  const { data: qfHomeRoster } = useTeamRoster(qfMatch?.home_team_id, qfMatch?.category_id)
  const { data: qfAwayRoster } = useTeamRoster(qfMatch?.away_team_id, qfMatch?.category_id)

  const qfAllPlayers = useMemo(() => {
    const home = qfHomeRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, teamId: qfMatch?.home_team_id })) ?? []
    const away = qfAwayRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, teamId: qfMatch?.away_team_id })) ?? []
    return [...home, ...away]
  }, [qfHomeRoster, qfAwayRoster, qfMatch])

  // Auto-initialize all players as present when roster loads
  useEffect(() => {
    if (qfOpen && !qfRosterLoaded && qfAllPlayers.length > 0) {
      setQfPresentPlayers(new Set(qfAllPlayers.map(p => p.id)))
      setQfRosterLoaded(true)
    }
  }, [qfOpen, qfRosterLoaded, qfAllPlayers])

  const toggleQfPresent = (playerId: string) => {
    setQfPresentPlayers(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  const eventsAllPlayers = useMemo(() => {
    const home = eventsHomeRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, teamId: eventsMatch?.home_team_id })) ?? []
    const away = eventsAwayRoster?.map(pt => ({ ...pt.player!, jersey_number: pt.jersey_number, teamId: eventsMatch?.away_team_id })) ?? []
    return [...home, ...away]
  }, [eventsHomeRoster, eventsAwayRoster, eventsMatch])

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const openNew = () => {
    setCategoryId(activeCategories[0]?.id ?? '')
    setPhase('grupos')
    setHomeTeamId('')
    setAwayTeamId('')
    setMatchDate('')
    setLocation('')
    setRound(1)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!championshipId || !matchDate) return
    await saveMutation.mutateAsync({
      championship_id: championshipId,
      category_id: categoryId,
      phase,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDate ? toLocalISOString(matchDate, matchTime) : null,
      location: location || null,
      round,
      status: 'scheduled',
    })
    setOpen(false)
  }

  const openSchedule = (match: any) => {
    setScheduleMatchId(match.id)
    if (match.match_date) {
      const d = new Date(match.match_date)
      setScheduleDay(d.toISOString().split('T')[0])
      setScheduleTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    } else {
      setScheduleDay('')
      setScheduleTime('20:00')
    }
    setScheduleLocation(match.location ?? '')
    setScheduleOpen(true)
  }

  const handleSaveSchedule = async () => {
    if (!scheduleMatchId) return
    setScheduleSaving(true)
    const matchDate = scheduleDay ? toLocalISOString(scheduleDay, scheduleTime) : null
    await supabase.from('matches').update({
      match_date: matchDate,
      location: scheduleLocation || null,
    }).eq('id', scheduleMatchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setScheduleSaving(false)
    setScheduleOpen(false)
  }

  const handleGenerateReturnMatches = async (catId: string) => {
    if (!championshipId) return
    const catMatches = matches?.filter(m => m.category_id === catId && m.phase === 'grupos' && (m as any).round === 1) ?? []
    const existing2nd = matches?.filter(m => m.category_id === catId && m.phase === 'grupos' && (m as any).round === 2) ?? []
    if (existing2nd.length > 0) { alert('Jogos de volta já existem para esta categoria.'); return }
    if (catMatches.length === 0) { alert('Nenhum jogo de ida encontrado.'); return }
    const returnMatches = catMatches.map(m => ({
      championship_id: championshipId,
      category_id: catId,
      phase: 'grupos' as const,
      home_team_id: m.away_team_id,
      away_team_id: m.home_team_id,
      status: 'scheduled' as const,
      round: 2,
    }))
    await supabase.from('matches').insert(returnMatches)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    alert(`${returnMatches.length} jogos de volta gerados!`)
  }

  // Round-robin schedule generator
  const handleGenerateRoundRobin = async (catId: string, turnRound: number) => {
    if (!championshipId) return
    const catTeams = await supabase
      .from('teams')
      .select('id, name, team_categories!inner(category_id)')
      .eq('championship_id', championshipId)
      .eq('team_categories.category_id', catId)
      .order('name')
    const teams = catTeams.data ?? []
    if (teams.length < 2) { alert('Precisa de pelo menos 2 times.'); return }

    // Check if matches already exist for this round
    const existing = matches?.filter(m => m.category_id === catId && m.phase === 'grupos' && m.round === turnRound && m.matchday != null) ?? []
    if (existing.length > 0) {
      if (!confirm(`Já existem ${existing.length} jogos com rodadas para o ${turnRound}º turno. Deseja apagar e gerar novamente?`)) return
      await supabase.from('matches').delete().in('id', existing.map(m => m.id))
    }

    // Round-robin algorithm (circle method)
    const teamIds = teams.map(t => t.id)
    const n = teamIds.length
    const useGhost = n % 2 !== 0
    if (useGhost) teamIds.push('__ghost__')
    const total = teamIds.length
    const rounds = total - 1
    const half = total / 2

    const matchesToInsert: any[] = []
    const fixed = teamIds[0]
    const rotating = teamIds.slice(1)

    for (let r = 0; r < rounds; r++) {
      const current = [fixed, ...rotating]
      for (let i = 0; i < half; i++) {
        const home = current[i]
        const away = current[total - 1 - i]
        if (home === '__ghost__' || away === '__ghost__') continue
        const isReverse = turnRound === 2
        matchesToInsert.push({
          championship_id: championshipId,
          category_id: catId,
          phase: 'grupos' as const,
          home_team_id: isReverse ? away : home,
          away_team_id: isReverse ? home : away,
          status: 'scheduled' as const,
          round: turnRound,
          matchday: r + 1 + (turnRound === 2 ? rounds : 0),
        })
      }
      // Rotate: move last to second position
      rotating.push(rotating.shift()!)
    }

    await supabase.from('matches').insert(matchesToInsert)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    alert(`${matchesToInsert.length} jogos gerados em ${rounds} rodadas!`)
  }

  // Available matchdays for filter
  const availableMatchdays = useMemo(() => {
    const days = new Set<number>()
    matches?.forEach(m => { if (m.matchday != null) days.add(m.matchday) })
    return Array.from(days).sort((a, b) => a - b)
  }, [matches])

  const openEditMatch = (match: any) => {
    setEditMatchId(match.id)
    setEditCategoryId(match.category_id)
    setEditPhase(match.phase)
    setEditHomeTeamId(match.home_team_id)
    setEditAwayTeamId(match.away_team_id)
    setEditRound((match as any).round ?? 1)
    setEditLocation(match.location ?? '')
    if (match.match_date) {
      const d = new Date(match.match_date)
      setEditMatchDate(d.toISOString().split('T')[0])
      setEditMatchTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    } else {
      setEditMatchDate('')
      setEditMatchTime('20:00')
    }
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editMatchId) return
    setEditSaving(true)
    const dateValue = editMatchDate ? toLocalISOString(editMatchDate, editMatchTime) : null
    await supabase.from('matches').update({
      category_id: editCategoryId,
      phase: editPhase,
      home_team_id: editHomeTeamId,
      away_team_id: editAwayTeamId,
      match_date: dateValue,
      location: editLocation || null,
      round: editRound,
    }).eq('id', editMatchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setEditSaving(false)
    setEditOpen(false)
  }

  const openEventsEditor = (match: any) => {
    setEventsMatch(match)
    setEvtEditId(null)
    setAddingEvent(false)
    setNewEvtTeam(match.home_team_id)
    setNewEvtType('goal')
    setNewEvtPlayer('')
    setNewEvtMinute('')
    setNewEvtHalf(1)
    setEventsOpen(true)
  }

  const handleDeleteEvent = async (eventId: string, event: any) => {
    await supabase.from('match_events').delete().eq('id', eventId)
    // Adjust score
    if (event.event_type === 'goal' && eventsMatch) {
      if (event.team_id === eventsMatch.home_team_id) {
        const s = Math.max(0, (eventsMatch.home_score ?? 0) - 1)
        await supabase.from('matches').update({ home_score: s }).eq('id', eventsMatch.id)
      } else {
        const s = Math.max(0, (eventsMatch.away_score ?? 0) - 1)
        await supabase.from('matches').update({ away_score: s }).eq('id', eventsMatch.id)
      }
    } else if (event.event_type === 'own_goal' && eventsMatch) {
      if (event.team_id === eventsMatch.home_team_id) {
        const s = Math.max(0, (eventsMatch.away_score ?? 0) - 1)
        await supabase.from('matches').update({ away_score: s }).eq('id', eventsMatch.id)
      } else {
        const s = Math.max(0, (eventsMatch.home_score ?? 0) - 1)
        await supabase.from('matches').update({ home_score: s }).eq('id', eventsMatch.id)
      }
    }
    refetchEventsMatchEvents()
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['match_goals_bulk'] })
  }

  const handleSaveEventEdit = async () => {
    if (!evtEditId) return
    await supabase.from('match_events').update({
      event_type: evtEditType,
      player_id: evtEditType === 'own_goal' ? null : (evtEditPlayer || null),
      minute: evtEditMinute ? parseInt(evtEditMinute) : null,
      half: evtEditHalf,
    }).eq('id', evtEditId)
    setEvtEditId(null)
    refetchEventsMatchEvents()
    queryClient.invalidateQueries({ queryKey: ['match_goals_bulk'] })
  }

  const handleAddNewEvent = async () => {
    if (!eventsMatch || !newEvtMinute) return
    await supabase.from('match_events').insert({
      match_id: eventsMatch.id,
      team_id: newEvtTeam,
      event_type: newEvtType,
      player_id: newEvtType === 'own_goal' ? null : (newEvtPlayer || null),
      minute: parseInt(newEvtMinute),
      half: newEvtHalf,
    })
    // Adjust score
    if (newEvtType === 'goal') {
      if (newEvtTeam === eventsMatch.home_team_id) {
        await supabase.from('matches').update({ home_score: (eventsMatch.home_score ?? 0) + 1 }).eq('id', eventsMatch.id)
      } else {
        await supabase.from('matches').update({ away_score: (eventsMatch.away_score ?? 0) + 1 }).eq('id', eventsMatch.id)
      }
    } else if (newEvtType === 'own_goal') {
      if (newEvtTeam === eventsMatch.home_team_id) {
        await supabase.from('matches').update({ away_score: (eventsMatch.away_score ?? 0) + 1 }).eq('id', eventsMatch.id)
      } else {
        await supabase.from('matches').update({ home_score: (eventsMatch.home_score ?? 0) + 1 }).eq('id', eventsMatch.id)
      }
    }
    setNewEvtPlayer('')
    setNewEvtMinute('')
    setAddingEvent(false)
    refetchEventsMatchEvents()
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['match_goals_bulk'] })
  }

  const openQuickFinalize = async (match: any) => {
    setQfMatch(match)
    // Pre-fill score and fouls from existing match data (for editing finished matches)
    setQfHomeScore(match.home_score ?? 0)
    setQfAwayScore(match.away_score ?? 0)
    setQfHomeFouls(match.home_fouls ?? 0)
    setQfAwayFouls(match.away_fouls ?? 0)
    setQfMotm(match.motm_player_id ?? '')
    setQfPlayerStats({})
    setQfOwnGoalsHome(0)
    setQfOwnGoalsAway(0)
    setQfPresentPlayers(new Set())
    setQfRosterLoaded(false)
    // Pre-load existing referees
    setQfRefTable(''); setQfRefField1(''); setQfRefField2('')
    const { data: existingRefs } = await supabase
      .from('match_referees')
      .select('referee_id, role')
      .eq('match_id', match.id)
    for (const r of existingRefs ?? []) {
      if (r.role === 'table') setQfRefTable(r.referee_id)
      else if (r.role === 'field_1') setQfRefField1(r.referee_id)
      else if (r.role === 'field_2') setQfRefField2(r.referee_id)
    }
    // Pre-load existing events into per-player counters
    const { data: existingEvents } = await supabase
      .from('match_events')
      .select('player_id, event_type, team_id')
      .eq('match_id', match.id)
    const stats: Record<string, { goals: number; yellow: number; red: number }> = {}
    let ownHome = 0, ownAway = 0
    for (const e of existingEvents ?? []) {
      if (e.event_type === 'own_goal') {
        if (e.team_id === match.home_team_id) ownHome++
        else if (e.team_id === match.away_team_id) ownAway++
        continue
      }
      if (!e.player_id) continue
      const cur = stats[e.player_id] ?? { goals: 0, yellow: 0, red: 0 }
      if (e.event_type === 'goal') cur.goals++
      else if (e.event_type === 'yellow_card') cur.yellow++
      else if (e.event_type === 'red_card') cur.red++
      stats[e.player_id] = cur
    }
    setQfPlayerStats(stats)
    setQfOwnGoalsHome(ownHome)
    setQfOwnGoalsAway(ownAway)
    // Pre-load attendance
    const { data: existingAttendance } = await supabase
      .from('match_attendance')
      .select('player_id, present')
      .eq('match_id', match.id)
    const present = new Set<string>()
    for (const a of existingAttendance ?? []) if (a.present) present.add(a.player_id)
    setQfPresentPlayers(present)
    setQfOpen(true)
  }

  const bumpPlayerStat = (playerId: string, key: 'goals' | 'yellow' | 'red', delta: number) => {
    setQfPlayerStats(prev => {
      const cur = prev[playerId] ?? { goals: 0, yellow: 0, red: 0 }
      const next = { ...cur, [key]: Math.max(0, cur[key] + delta) }
      return { ...prev, [playerId]: next }
    })
  }

  // Sum goals attributed to each team based on player stats + own goals.
  // Own goals on side X count for the opposing team's score.
  const qfGoalsAttributed = useMemo(() => {
    let homeGoals = 0
    let awayGoals = 0
    for (const p of qfAllPlayers) {
      const g = qfPlayerStats[p.id]?.goals ?? 0
      if (p.teamId === qfMatch?.home_team_id) homeGoals += g
      else if (p.teamId === qfMatch?.away_team_id) awayGoals += g
    }
    // own goal committed by home team -> point for away
    awayGoals += qfOwnGoalsHome
    homeGoals += qfOwnGoalsAway
    return { home: homeGoals, away: awayGoals }
  }, [qfPlayerStats, qfOwnGoalsHome, qfOwnGoalsAway, qfAllPlayers, qfMatch])

  const handleQuickFinalize = async () => {
    if (!qfMatch) return
    if (qfGoalsAttributed.home !== qfHomeScore || qfGoalsAttributed.away !== qfAwayScore) {
      const ok = confirm(
        `Os gols atribuídos aos jogadores ainda não batem com o placar:\n` +
        `${qfMatch.home_team?.name}: ${qfGoalsAttributed.home}/${qfHomeScore}\n` +
        `${qfMatch.away_team?.name}: ${qfGoalsAttributed.away}/${qfAwayScore}\n\n` +
        `Salvar mesmo assim? Você pode completar os detalhes depois.`
      )
      if (!ok) return
    }
    setQfSaving(true)

    // Update match
    const { error: matchErr } = await supabase.from('matches').update({
      status: 'finished',
      match_state: 'finished',
      home_score: qfHomeScore,
      away_score: qfAwayScore,
      home_fouls: qfHomeFouls,
      away_fouls: qfAwayFouls,
      motm_player_id: qfMotm || null,
      half_start_time: null,
    }).eq('id', qfMatch.id)
    if (matchErr) { alert('Erro ao salvar partida: ' + matchErr.message); setQfSaving(false); return }

    // Clear any previous events for this match, then re-insert based on per-player counts.
    await supabase.from('match_events').delete().eq('match_id', qfMatch.id)

    const events: any[] = []
    for (const [playerId, stats] of Object.entries(qfPlayerStats)) {
      const player = qfAllPlayers.find(p => p.id === playerId)
      if (!player) continue
      for (let i = 0; i < stats.goals; i++) {
        events.push({ match_id: qfMatch.id, team_id: player.teamId, event_type: 'goal', player_id: playerId, minute: 0, half: 1 })
      }
      for (let i = 0; i < stats.yellow; i++) {
        events.push({ match_id: qfMatch.id, team_id: player.teamId, event_type: 'yellow_card', player_id: playerId, minute: 0, half: 1 })
      }
      for (let i = 0; i < stats.red; i++) {
        events.push({ match_id: qfMatch.id, team_id: player.teamId, event_type: 'red_card', player_id: playerId, minute: 0, half: 1 })
      }
    }
    // Own goals (no player)
    for (let i = 0; i < qfOwnGoalsHome; i++) {
      events.push({ match_id: qfMatch.id, team_id: qfMatch.home_team_id, event_type: 'own_goal', player_id: null, minute: 0, half: 1 })
    }
    for (let i = 0; i < qfOwnGoalsAway; i++) {
      events.push({ match_id: qfMatch.id, team_id: qfMatch.away_team_id, event_type: 'own_goal', player_id: null, minute: 0, half: 1 })
    }
    if (events.length > 0) {
      const { error: evErr } = await supabase.from('match_events').insert(events)
      if (evErr) { alert('Erro ao salvar eventos: ' + evErr.message); setQfSaving(false); return }
    }

    // Save referees: replace existing assignments
    await supabase.from('match_referees').delete().eq('match_id', qfMatch.id)
    const refRows: any[] = []
    if (qfRefTable)  refRows.push({ match_id: qfMatch.id, referee_id: qfRefTable,  role: 'table' })
    if (qfRefField1) refRows.push({ match_id: qfMatch.id, referee_id: qfRefField1, role: 'field_1' })
    if (qfRefField2) refRows.push({ match_id: qfMatch.id, referee_id: qfRefField2, role: 'field_2' })
    if (refRows.length > 0) await supabase.from('match_referees').insert(refRows)

    // Save attendance
    await supabase.from('match_attendance').delete().eq('match_id', qfMatch.id)
    if (qfPresentPlayers.size > 0) {
      const attendanceRows = qfAllPlayers
        .filter(p => qfPresentPlayers.has(p.id))
        .map(p => ({ match_id: qfMatch.id, player_id: p.id, team_id: p.teamId, present: true }))
      if (attendanceRows.length > 0) {
        await supabase.from('match_attendance').insert(attendanceRows)
      }
    }

    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['match_goals_bulk'] })
    queryClient.invalidateQueries({ queryKey: ['match_motm_bulk'] })
    queryClient.invalidateQueries({ queryKey: ['standings'] })
    setQfSaving(false)
    setQfOpen(false)
  }

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta partida? Essa ação não pode ser desfeita.')) return
    setDeleting(matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    setDeleting(null)
  }

  // Fetch goal events for all finished matches
  const finishedMatchIds = useMemo(() =>
    matches?.filter(m => m.status === 'finished').map(m => m.id) ?? []
  , [matches])

  const { data: allGoalEvents } = useQuery({
    queryKey: ['match_goals_bulk', championshipId, filterCategory],
    queryFn: async () => {
      const { data } = await supabase.from('match_events')
        .select('match_id, event_type, player:players(name), team_id')
        .in('match_id', finishedMatchIds)
        .in('event_type', ['goal', 'own_goal'])
      return data ?? []
    },
    enabled: finishedMatchIds.length > 0,
  })

  // Fetch MOTM player names for finished matches
  const { data: motmData } = useQuery({
    queryKey: ['match_motm_bulk', championshipId, filterCategory],
    queryFn: async () => {
      const { data } = await supabase.from('matches')
        .select('id, motm_player:players!matches_motm_player_id_fkey(name)')
        .in('id', finishedMatchIds)
        .not('motm_player_id', 'is', null)
      return data ?? []
    },
    enabled: finishedMatchIds.length > 0,
  })

  // Group goals by match
  const goalsByMatch = useMemo(() => {
    const map = new Map<string, Array<{ name: string; team_id: string; isOwnGoal: boolean }>>()
    for (const e of allGoalEvents ?? []) {
      const list = map.get(e.match_id) ?? []
      list.push({ name: (e.player as any)?.name ?? '?', team_id: e.team_id, isOwnGoal: e.event_type === 'own_goal' })
      map.set(e.match_id, list)
    }
    return map
  }, [allGoalEvents])

  // MOTM by match
  const motmByMatch = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of motmData ?? []) {
      map.set(m.id, (m.motm_player as any)?.name ?? '')
    }
    return map
  }, [motmData])

  const filtered = matches?.filter(m =>
    (filterPhase === 'all' || m.phase === filterPhase) &&
    (filterMatchday === 'all' || m.matchday === Number(filterMatchday))
  ) ?? []

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Nenhum campeonato ativo.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-7 w-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Partidas</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova Partida</Button>
      </div>

      {/* Filters + Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPhase} onValueChange={setFilterPhase}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Fase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="grupos">Grupos</SelectItem>
            <SelectItem value="semifinal">Semifinal</SelectItem>
            <SelectItem value="terceiro_lugar">3º Lugar</SelectItem>
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
        {availableMatchdays.length > 0 && (
          <Select value={filterMatchday} onValueChange={setFilterMatchday}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Rodada" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Rodadas</SelectItem>
              {availableMatchdays.map(d => <SelectItem key={d} value={String(d)}>Rodada {d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {/* Generate round-robin or return matches */}
        {filterCategory !== 'all' && (() => {
          const cc = champCategories?.find((c: any) => c.category_id === filterCategory)
          const hasMatchdays = matches?.some(m => m.category_id === filterCategory && m.phase === 'grupos' && m.matchday != null)
          const has2ndRound = matches?.some(m => m.category_id === filterCategory && m.phase === 'grupos' && m.round === 2)
          return (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleGenerateRoundRobin(filterCategory, 1)}
                className="border-pitch-500/50 text-pitch-400 hover:bg-pitch-500/10">
                ⚽ {hasMatchdays ? 'Regerar' : 'Gerar'} Rodadas (Ida)
              </Button>
              {(cc as any)?.turns === 2 && (
                <Button variant="outline" size="sm" onClick={() => handleGenerateRoundRobin(filterCategory, 2)}
                  className="border-gold-500/50 text-gold-400 hover:bg-gold-500/10">
                  🔄 {has2ndRound ? 'Regerar' : 'Gerar'} Rodadas (Volta)
                </Button>
              )}
            </div>
          )
        })()}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(match => (
            <Card key={match.id} className="card-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <Link to={`/admin/partidas/${match.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{match.category?.name}</Badge>
                    <Badge variant="outline" className="text-xs">{phaseLabel(match.phase)}</Badge>
                    {match.phase === 'grupos' && (match as any).round === 2 && (
                      <Badge variant="outline" className="text-xs text-gold-400 border-gold-500/30">2º Turno</Badge>
                    )}
                    {match.matchday != null && (
                      <Badge variant="outline" className="text-xs text-pitch-400 border-pitch-500/30">Rodada {match.matchday}</Badge>
                    )}
                    <Badge variant={match.status === 'finished' ? 'default' : 'secondary'} className="text-xs">
                      {match.status === 'finished' ? 'Encerrado' : 'Agendado'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-white font-medium">
                    <span>{match.home_team?.name}</span>
                    {match.status === 'finished' ? (
                      <span className="text-lg font-bold text-gold-400">{match.home_score} × {match.away_score}</span>
                    ) : (
                      <span className="text-slate-500">vs</span>
                    )}
                    <span>{match.away_team?.name}</span>
                  </div>
                  {match.match_date ? (
                    <p className="text-xs text-slate-400 mt-1">{formatDate(match.match_date)}{match.location ? ` — ${match.location}` : ''}</p>
                  ) : (
                    <p className="text-xs text-gold-400/60 mt-1">Sem data definida</p>
                  )}
                  {match.status === 'finished' && (() => {
                    const goals = goalsByMatch.get(match.id)
                    const motm = motmByMatch.get(match.id)
                    if (!goals?.length && !motm) return null
                    const homeGoals = goals?.filter(g => !g.isOwnGoal ? g.team_id === match.home_team_id : g.team_id !== match.home_team_id) ?? []
                    const awayGoals = goals?.filter(g => !g.isOwnGoal ? g.team_id === match.away_team_id : g.team_id !== match.away_team_id) ?? []
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px]">
                        {homeGoals.length > 0 && (
                          <span className="text-slate-400">
                            {homeGoals.map((g, i) => (
                              <span key={i}>{i > 0 ? ', ' : ''}⚽ {g.name}{g.isOwnGoal ? ' (GC)' : ''}</span>
                            ))}
                          </span>
                        )}
                        {awayGoals.length > 0 && (
                          <span className="text-slate-400">
                            {awayGoals.map((g, i) => (
                              <span key={i}>{i > 0 ? ', ' : ''}⚽ {g.name}{g.isOwnGoal ? ' (GC)' : ''}</span>
                            ))}
                          </span>
                        )}
                        {motm && (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400" />{motm}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openQuickFinalize(match)}
                    title={match.status === 'finished' ? 'Editar placar e detalhes' : 'Finalizar rápido'}>
                    <Zap className="h-4 w-4 text-gold-400" />
                  </Button>
                  {match.status === 'finished' && (
                    <Button variant="ghost" size="icon" onClick={() => openEventsEditor(match)} title="Editar eventos (minuto/tempo)">
                      <Pencil className="h-4 w-4 text-slate-400" />
                    </Button>
                  )}
                  {match.status !== 'finished' && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEditMatch(match)} title="Editar partida">
                        <Pencil className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteMatch(match.id)} disabled={deleting === match.id} title="Excluir partida">
                        <Trash2 className="h-4 w-4 text-red-400/60 hover:text-red-400" />
                      </Button>
                    </>
                  )}
                  <Link to={`/admin/partidas/${match.id}`}>
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400">Nenhuma partida encontrada.</div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Partida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={phase} onValueChange={v => setPhase(v as MatchPhase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupos">Fase de Grupos</SelectItem>
                  <SelectItem value="semifinal">Semifinal</SelectItem>
                  <SelectItem value="terceiro_lugar">Terceiro Lugar</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time Casa</Label>
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForCategory?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time Visitante</Label>
                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForCategory?.filter(t => t.id !== homeTeamId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Local (opcional)</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Campo do Condomínio" />
              </div>
              {phase === 'grupos' && (
                <div className="space-y-2">
                  <Label>Turno</Label>
                  <Select value={String(round)} onValueChange={v => setRound(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1º Turno (Ida)</SelectItem>
                      <SelectItem value="2">2º Turno (Volta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending || !homeTeamId || !awayTeamId || !matchDate}>
              {saveMutation.isPending ? 'Salvando...' : 'Criar Partida'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule editor dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-pitch-400" />
              Definir Data e Local
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data (Seg/Ter/Qui)</Label>
              <Select value={scheduleDay} onValueChange={setScheduleDay}>
                <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                <SelectContent>
                  {validDates.map(d => (
                    <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Horário</Label>
              <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Local</Label>
              <Input value={scheduleLocation} onChange={e => setScheduleLocation(e.target.value)} placeholder="Campo do Condomínio" />
            </div>
            <Button onClick={handleSaveSchedule} className="w-full" disabled={scheduleSaving}>
              {scheduleSaving ? 'Salvando...' : 'Salvar Agenda'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick finalize dialog */}
      <Dialog open={qfOpen} onOpenChange={setQfOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-gold-400" />
              Finalizar Rápido — {qfMatch?.home_team?.name} vs {qfMatch?.away_team?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Score */}
            <div>
              <Label className="text-slate-400 text-xs mb-2 block">Placar</Label>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">{qfMatch?.home_team?.name}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQfHomeScore(Math.max(0, qfHomeScore - 1))} className="h-8 w-8 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold">−</button>
                    <span className="text-3xl font-extrabold text-white w-10 text-center">{qfHomeScore}</span>
                    <button onClick={() => setQfHomeScore(qfHomeScore + 1)} className="h-8 w-8 rounded bg-pitch-500/20 text-pitch-400 hover:bg-pitch-500/30 font-bold">+</button>
                  </div>
                  <p className={`text-[10px] mt-1 ${qfGoalsAttributed.home === qfHomeScore ? 'text-pitch-400' : 'text-amber-400'}`}>
                    {qfGoalsAttributed.home}/{qfHomeScore} atribuídos
                  </p>
                </div>
                <span className="text-2xl text-slate-500 font-bold mt-5">×</span>
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">{qfMatch?.away_team?.name}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQfAwayScore(Math.max(0, qfAwayScore - 1))} className="h-8 w-8 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold">−</button>
                    <span className="text-3xl font-extrabold text-white w-10 text-center">{qfAwayScore}</span>
                    <button onClick={() => setQfAwayScore(qfAwayScore + 1)} className="h-8 w-8 rounded bg-pitch-500/20 text-pitch-400 hover:bg-pitch-500/30 font-bold">+</button>
                  </div>
                  <p className={`text-[10px] mt-1 ${qfGoalsAttributed.away === qfAwayScore ? 'text-pitch-400' : 'text-amber-400'}`}>
                    {qfGoalsAttributed.away}/{qfAwayScore} atribuídos
                  </p>
                </div>
              </div>
            </div>

            {/* Fouls (single total per team) */}
            <div>
              <Label className="text-slate-400 text-xs mb-2 block">Faltas (total)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 text-center">{qfMatch?.home_team?.name}</p>
                  <Input type="number" min={0} value={qfHomeFouls} onChange={e => setQfHomeFouls(Math.max(0, +e.target.value))} className="text-center" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 text-center">{qfMatch?.away_team?.name}</p>
                  <Input type="number" min={0} value={qfAwayFouls} onChange={e => setQfAwayFouls(Math.max(0, +e.target.value))} className="text-center" />
                </div>
              </div>
            </div>

            {/* Referees */}
            <div>
              <Label className="text-slate-400 text-xs mb-2 block">Arbitragem</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">📋 Mesa</label>
                  <select value={qfRefTable} onChange={e => setQfRefTable(e.target.value)}
                    className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">— Selecione —</option>
                    {(qfReferees ?? []).filter(r => !r.roles || r.roles.includes('table')).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">⚽ Campo 1</label>
                  <select value={qfRefField1} onChange={e => setQfRefField1(e.target.value)}
                    className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">— Selecione —</option>
                    {(qfReferees ?? []).filter(r => !r.roles || r.roles.includes('field')).filter(r => r.id !== qfRefField2).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">⚽ Campo 2 (opcional)</label>
                  <select value={qfRefField2} onChange={e => setQfRefField2(e.target.value)}
                    className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">— Nenhum —</option>
                    {(qfReferees ?? []).filter(r => !r.roles || r.roles.includes('field')).filter(r => r.id !== qfRefField1).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Player attendance + per-player stats (combined) */}
            {qfAllPlayers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-slate-400 text-xs">
                    Presença & Estatísticas ({qfPresentPlayers.size}/{qfAllPlayers.length})
                  </Label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setQfPresentPlayers(new Set(qfAllPlayers.map(p => p.id)))}
                      className="text-[10px] text-pitch-400 hover:text-pitch-300">
                      Todos
                    </button>
                    <span className="text-slate-600 text-[10px]">·</span>
                    <button type="button"
                      onClick={() => setQfPresentPlayers(new Set())}
                      className="text-[10px] text-slate-400 hover:text-slate-300">
                      Nenhum
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">
                  Marque quem participou. Para os presentes, use os contadores − / + para gols (⚽), amarelos (🟨) e vermelhos (🟥).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { teamId: qfMatch?.home_team_id, teamName: qfMatch?.home_team?.name, roster: qfHomeRoster, ownGoals: qfOwnGoalsHome, setOwnGoals: setQfOwnGoalsHome },
                    { teamId: qfMatch?.away_team_id, teamName: qfMatch?.away_team?.name, roster: qfAwayRoster, ownGoals: qfOwnGoalsAway, setOwnGoals: setQfOwnGoalsAway },
                  ].map(side => (
                    <div key={side.teamId} className="bg-navy-800/40 border border-navy-700 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium text-white">{side.teamName}</p>
                        <div className="flex gap-3 text-[10px] text-slate-500">
                          <span title="Gols">⚽</span>
                          <span title="Cartões amarelos">🟨</span>
                          <span title="Cartões vermelhos">🟥</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {(side.roster ?? []).map(pt => {
                          const p = pt.player!
                          const present = qfPresentPlayers.has(p.id)
                          const stats = qfPlayerStats[p.id] ?? { goals: 0, yellow: 0, red: 0 }
                          const isHomeSide = side.teamId === qfMatch?.home_team_id
                          const teamScoreLimit = isHomeSide ? qfHomeScore : qfAwayScore
                          const teamAttributed = isHomeSide ? qfGoalsAttributed.home : qfGoalsAttributed.away
                          const goalAtLimit = teamAttributed >= teamScoreLimit
                          const counter = (key: 'goals' | 'yellow' | 'red', color: string) => {
                            const isGoal = key === 'goals'
                            const plusDisabled = isGoal && goalAtLimit
                            return (
                              <div className="flex items-center gap-0.5">
                                <button type="button"
                                  onClick={() => bumpPlayerStat(p.id, key, -1)}
                                  disabled={!present || stats[key] === 0}
                                  className="w-6 h-6 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs font-bold">−</button>
                                <span className={`w-5 text-center text-xs font-bold ${stats[key] > 0 ? color : 'text-slate-600'}`}>{stats[key]}</span>
                                <button type="button"
                                  onClick={() => { if (!present) toggleQfPresent(p.id); bumpPlayerStat(p.id, key, 1) }}
                                  disabled={plusDisabled}
                                  title={plusDisabled ? `Placar do time já é ${teamScoreLimit}` : ''}
                                  className="w-6 h-6 rounded bg-slate-700 text-slate-300 hover:bg-pitch-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs font-bold">+</button>
                              </div>
                            )
                          }
                          return (
                            <div key={p.id} className={`flex items-center gap-2 py-1 px-1 rounded ${present ? '' : 'opacity-60'}`}>
                              <input
                                type="checkbox"
                                checked={present}
                                onChange={() => toggleQfPresent(p.id)}
                                className="accent-green-500 flex-shrink-0"
                              />
                              <span className={`text-xs flex-1 truncate ${present ? 'text-white' : 'text-slate-500 line-through'}`}>
                                {pt.jersey_number != null && <span className="text-slate-500 mr-1">#{pt.jersey_number}</span>}
                                {p.name}
                              </span>
                              {counter('goals', 'text-pitch-400')}
                              {counter('yellow', 'text-yellow-400')}
                              {counter('red', 'text-red-400')}
                            </div>
                          )
                        })}
                        {(() => {
                          // Own goals on side X count for the OPPOSING team's score.
                          const isHomeSide = side.teamId === qfMatch?.home_team_id
                          const oppLimit = isHomeSide ? qfAwayScore : qfHomeScore
                          const oppAttributed = isHomeSide ? qfGoalsAttributed.away : qfGoalsAttributed.home
                          const plusOwnDisabled = oppAttributed >= oppLimit
                          return (
                            <div className="flex items-center gap-2 py-1 pt-2 border-t border-navy-700">
                              <span className="text-[10px] text-slate-500 flex-1">Gol contra (sem jogador)</span>
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={() => side.setOwnGoals(Math.max(0, side.ownGoals - 1))}
                                  disabled={side.ownGoals === 0}
                                  className="w-6 h-6 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 disabled:opacity-20 text-xs font-bold">−</button>
                                <span className={`w-5 text-center text-xs font-bold ${side.ownGoals > 0 ? 'text-red-400' : 'text-slate-600'}`}>{side.ownGoals}</span>
                                <button type="button" onClick={() => side.setOwnGoals(side.ownGoals + 1)}
                                  disabled={plusOwnDisabled}
                                  title={plusOwnDisabled ? `Placar adversário já é ${oppLimit}` : ''}
                                  className="w-6 h-6 rounded bg-slate-700 text-slate-300 hover:bg-red-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs font-bold">+</button>
                              </div>
                              <div className="w-[68px]"></div>
                              <div className="w-[68px]"></div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MOTM (searchable combobox) */}
            <MotmCombobox
              players={qfAllPlayers}
              homeName={qfMatch?.home_team?.name}
              awayName={qfMatch?.away_team?.name}
              homeId={qfMatch?.home_team_id}
              value={qfMotm}
              onChange={setQfMotm}
            />

            {/* Finalize button */}
            <Button className="w-full h-12 text-base font-bold bg-gold-500 hover:bg-gold-600 text-navy-950" onClick={handleQuickFinalize} disabled={qfSaving}>
              <Zap className="h-5 w-5 mr-2" />
              {qfSaving ? 'Finalizando...' : 'Finalizar Partida'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Events editor dialog (finished matches) */}
      <Dialog open={eventsOpen} onOpenChange={setEventsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-pitch-400" />
              Eventos — {eventsMatch?.home_team?.name} {eventsMatch?.home_score} × {eventsMatch?.away_score} {eventsMatch?.away_team?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Event list */}
            {eventsMatchEvents && eventsMatchEvents.length > 0 ? (
              <div className="space-y-1">
                {[...eventsMatchEvents].reverse().map(e => (
                  <div key={e.id}>
                    {evtEditId === e.id ? (
                      <div className="bg-navy-800 rounded-lg p-3 space-y-2 border border-pitch-500/30">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-pitch-400">Editar Evento</span>
                          <button onClick={() => setEvtEditId(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(['goal', 'own_goal', 'yellow_card', 'red_card'] as const).map(t => (
                            <button key={t} onClick={() => setEvtEditType(t)}
                              className={`px-2 py-1.5 rounded text-xs font-bold ${evtEditType === t ? 'bg-pitch-600 text-white' : 'bg-navy-700 text-slate-400 hover:bg-navy-600'}`}>
                              {t === 'goal' ? '⚽ Gol' : t === 'own_goal' ? '⚽ G.C.' : t === 'yellow_card' ? '🟨' : '🟥'}
                            </button>
                          ))}
                        </div>
                        {evtEditType !== 'own_goal' && (
                          <select value={evtEditPlayer} onChange={ev => setEvtEditPlayer(ev.target.value)}
                            className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                            <option value="">— Nenhum —</option>
                            {eventsAllPlayers.map(p => (
                              <option key={p.id} value={p.id}>{p.jersey_number ? `${p.jersey_number} - ` : ''}{p.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" placeholder="Minuto" value={evtEditMinute} onChange={ev => setEvtEditMinute(ev.target.value)}
                            className="bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-500" />
                          <select value={evtEditHalf} onChange={ev => setEvtEditHalf(Number(ev.target.value))}
                            className="bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                            <option value={1}>1º Tempo</option>
                            <option value={2}>2º Tempo</option>
                          </select>
                        </div>
                        <Button size="sm" className="w-full" onClick={handleSaveEventEdit}>Salvar</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm py-2 px-2 border-b border-navy-800 last:border-0 rounded hover:bg-navy-800/50 group">
                        <span className="text-[10px] font-bold text-slate-500 bg-navy-700 rounded px-1.5 py-0.5 min-w-[48px] text-center">
                          {e.half === 2 ? '2ºT' : '1ºT'} {e.minute != null ? `${e.minute}'` : ''}
                        </span>
                        <span className="text-lg">
                          {e.event_type === 'goal' && '⚽'}
                          {e.event_type === 'own_goal' && '⚽'}
                          {e.event_type === 'yellow_card' && '🟨'}
                          {e.event_type === 'red_card' && '🟥'}
                        </span>
                        <span className="font-medium text-white flex-1">
                          {e.event_type === 'own_goal' ? <span className="text-red-400">Gol Contra</span> : (e as any).player?.name ?? '?'}
                        </span>
                        <span className="text-slate-500 text-xs">{(e as any).team?.name}</span>
                        <button onClick={() => {
                          setEvtEditId(e.id)
                          setEvtEditType(e.event_type as any)
                          setEvtEditPlayer(e.player_id ?? '')
                          setEvtEditMinute(String(e.minute ?? ''))
                          setEvtEditHalf(e.half ?? 1)
                        }} className="text-slate-600 hover:text-pitch-400 transition-colors p-1.5 rounded-md hover:bg-pitch-400/10 opacity-0 group-hover:opacity-100" title="Editar">
                          ✏️
                        </button>
                        <button onClick={() => handleDeleteEvent(e.id, e)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-400/10 opacity-0 group-hover:opacity-100" title="Excluir">
                          <Undo2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum evento registrado.</p>
            )}

            {/* Add new event */}
            {addingEvent ? (
              <div className="bg-navy-800 rounded-lg p-3 space-y-2 border border-gold-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gold-400">Novo Evento</span>
                  <button onClick={() => setAddingEvent(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Time</label>
                    <select value={newEvtTeam} onChange={ev => setNewEvtTeam(ev.target.value)}
                      className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                      <option value={eventsMatch?.home_team_id}>{eventsMatch?.home_team?.name}</option>
                      <option value={eventsMatch?.away_team_id}>{eventsMatch?.away_team?.name}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
                    <select value={newEvtType} onChange={ev => setNewEvtType(ev.target.value as any)}
                      className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                      <option value="goal">⚽ Gol</option>
                      <option value="own_goal">⚽ Gol Contra</option>
                      <option value="yellow_card">🟨 Amarelo</option>
                      <option value="red_card">🟥 Vermelho</option>
                    </select>
                  </div>
                </div>
                {newEvtType !== 'own_goal' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Jogador</label>
                    <select value={newEvtPlayer} onChange={ev => setNewEvtPlayer(ev.target.value)}
                      className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                      <option value="">— Selecione —</option>
                      {eventsAllPlayers.filter(p => p.teamId === newEvtTeam).map(p => (
                        <option key={p.id} value={p.id}>{p.jersey_number ? `${p.jersey_number} - ` : ''}{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Minuto</label>
                    <input type="number" value={newEvtMinute} onChange={ev => setNewEvtMinute(ev.target.value)}
                      placeholder="0" className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Tempo</label>
                    <select value={newEvtHalf} onChange={ev => setNewEvtHalf(Number(ev.target.value))}
                      className="w-full bg-navy-700 border border-navy-600 rounded px-2 py-1.5 text-sm text-white">
                      <option value={1}>1º Tempo</option>
                      <option value={2}>2º Tempo</option>
                    </select>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={handleAddNewEvent} disabled={!newEvtMinute}>
                  Adicionar Evento
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full border-gold-500/30 text-gold-400 hover:bg-gold-500/10"
                onClick={() => { setAddingEvent(true); setNewEvtTeam(eventsMatch?.home_team_id) }}>
                + Adicionar Evento
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit match dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-pitch-400" />
              Editar Partida
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={editPhase} onValueChange={v => setEditPhase(v as MatchPhase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupos">Fase de Grupos</SelectItem>
                  <SelectItem value="semifinal">Semifinal</SelectItem>
                  <SelectItem value="terceiro_lugar">Terceiro Lugar</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time Casa</Label>
                <Select value={editHomeTeamId} onValueChange={setEditHomeTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForEditCategory?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time Visitante</Label>
                <Select value={editAwayTeamId} onValueChange={setEditAwayTeamId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamsForEditCategory?.filter(t => t.id !== editHomeTeamId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={editMatchDate} onChange={e => setEditMatchDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input type="time" value={editMatchTime} onChange={e => setEditMatchTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Local (opcional)</Label>
                <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Ex: Campo do Condomínio" />
              </div>
              {editPhase === 'grupos' && (
                <div className="space-y-2">
                  <Label>Turno</Label>
                  <Select value={String(editRound)} onValueChange={v => setEditRound(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1º Turno (Ida)</SelectItem>
                      <SelectItem value="2">2º Turno (Volta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={handleSaveEdit} className="w-full" disabled={editSaving || !editHomeTeamId || !editAwayTeamId}>
              {editSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
