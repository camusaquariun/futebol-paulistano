import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { useTeamsByCategory, useTeamRoster, useCategories, useChampionshipCategories } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import TacticalBoard, { getDefaultFormation, rotatePositions, FORMATIONS } from '@/components/TacticalBoard'
import type { FieldOrientation, FormationName } from '@/components/TacticalBoard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, RotateCcw, MapPin } from 'lucide-react'
import { resolveTeamColors } from '@/lib/utils'

export default function TacticalBoardAdmin() {
  const { user } = useAuth()
  const { selectedId: championshipId } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const queryClient = useQueryClient()

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const [categoryId, setCategoryId] = useState('')
  const { data: categoryTeams } = useTeamsByCategory(championshipId, categoryId || undefined)

  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const { data: homeRoster } = useTeamRoster(homeTeamId || undefined, categoryId || undefined)
  const { data: awayRoster } = useTeamRoster(awayTeamId || undefined, categoryId || undefined)

  const homeTeam = categoryTeams?.find(t => t.id === homeTeamId)
  const awayTeam = categoryTeams?.find(t => t.id === awayTeamId)

  const [homePlayers, setHomePlayers] = useState<any[]>([])
  const [awayPlayers, setAwayPlayers] = useState<any[]>([])
  const [showAway, setShowAway] = useState(true)
  const [orientation, setOrientation] = useState<FieldOrientation>('portrait')
  const [homeFormation, setHomeFormation] = useState<FormationName>('3-2-1')
  const [awayFormation, setAwayFormation] = useState<FormationName>('3-2-1')

  const handleOrientationChange = (newO: FieldOrientation) => {
    setHomePlayers(prev => rotatePositions(prev, orientation, newO))
    setAwayPlayers(prev => rotatePositions(prev, orientation, newO))
    setOrientation(newO)
  }
  const [drawings, setDrawings] = useState<any[]>([])
  const [boardId, setBoardId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load existing board
  const { data: existingBoard } = useQuery({
    queryKey: ['tactical_board_admin', homeTeamId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tactical_boards')
        .select('*, players:tactical_board_players(*)')
        .eq('team_id', homeTeamId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!homeTeamId,
  })

  useEffect(() => {
    if (!homeRoster) { setHomePlayers([]); return }
    if (existingBoard?.players?.length) {
      const saved = existingBoard.players.filter((p: any) => p.team_side === 'home')
      if (saved.length > 0) {
        setBoardId(existingBoard.id)
        if (existingBoard.drawings) setDrawings(existingBoard.drawings)
        setHomePlayers(saved.map((p: any) => ({
          id: p.id, label: p.label, jerseyNumber: p.jersey_number,
          x: p.position_x, y: p.position_y, side: 'home' as const, playerId: p.player_id,
        })))
        return
      }
    }
    const rp = homeRoster.slice(0, 7).map(pt => ({
      id: `home-${pt.id}`, name: pt.player?.name ?? '?',
      jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setHomePlayers(getDefaultFormation(rp, 'home'))
    setDrawings([])
    setBoardId(null)
  }, [homeRoster, existingBoard])

  useEffect(() => {
    if (!awayRoster) { setAwayPlayers([]); return }
    const rp = awayRoster.slice(0, 7).map(pt => ({
      id: `away-${pt.id}`, name: pt.player?.name ?? '?',
      jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setAwayPlayers(getDefaultFormation(rp, 'away'))
  }, [awayRoster])

  const handlePlayerMove = (id: string, x: number, y: number) => {
    setHomePlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
    setAwayPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
  }

  const handleSave = async () => {
    if (!homeTeamId || !user) return
    setSaving(true)
    let bid = boardId
    if (!bid) {
      const { data } = await supabase.from('tactical_boards')
        .insert({ team_id: homeTeamId, name: 'Formação', created_by: user.id })
        .select('id').single()
      if (!data) { setSaving(false); return }
      bid = data.id; setBoardId(bid)
    }
    await supabase.from('tactical_board_players').delete().eq('board_id', bid!)
    const all = [
      ...homePlayers.map(p => ({ board_id: bid!, player_id: p.playerId || null, team_side: 'home', label: p.label, position_x: p.x, position_y: p.y, jersey_number: p.jerseyNumber })),
      ...awayPlayers.map(p => ({ board_id: bid!, player_id: p.playerId || null, team_side: 'away', label: p.label, position_x: p.x, position_y: p.y, jersey_number: p.jerseyNumber })),
    ]
    if (all.length > 0) await supabase.from('tactical_board_players').insert(all)
    await supabase.from('tactical_boards').update({ drawings, updated_at: new Date().toISOString() }).eq('id', bid!)
    queryClient.invalidateQueries({ queryKey: ['tactical_board_admin', homeTeamId] })
    setSaving(false)
  }

  const handleReset = () => {
    setDrawings([])
    if (homeRoster) {
      const rp = homeRoster.slice(0, 7).map(pt => ({
        id: `home-${pt.id}`, name: pt.player?.name ?? '?',
        jerseyNumber: pt.jersey_number, playerId: pt.player_id,
      }))
      setHomePlayers(getDefaultFormation(rp, 'home'))
    }
    if (awayRoster) {
      const rp = awayRoster.slice(0, 7).map(pt => ({
        id: `away-${pt.id}`, name: pt.player?.name ?? '?',
        jerseyNumber: pt.jersey_number, playerId: pt.player_id,
      }))
      setAwayPlayers(getDefaultFormation(rp, 'away'))
    }
  }

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Selecione um campeonato no menu lateral.</div>
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <MapPin className="h-7 w-7 text-pitch-400" />
        <h1 className="text-2xl font-bold text-white">Prancheta Tática</h1>
      </div>

      {/* Team selectors */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoria</label>
              <Select value={categoryId} onValueChange={v => { setCategoryId(v); setHomeTeamId(''); setAwayTeamId('') }}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Time Casa</label>
              <Select value={homeTeamId} onValueChange={setHomeTeamId} disabled={!categoryId}>
                <SelectTrigger><SelectValue placeholder={categoryId ? 'Selecione' : 'Selecione a categoria'} /></SelectTrigger>
                <SelectContent>
                  {(categoryTeams ?? []).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Time Visitante</label>
              <Select value={awayTeamId} onValueChange={setAwayTeamId} disabled={!categoryId}>
                <SelectTrigger><SelectValue placeholder={categoryId ? 'Selecione' : 'Selecione a categoria'} /></SelectTrigger>
                <SelectContent>
                  {(categoryTeams ?? []).filter(t => t.id !== homeTeamId).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-3.5 w-3.5 mr-1" />Resetar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !homeTeamId}><Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {homeTeamId ? (
        <>
          <div className="flex justify-center mb-2">
            {awayTeamId && (
              <button onClick={() => setShowAway(!showAway)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${showAway ? 'bg-navy-800 text-slate-400 hover:bg-navy-700' : 'bg-pitch-600/20 text-pitch-400'}`}>
                {showAway ? '👁️ Ocultar adversário' : '👁️ Mostrar adversário'}
              </button>
            )}
          </div>
          {/* Formation selectors */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-400 font-semibold">{homeTeam?.name ?? 'Casa'}:</span>
              {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
                <button key={`h-${f}`} onClick={() => {
                  setHomeFormation(f)
                  if (!homeRoster) return
                  const rp = homeRoster.slice(0, 7).map(pt => ({ id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
                  setHomePlayers(getDefaultFormation(rp, 'home', orientation, f))
                }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${homeFormation === f ? 'bg-blue-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
                  {f}
                </button>
              ))}
            </div>
            {awayTeamId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-semibold">{awayTeam?.name ?? 'Visitante'}:</span>
                {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
                  <button key={`a-${f}`} onClick={() => {
                    setAwayFormation(f)
                    if (!awayRoster) return
                    const rp = awayRoster.slice(0, 7).map(pt => ({ id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
                    setAwayPlayers(getDefaultFormation(rp, 'away', orientation, f))
                  }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${awayFormation === f ? 'bg-red-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <TacticalBoard
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            homeColor={resolveTeamColors(homeTeam?.primary_color, awayTeam?.primary_color)[0]}
            awayColor={resolveTeamColors(homeTeam?.primary_color, awayTeam?.primary_color)[1]}
            homeTeamName={homeTeam?.name ?? 'Casa'}
            awayTeamName={awayTeam?.name ?? 'Visitante'}
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
              if (id.startsWith('undo:')) return
              setHomePlayers(prev => prev.filter(p => p.id !== id))
              setAwayPlayers(prev => prev.filter(p => p.id !== id))
            }}
            onDrawingsChange={setDrawings}
            initialDrawings={drawings}
            showAway={showAway}
            orientation={orientation}
            onOrientationChange={handleOrientationChange}
          />
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold text-blue-400 mb-2">{homeTeam?.name ?? 'Casa'}</h4>
                <div className="space-y-1">
                  {homePlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">{p.jerseyNumber ?? '?'}</div>
                      <span className="text-slate-300 truncate">{p.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            {awayPlayers.length > 0 && (
              <Card>
                <CardContent className="p-3">
                  <h4 className="text-xs font-semibold text-red-400 mb-2">{awayTeam?.name ?? 'Visitante'}</h4>
                  <div className="space-y-1">
                    {awayPlayers.map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-xs">
                        <div className="h-5 w-5 rounded-full bg-red-600 flex items-center justify-center text-white text-[9px] font-bold">{p.jerseyNumber ?? '?'}</div>
                        <span className="text-slate-300 truncate">{p.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-slate-400">Selecione a categoria e os times para usar a prancheta.</div>
      )}
    </div>
  )
}
