import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTeamRoster } from '@/hooks/useSupabase'
import TacticalBoard, { getDefaultFormation, rotatePositions, FORMATIONS } from '@/components/TacticalBoard'
import type { FieldOrientation, FormationName } from '@/components/TacticalBoard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Calendar, MapPin, Swords } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'

export default function PreGame() {
  const { teamId, matchId } = useParams()

  const { data: match } = useQuery({
    queryKey: ['match_pregame', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(id, name, primary_color, secondary_color, shield_url), away_team:teams!matches_away_team_id_fkey(id, name, primary_color, secondary_color, shield_url)')
        .eq('id', matchId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!matchId,
  })

  const isHome = match?.home_team_id === teamId
  const myTeamData = isHome ? match?.home_team : match?.away_team
  const opponentTeamData = isHome ? match?.away_team : match?.home_team
  const opponentTeamId = opponentTeamData?.id as string | undefined

  // Find categories by checking player_teams
  const { data: myCatId } = useQuery({
    queryKey: ['team_category', teamId],
    queryFn: async () => {
      const { data } = await supabase.from('player_teams').select('category_id').eq('team_id', teamId!).limit(1)
      return data?.[0]?.category_id as string | null ?? null
    },
    enabled: !!teamId,
  })

  const { data: opponentCatId } = useQuery({
    queryKey: ['team_category', opponentTeamId],
    queryFn: async () => {
      const { data } = await supabase.from('player_teams').select('category_id').eq('team_id', opponentTeamId!).limit(1)
      return data?.[0]?.category_id as string | null ?? null
    },
    enabled: !!opponentTeamId,
  })

  const { data: myRoster } = useTeamRoster(teamId, myCatId ?? undefined)
  const { data: opponentRoster } = useTeamRoster(opponentTeamId, opponentCatId ?? undefined)

  const [orientation, setOrientation] = useState<FieldOrientation>('portrait')
  const [homeFormation, setHomeFormation] = useState<FormationName>('3-2-1')
  const [awayFormation, setAwayFormation] = useState<FormationName>('3-2-1')
  const [homePlayers, setHomePlayers] = useState<any[]>([])
  const [awayPlayers, setAwayPlayers] = useState<any[]>([])
  const [drawings, setDrawings] = useState<any[]>([])

  useEffect(() => {
    if (!myRoster) return
    const rp = myRoster.slice(0, 7).map(pt => ({
      id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setHomePlayers(getDefaultFormation(rp, 'home', orientation, homeFormation))
  }, [myRoster, homeFormation])

  useEffect(() => {
    if (!opponentRoster) return
    const rp = opponentRoster.slice(0, 7).map(pt => ({
      id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setAwayPlayers(getDefaultFormation(rp, 'away', orientation, awayFormation))
  }, [opponentRoster, awayFormation])

  const handleOrientationChange = (newO: FieldOrientation) => {
    setHomePlayers(prev => rotatePositions(prev, orientation, newO))
    setAwayPlayers(prev => rotatePositions(prev, orientation, newO))
    setOrientation(newO)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link to={`/times/${teamId}`} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" />Voltar ao Time
      </Link>

      <div className="flex items-center gap-3">
        <Swords className="h-6 w-6 text-pitch-400" />
        <h1 className="text-xl font-bold text-white">Preparação para o Jogo</h1>
      </div>

      {/* Match header */}
      {match && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary">{phaseLabel(match.phase)}</Badge>
              <Badge variant="outline">A realizar</Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-center">
                {match.home_team?.shield_url && (
                  <img src={match.home_team.shield_url} alt="" className="h-14 w-14 rounded-full mx-auto mb-2 object-cover" />
                )}
                <p className={`font-bold text-sm ${match.home_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                  {match.home_team?.name}
                </p>
              </div>
              <div className="text-slate-400 font-extrabold text-xl">VS</div>
              <div className="flex-1 text-center">
                {match.away_team?.shield_url && (
                  <img src={match.away_team.shield_url} alt="" className="h-14 w-14 rounded-full mx-auto mb-2 object-cover" />
                )}
                <p className={`font-bold text-sm ${match.away_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                  {match.away_team?.name}
                </p>
              </div>
            </div>
            {(match.match_date || match.location) && (
              <div className="flex items-center justify-center gap-4 mt-3 text-xs text-slate-400">
                {match.match_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{formatDate(match.match_date)}
                  </span>
                )}
                {match.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{match.location}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formation selectors */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-blue-400 font-semibold">{myTeamData?.name ?? 'Meu Time'}:</span>
          {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
            <button key={`h-${f}`} onClick={() => setHomeFormation(f)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${homeFormation === f ? 'bg-blue-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>
              {f}
            </button>
          ))}
        </div>
        {opponentTeamData && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-red-400 font-semibold">{opponentTeamData.name}:</span>
            {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
              <button key={`a-${f}`} onClick={() => setAwayFormation(f)}
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
        homeColor={(myTeamData as any)?.primary_color ?? '#1d4ed8'}
        awayColor={(opponentTeamData as any)?.primary_color ?? '#dc2626'}
        homeTeamName={myTeamData?.name ?? 'Meu Time'}
        awayTeamName={opponentTeamData?.name ?? 'Adversário'}
        onPlayerMove={(id, x, y) => {
          setHomePlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
          setAwayPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
        }}
        onPlayersSwap={(id1, id2) => {
          const doSwap = (list: any[], setList: (fn: (prev: any[]) => any[]) => void) => {
            const p1 = list.find(p => p.id === id1)
            const p2 = list.find(p => p.id === id2)
            if (p1 && p2) setList(prev => prev.map(p => p.id === id1 ? { ...p, x: p2.x, y: p2.y } : p.id === id2 ? { ...p, x: p1.x, y: p1.y } : p))
          }
          doSwap(homePlayers, setHomePlayers)
          doSwap(awayPlayers, setAwayPlayers)
        }}
        onPlayerEject={(id) => {
          if (id.startsWith('undo:')) return
          setHomePlayers(prev => prev.filter(p => p.id !== id))
          setAwayPlayers(prev => prev.filter(p => p.id !== id))
        }}
        onDrawingsChange={setDrawings}
        initialDrawings={drawings}
        showAway={true}
        orientation={orientation}
        onOrientationChange={handleOrientationChange}
      />

      {/* Rosters side by side */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-3">
            <h4 className="text-xs font-semibold text-blue-400 mb-2">{myTeamData?.name ?? 'Meu Time'}</h4>
            <div className="space-y-1">
              {homePlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: (myTeamData as any)?.primary_color ?? '#1d4ed8', color: (myTeamData as any)?.secondary_color ?? '#fff' }}>
                    {p.jerseyNumber ?? '?'}
                  </div>
                  <span className="text-slate-300 truncate">{p.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <h4 className="text-xs font-semibold text-red-400 mb-2">{opponentTeamData?.name ?? 'Adversário'}</h4>
            <div className="space-y-1">
              {awayPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: (opponentTeamData as any)?.primary_color ?? '#dc2626', color: (opponentTeamData as any)?.secondary_color ?? '#fff' }}>
                    {p.jerseyNumber ?? '?'}
                  </div>
                  <span className="text-slate-300 truncate">{p.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
