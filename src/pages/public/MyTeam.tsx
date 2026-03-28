import { useAuth } from '@/hooks/useAuth'
import { useMyPlayer, useMyTeams, useTeamRoster, useTeamMatches, useActiveChampionship } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Users, Calendar, Shield, Crown, Trophy, ChevronRight, UserCircle, MapPin } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import type { Match, PlayerTeam } from '@/types/database'

const POSITION_COLORS: Record<string, string> = {
  'Goleiro': 'bg-gold-500 text-navy-950',
  'Zagueiro': 'bg-blue-600 text-white',
  'Ala': 'bg-cyan-600 text-white',
  'Meio-campo': 'bg-pitch-600 text-white',
  'Meia-atacante': 'bg-purple-600 text-white',
  'Atacante': 'bg-red-500 text-white',
  'Centroavante': 'bg-orange-500 text-white',
}

function PositionBadge({ pos }: { pos: string }) {
  const colors = POSITION_COLORS[pos] ?? 'bg-navy-600 text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors}`}>
      {pos}
    </span>
  )
}

function getMatchResult(match: Match, teamId: string): 'win' | 'loss' | 'draw' | null {
  if (match.status !== 'finished') return null
  const isHome = match.home_team_id === teamId
  const goalsFor = isHome ? (match.home_score ?? 0) : (match.away_score ?? 0)
  const goalsAgainst = isHome ? (match.away_score ?? 0) : (match.home_score ?? 0)
  if (goalsFor > goalsAgainst) return 'win'
  if (goalsFor < goalsAgainst) return 'loss'
  return 'draw'
}

const RESULT_BORDER: Record<string, string> = {
  win: 'border-l-4 border-l-pitch-500',
  loss: 'border-l-4 border-l-red-500',
  draw: 'border-l-4 border-l-yellow-500',
}

