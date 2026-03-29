import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayer, useMyTeams, useTeamRoster, useActiveChampionship, useTeamsByCategory, useCategories } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import TacticalBoard, { getDefaultFormation, rotatePositions, FORMATIONS } from '@/components/TacticalBoard'
import type { FieldOrientation, FormationName } from '@/components/TacticalBoard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ChevronLeft, Save, RotateCcw, MapPin } from 'lucide-react'
import { resolveTeamColors } from '@/lib/utils'
import type { PlayerTeam } from '@/types/database'

export default function TacticalBoardPage() {
  const { user } = useAuth()
  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: myTeamLinks } = useMyTeams(myPlayer?.id)
  const { data: championship } = useActiveChampionship()
  const { data: categories } = useCategories()

  // Find my team in active championship
  const myTeamLink = myTeamLinks?.find((tl: any) => tl.team?.championship?.id === championship?.id)
  const teamId = myTeamLink?.team_id
  const categoryId = myTeamLink?.category_id
  const myTeam = (myTeamLink as any)?.team

  const { data: myRoster } = useTeamRoster(teamId, categoryId)

  // Opponent selection
  const { data: allTeams } = useTeamsByCategory(championship?.id, categoryId)
  const opponents = allTeams?.filter(t => t.id !== teamId) ?? []
  const [opponentId, setOpponentId] = useState('')
  const { data: opponentRoster } = useTeamRoster(opponentId || undefined, categoryId)
  const opponentTeam = allTeams?.find(t => t.id === opponentId)

  const SCENARIOS = [
    { index: 0, label: 'Ataque', icon: '⚔️' },
    { index: 1, label: 'Defesa', icon: '🛡️' },
    { index: 2, label: 'Escanteio', icon: '🚩' },
    { index: 3, label: 'Outro', icon: '📋' },
  ]

  // Board state
  const queryClient = useQueryClient()
  const [activeScenario, setActiveScenario] = useState(0)
  const [homePlayers, setHomePlayers] = useState<any[]>([])
  const [awayPlayers, setAwayPlayers] = useState<any[]>([])
  const [drawings, setDrawings] = useState<any[]>([])
  const [boardId, setBoardId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAway, setShowAway] = useState(true)
  const [orientation, setOrientation] = useState<FieldOrientation>('portrait')
  const [homeFormation, setHomeFormation] = useState<FormationName>('3-2-1')
  const [awayFormation, setAwayFormation] = useState<FormationName>('3-2-1')

  const handleOrientationChange = (newO: FieldOrientation) => {
    setHomePlayers(prev => rotatePositions(prev, orientation, newO))
    setAwayPlayers(prev => rotatePositions(prev, orientation, newO))
    setOrientation(newO)
  }

  // Load all boards for this team (up to 4 scenarios)
  const { data: allBoards } = useQuery({
    queryKey: ['tactical_boards', teamId],
    queryFn: async () => {
      // Fetch boards
      const { data: boards } = await supabase
        .from('tactical_boards')
        .select('*')
        .eq('team_id', teamId!)
        .order('scenario_index')
      if (!boards || boards.length === 0) return []
      // Fetch all players for these boards
      const boardIds = boards.map((b: any) => b.id)
      const { data: players } = await supabase
        .from('tactical_board_players')
        .select('*')
        .in('board_id', boardIds)
      // Merge players into boards
      return boards.map((b: any) => ({
        ...b,
        players: (players ?? []).filter((p: any) => p.board_id === b.id),
      }))
    },
    enabled: !!teamId,
  })

  // Load HOME players when switching scenario or data arrives
  useEffect(() => {
    if (!myRoster || !allBoards) return

    const board = allBoards.find((b: any) => b.scenario_index === activeScenario)

    if (board?.players?.length) {
      const homeSaved = board.players.filter((p: any) => p.team_side === 'home')
      if (homeSaved.length > 0) {
        setBoardId(board.id)
        setDrawings(board.drawings ?? [])
        setHomePlayers(homeSaved.map((p: any) => ({
          id: p.id, label: p.label, jerseyNumber: p.jersey_number,
          x: p.position_x, y: p.position_y, side: 'home' as const, playerId: p.player_id,
        })))
        return
      }
    }

    // No saved home data — use default
    setBoardId(board?.id ?? null)
    setDrawings(board?.drawings ?? [])
    const rosterPlayers = myRoster.slice(0, 7).map(pt => ({
      id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setHomePlayers(getDefaultFormation(rosterPlayers, 'home'))
  }, [myRoster, allBoards, activeScenario])

  // Load AWAY players whenever opponent changes — ALWAYS uses current opponent roster
  useEffect(() => {
    if (!opponentRoster || !opponentId) {
      setAwayPlayers([])
      return
    }
    const rosterPlayers = opponentRoster.slice(0, 7).map(pt => ({
      id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setAwayPlayers(getDefaultFormation(rosterPlayers, 'away'))
  }, [opponentRoster, opponentId])

  const handlePlayerMove = (id: string, x: number, y: number) => {
    setHomePlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
    setAwayPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
  }

  const handleSave = async () => {
    if (!teamId || !user) return
    setSaving(true)

    let bid = boardId
    if (!bid) {
      const scenario = SCENARIOS[activeScenario]
      const { data, error } = await supabase
        .from('tactical_boards')
        .insert({ team_id: teamId, name: scenario.label, scenario: scenario.label, scenario_index: activeScenario, created_by: user.id })
        .select('id')
        .single()
      if (error) { setSaving(false); return }
      bid = data.id
      setBoardId(bid)
    }

    // Delete old players
    await supabase.from('tactical_board_players').delete().eq('board_id', bid!)

    // Insert all
    const allPlayers = [
      ...homePlayers.map(p => ({
        board_id: bid!,
        player_id: p.playerId || null,
        team_side: 'home',
        label: p.label,
        position_x: p.x,
        position_y: p.y,
        jersey_number: p.jerseyNumber,
      })),
      ...awayPlayers.map(p => ({
        board_id: bid!,
        player_id: p.playerId || null,
        team_side: 'away',
        label: p.label,
        position_x: p.x,
        position_y: p.y,
        jersey_number: p.jerseyNumber,
      })),
    ]
    if (allPlayers.length > 0) {
      await supabase.from('tactical_board_players').insert(allPlayers)
    }
    // Save drawings
    await supabase.from('tactical_boards').update({ drawings, updated_at: new Date().toISOString() }).eq('id', bid!)
    queryClient.invalidateQueries({ queryKey: ['tactical_boards', teamId] })
    setSaving(false)
  }

  const handleReset = () => {
    if (!myRoster) return
    setDrawings([])
    const rosterPlayers = myRoster.slice(0, 7).map(pt => ({
      id: `home-${pt.id}`,
      name: pt.player?.name ?? '?',
      jerseyNumber: pt.jersey_number,
      playerId: pt.player_id,
    }))
    setHomePlayers(getDefaultFormation(rosterPlayers, 'home'))
    if (opponentRoster) {
      const oppPlayers = opponentRoster.slice(0, 7).map(pt => ({
        id: `away-${pt.id}`,
        name: pt.player?.name ?? '?',
        jerseyNumber: pt.jersey_number,
        playerId: pt.player_id,
      }))
      setAwayPlayers(getDefaultFormation(oppPlayers, 'away'))
    }
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Faça <Link to="/login" className="text-pitch-400 hover:underline">login</Link> para acessar a prancheta tática.</p>
      </div>
    )
  }

  if (!myTeam) {
    return (
      <div className="space-y-4">
        <Link to="/meu-time" className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" />Voltar
        </Link>
        <p className="text-slate-400 text-center py-8">Você não está vinculado a nenhum time.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <Link to="/meu-time" className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" />Meu Time
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{myTeam?.name}</Badge>
          <Badge variant="outline">Prancheta Tática</Badge>
        </div>
      </div>

      {/* Scenario tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SCENARIOS.map(s => {
          const hasSaved = allBoards?.some((b: any) => b.scenario_index === s.index)
          return (
            <button
              key={s.index}
              onClick={() => setActiveScenario(s.index)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 ${
                activeScenario === s.index
                  ? 'bg-pitch-600 text-white ring-2 ring-pitch-400'
                  : 'bg-navy-800 text-slate-400 hover:bg-navy-700'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              {hasSaved && <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" />}
            </button>
          )
        })}
      </div>

      {/* Opponent selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <MapPin className="h-4 w-4 text-pitch-400" />
            <span className="text-sm font-medium text-white">Adversário:</span>
            <Select value={opponentId} onValueChange={setOpponentId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Selecione o adversário" />
              </SelectTrigger>
              <SelectContent>
                {opponents.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {(opponentId || awayPlayers.length > 0) && (
              <Button variant={showAway ? 'outline' : 'secondary'} size="sm" onClick={() => setShowAway(!showAway)}>
                {showAway ? '👁️ Ocultar adversário' : '👁️ Mostrar adversário'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Resetar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Formation selectors */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-400 font-semibold">{myTeam?.name}:</span>
          {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
            <button key={`h-${f}`} onClick={() => {
              setHomeFormation(f)
              if (!myRoster) return
              const rp = myRoster.slice(0, 7).map(pt => ({ id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
              setHomePlayers(getDefaultFormation(rp, 'home', orientation, f))
            }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${homeFormation === f ? 'bg-blue-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
              {f}
            </button>
          ))}
        </div>
        {opponentId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 font-semibold">{opponentTeam?.name}:</span>
            {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
              <button key={`a-${f}`} onClick={() => {
                setAwayFormation(f)
                if (!opponentRoster) return
                const rp = opponentRoster.slice(0, 7).map(pt => ({ id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
                setAwayPlayers(getDefaultFormation(rp, 'away', orientation, f))
              }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${awayFormation === f ? 'bg-red-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tactical board */}
      <TacticalBoard
        homePlayers={homePlayers}
        awayPlayers={awayPlayers}
        homeColor={resolveTeamColors(myTeam?.primary_color, opponentTeam?.primary_color)[0]}
        awayColor={resolveTeamColors(myTeam?.primary_color, opponentTeam?.primary_color)[1]}
        homeTeamName={myTeam?.name ?? 'Meu Time'}
        awayTeamName={opponentTeam?.name ?? 'Adversário'}
        onPlayerMove={handlePlayerMove}
        onPlayersSwap={(id1, id2) => {
          const update = (list: any[], setList: any) => {
            const p1 = list.find((p: any) => p.id === id1)
            const p2 = list.find((p: any) => p.id === id2)
            if (p1 && p2) setList(list.map((p: any) => p.id === id1 ? { ...p, x: p2.x, y: p2.y } : p.id === id2 ? { ...p, x: p1.x, y: p1.y } : p))
          }
          update(homePlayers, setHomePlayers)
          update(awayPlayers, setAwayPlayers)
        }}
        onPlayerEject={(id) => {
          if (id.startsWith('undo:')) {
            // Undo eject not fully supported from here — user can re-add via reserves
            return
          }
          setHomePlayers(prev => prev.filter(p => p.id !== id))
          setAwayPlayers(prev => prev.filter(p => p.id !== id))
        }}
        onDrawingsChange={setDrawings}
        initialDrawings={drawings}
        showAway={showAway}
        orientation={orientation}
        onOrientationChange={handleOrientationChange}
      />

      {/* Titulares + Reservas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Meu time */}
        <Card>
          <CardContent className="p-3">
            <h4 className="text-xs font-semibold text-blue-400 mb-2">
              {myTeam?.name} — Titulares ({homePlayers.length}/7)
            </h4>
            <div className="space-y-1 mb-3">
              {homePlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs bg-blue-900/10 rounded-lg px-2 py-1.5">
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: myTeam?.primary_color ?? '#1d4ed8', color: myTeam?.secondary_color ?? '#fff' }}>
                    {p.jerseyNumber ?? '?'}
                  </div>
                  <span className="text-slate-300 truncate flex-1">{p.label}</span>
                  {homePlayers.length > 1 && (
                    <button
                      onClick={() => {
                        setHomePlayers(prev => prev.filter(hp => hp.id !== p.id))
                      }}
                      className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                      title="Mover para reserva"
                    >
                      ↓ Banco
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Reservas */}
            {(() => {
              const starterIds = new Set(homePlayers.map(p => p.playerId))
              const reserves = myRoster?.filter(pt => !starterIds.has(pt.player_id)) ?? []
              if (reserves.length === 0) return null
              return (
                <>
                  <h4 className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                    Reservas ({reserves.length})
                  </h4>
                  <div className="space-y-1">
                    {reserves.map(pt => (
                      <div key={pt.id} className="flex items-center gap-2 text-xs bg-navy-800/50 rounded-lg px-2 py-1.5">
                        <div className="h-5 w-5 rounded-full bg-navy-600 flex items-center justify-center text-slate-400 text-[9px] font-bold flex-shrink-0">
                          {pt.jersey_number ?? '?'}
                        </div>
                        <span className="text-slate-500 truncate flex-1">{pt.player?.name}</span>
                        {homePlayers.length < 7 ? (
                          <button
                            onClick={() => {
                              const newPlayer = {
                                id: `home-${pt.id}`,
                                label: pt.player?.name ?? '?',
                                jerseyNumber: pt.jersey_number,
                                x: 50, y: 50,
                                side: 'home' as const,
                                playerId: pt.player_id,
                              }
                              setHomePlayers(prev => [...prev, newPlayer])
                            }}
                            className="text-[10px] text-pitch-400 hover:text-pitch-300 transition-colors font-medium"
                          >
                            ↑ Escalar
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">Time cheio</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </CardContent>
        </Card>

        {/* Adversário */}
        {(awayPlayers.length > 0 || (opponentRoster && opponentRoster.length > 0)) && (
          <Card>
            <CardContent className="p-3">
              <h4 className="text-xs font-semibold text-red-400 mb-2">
                {opponentTeam?.name ?? 'Adversário'} — Titulares ({awayPlayers.length}/7)
              </h4>
              <div className="space-y-1 mb-3">
                {awayPlayers.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs bg-red-900/10 rounded-lg px-2 py-1.5">
                    <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: opponentTeam?.primary_color ?? '#dc2626', color: opponentTeam?.secondary_color ?? '#fff' }}>
                      {p.jerseyNumber ?? '?'}
                    </div>
                    <span className="text-slate-300 truncate flex-1">{p.label}</span>
                    {awayPlayers.length > 1 && (
                      <button
                        onClick={() => setAwayPlayers(prev => prev.filter(ap => ap.id !== p.id))}
                        className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                        title="Mover para reserva"
                      >
                        ↓ Banco
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(() => {
                if (!opponentRoster) {
                  return awayPlayers.length > 0 ? (
                    <p className="text-[10px] text-slate-600 mt-2">Selecione o adversário acima para ver os reservas</p>
                  ) : null
                }
                const starterIds = new Set(awayPlayers.map(p => p.playerId))
                const reserves = opponentRoster.filter(pt => !starterIds.has(pt.player_id))
                if (reserves.length === 0) return null
                return (
                  <>
                    <h4 className="text-xs font-semibold text-slate-500 mb-1.5">Reservas ({reserves.length})</h4>
                    <div className="space-y-1">
                      {reserves.map(pt => (
                        <div key={pt.id} className="flex items-center gap-2 text-xs bg-navy-800/50 rounded-lg px-2 py-1.5">
                          <div className="h-5 w-5 rounded-full bg-navy-600 flex items-center justify-center text-slate-400 text-[9px] font-bold flex-shrink-0">
                            {pt.jersey_number ?? '?'}
                          </div>
                          <span className="text-slate-500 truncate flex-1">{pt.player?.name}</span>
                          {awayPlayers.length < 7 ? (
                            <button
                              onClick={() => {
                                const newPlayer = {
                                  id: `away-${pt.id}`,
                                  label: pt.player?.name ?? '?',
                                  jerseyNumber: pt.jersey_number,
                                  x: 50, y: 50,
                                  side: 'away' as const,
                                  playerId: pt.player_id,
                                }
                                setAwayPlayers(prev => [...prev, newPlayer])
                              }}
                              className="text-[10px] text-pitch-400 hover:text-pitch-300 transition-colors font-medium"
                            >
                              ↑ Escalar
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600">Time cheio</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