export default function MyTeam() {
  const { user } = useAuth()
  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: myTeamLinks } = useMyTeams(myPlayer?.id)
  const { data: championship } = useActiveChampionship()

  // Find the team link for the active championship
  const activeLink = myTeamLinks?.find(
    (link: any) => link.team?.championship?.id === championship?.id
  )

  const teamId = activeLink?.team_id as string | undefined
  const categoryId = activeLink?.category_id as string | undefined
  const team = activeLink?.team as any

  const { data: roster } = useTeamRoster(teamId, categoryId)
  const { data: matches } = useTeamMatches(championship?.id, teamId)

  // Sort roster: captain first, then goalkeepers, then alphabetical
  const sortedRoster = roster?.slice().sort((a: PlayerTeam, b: PlayerTeam) => {
    if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1
    const aGk = a.positions?.includes('Goleiro') ? 0 : 1
    const bGk = b.positions?.includes('Goleiro') ? 0 : 1
    if (aGk !== bGk) return aGk - bGk
    return (a.player?.name ?? '').localeCompare(b.player?.name ?? '')
  })

  const captain = roster?.find((pt: PlayerTeam) => pt.is_captain)

  const finishedMatches = matches?.filter((m: Match) => m.status === 'finished') ?? []
  const scheduledMatches = matches?.filter((m: Match) => m.status === 'scheduled') ?? []

  // --- Not logged in ---
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Shield className="h-16 w-16 text-slate-600" />
        <p className="text-lg text-slate-400">Faca login para ver seu time</p>
        <Button asChild>
          <Link to="/login">Entrar</Link>
        </Button>
      </div>
    )
  }

  // --- No player linked ---
  if (user && myPlayer === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <UserCircle className="h-16 w-16 text-slate-600" />
        <p className="text-lg text-slate-400 text-center max-w-md">
          Voce ainda nao foi vinculado a nenhum jogador. Peca ao administrador para vincular sua conta.
        </p>
      </div>
    )
  }

  // --- Player found but no team in active championship ---
  if (myPlayer && !activeLink) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Trophy className="h-16 w-16 text-slate-600" />
        <p className="text-lg text-slate-400 text-center max-w-md">
          Voce nao esta inscrito em nenhum time nesta temporada.
        </p>
      </div>
    )
  }

  // --- All good: show team page ---
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        {team?.shield_url ? (
          <img src={team.shield_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-navy-700 flex items-center justify-center text-xl font-bold text-slate-300">
            {team?.name?.charAt(0) ?? '?'}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{team?.name}</h1>
            {activeLink?.category && (
              <Badge variant="secondary">{(activeLink.category as any).name}</Badge>
            )}
            <Badge className="bg-gold-500 text-navy-950 font-bold">Meu Time</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {captain && (
              <span className="text-sm text-gold-400 flex items-center gap-1">
                <Crown className="h-3.5 w-3.5" />
                {captain.player?.name}
              </span>
            )}
            <span className="text-sm text-slate-400 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {roster?.length ?? 0} jogadores
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link to="/meu-time/prancheta">
          <Button variant="outline" className="border-pitch-600/50 text-pitch-400 hover:bg-pitch-600/10">
            <MapPin className="h-4 w-4 mr-2" />Prancheta Tática
          </Button>
        </Link>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Elenco */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserCircle className="h-5 w-5 text-pitch-400" />
            <h2 className="text-base font-semibold text-white">Elenco</h2>
          </div>
          <Card>
            {!sortedRoster || sortedRoster.length === 0 ? (
              <CardContent className="py-8">
                <p className="text-slate-400 text-center">Nenhum jogador no elenco.</p>
              </CardContent>
            ) : (
              sortedRoster.map((pt: PlayerTeam) => {
                const positions = pt.positions?.filter(p => p !== 'Jogador') ?? []
                const isGk = positions.includes('Goleiro')
                const isMe = pt.player_id === myPlayer?.id

                return (
                  <div
                    key={pt.id}
                    className={`flex items-center gap-3 py-3 px-4 border-b border-navy-800 last:border-0 ${isMe ? 'border-l-2 border-l-pitch-500 bg-pitch-500/5' : ''}`}
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 relative ${isGk ? 'bg-gold-500/20 text-gold-400' : 'bg-navy-700 text-slate-300'}`}>
                      {pt.jersey_number ?? pt.player?.name?.charAt(0) ?? '?'}
                      {pt.is_captain && (
                        <div className="absolute -top-1 -right-1 bg-gold-500 rounded-full p-0.5">
                          <Crown className="h-2.5 w-2.5 text-navy-950" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`font-medium text-sm ${isMe ? 'text-pitch-400' : 'text-white'}`}>
                          {pt.player?.name}
                        </p>
                        {pt.is_captain && <Badge variant="warning" className="text-[9px] px-1 py-0">C</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {positions.length > 0 ? positions.map(pos => (
                        <PositionBadge key={pos} pos={pos} />
                      )) : (
                        <span className="text-xs text-slate-600">&mdash;</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </Card>
        </div>

        {/* Right column - Partidas (spanning 2 cols) */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-5 w-5 text-pitch-400" />
            <h2 className="text-base font-semibold text-white">Partidas</h2>
          </div>

          {(!matches || matches.length === 0) ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-slate-400 text-center">Nenhuma partida encontrada.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Proximos Jogos */}
              {scheduledMatches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Proximos Jogos</h3>
                  <div className="space-y-3">
                    {scheduledMatches.map((match: Match) => (
                      <Card key={match.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {phaseLabel(match.phase)}
                            </Badge>
                            <Badge variant="secondary">A realizar</Badge>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 text-right">
                              <span className={`font-bold text-sm ${match.home_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                                {match.home_team?.name}
                              </span>
                            </div>
                            <div className="text-center min-w-[60px]">
                              <span className="text-lg text-slate-500 font-bold">VS</span>
                            </div>
                            <div className="flex-1 text-left">
                              <span className={`font-bold text-sm ${match.away_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                                {match.away_team?.name}
                              </span>
                            </div>
                          </div>
                          {match.match_date && (
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
                              <Calendar className="h-3 w-3" />
                              {formatDate(match.match_date)}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Resultados */}
              {finishedMatches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Resultados</h3>
                  <div className="space-y-3">
                    {finishedMatches.map((match: Match) => {
                      const result = getMatchResult(match, teamId!)
                      const borderClass = result ? RESULT_BORDER[result] : ''

                      return (
                        <Card key={match.id} className={borderClass}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {phaseLabel(match.phase)}
                              </Badge>
                              <Badge variant="default">Encerrado</Badge>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {match.home_team?.shield_url && (
                                    <img src={match.home_team.shield_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                  )}
                                  <span className={`font-bold text-sm ${match.home_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                                    {match.home_team?.name}
                                  </span>
                                </div>
                              </div>
                              <div className="text-center min-w-[80px]">
                                <div className="text-2xl font-extrabold text-white">
                                  {match.home_score} <span className="text-slate-500">&times;</span> {match.away_score}
                                </div>
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold text-sm ${match.away_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                                    {match.away_team?.name}
                                  </span>
                                  {match.away_team?.shield_url && (
                                    <img src={match.away_team.shield_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                              {match.match_date && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(match.match_date)}
                                </span>
                              )}
                              <Link
                                to={`/meu-time/jogo/${match.id}`}
                                className="inline-flex items-center gap-1 text-xs text-pitch-400 hover:text-pitch-300 transition-colors font-medium"
                              >
                                Ver pos-jogo
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
