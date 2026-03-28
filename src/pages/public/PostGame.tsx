import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  useMyPlayer,
  useMatch,
  useMatchEvents,
  useTeamRoster,
  usePostGameComments,
  usePostGameVotes,
} from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Trophy, Star, MessageCircle, Send, MapPin } from 'lucide-react'
import { phaseLabel } from '@/lib/utils'
import type { Match, MatchEvent } from '@/types/database'

export default function PostGame() {
  const { matchId } = useParams<{ matchId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: match } = useMatch(matchId)
  const { data: events } = useMatchEvents(matchId)
  const { data: comments } = usePostGameComments(matchId)
  const { data: votes } = usePostGameVotes(matchId)

  // Determine which team the player belongs to
  const { data: playerTeams } = useQuery({
    queryKey: ['player_teams_for_post_game', myPlayer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_teams')
        .select('team_id')
        .eq('player_id', myPlayer!.id)
      if (error) throw error
      return data as { team_id: string }[]
    },
    enabled: !!myPlayer?.id,
  })

  const myTeamId = (() => {
    if (!match || !playerTeams) return undefined
    const teamIds = playerTeams.map(pt => pt.team_id)
    if (teamIds.includes(match.home_team_id)) return match.home_team_id
    if (teamIds.includes(match.away_team_id)) return match.away_team_id
    return undefined
  })()

  const isOnTeam = !!myTeamId
  const { data: roster } = useTeamRoster(myTeamId, match?.category_id)

  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [votingFor, setVotingFor] = useState<string | null>(null)

  // Access control
  if (!user || !myPlayer || (match && playerTeams && !isOnTeam)) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center px-4">
        <Card className="bg-[#0f1a2e] border-slate-700/50 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <p className="text-slate-300 text-lg font-semibold">
              Acesso restrito aos jogadores deste time
            </p>
            <Link
              to="/meu-time"
              className="inline-flex items-center gap-2 mt-4 text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar para Meu Time
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (!match) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-400" />
      </div>
    )
  }

  // Card counts
  const homeYellows = events?.filter(
    (e: MatchEvent) => e.event_type === 'yellow_card' && e.team_id === match.home_team_id
  ).length ?? 0
  const awayYellows = events?.filter(
    (e: MatchEvent) => e.event_type === 'yellow_card' && e.team_id === match.away_team_id
  ).length ?? 0
  const homeReds = events?.filter(
    (e: MatchEvent) => e.event_type === 'red_card' && e.team_id === match.home_team_id
  ).length ?? 0
  const awayReds = events?.filter(
    (e: MatchEvent) => e.event_type === 'red_card' && e.team_id === match.away_team_id
  ).length ?? 0

  // Goal scorers by team
  const homeGoals = events?.filter(
    (e: MatchEvent) => e.event_type === 'goal' && e.team_id === match.home_team_id
  ) ?? []
  const awayGoals = events?.filter(
    (e: MatchEvent) => e.event_type === 'goal' && e.team_id === match.away_team_id
  ) ?? []

  // Vote logic
  const myVote = votes?.find(v => v.voter_player_id === myPlayer.id)
  const voteCounts: Record<string, number> = {}
  for (const v of votes ?? []) {
    voteCounts[v.voted_player_id] = (voteCounts[v.voted_player_id] ?? 0) + 1
  }
  const topVotedId = Object.entries(voteCounts).sort(([, a], [, b]) => b - a)[0]?.[0]

  const castVote = async (playerId: string) => {
    if (!matchId || !user || !myPlayer) return
    setVotingFor(playerId)
    if (myVote) {
      await supabase
        .from('post_game_votes')
        .update({ voted_player_id: playerId })
        .eq('id', myVote.id)
    } else {
      await supabase.from('post_game_votes').insert({
        match_id: matchId,
        voter_player_id: myPlayer.id,
        voted_player_id: playerId,
        user_id: user.id,
      })
    }
    setVotingFor(null)
    queryClient.invalidateQueries({ queryKey: ['post_game_votes', matchId] })
  }

  const sendComment = async () => {
    if (!comment.trim() || !matchId || !user || !myPlayer) return
    setSendingComment(true)
    await supabase.from('post_game_comments').insert({
      match_id: matchId,
      player_id: myPlayer.id,
      user_id: user.id,
      comment: comment.trim(),
    })
    setComment('')
    setSendingComment(false)
    queryClient.invalidateQueries({ queryKey: ['post_game_comments', matchId] })
  }

  function eventIcon(type: string) {
    switch (type) {
      case 'goal':
        return '\u26BD'
      case 'yellow_card':
        return '\uD83D\uDFE8'
      case 'red_card':
        return '\uD83D\uDFE5'
      default:
        return '\u25CF'
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100">
      {/* Header */}
      <header className="bg-[#0f1a2e] border-b border-slate-700/50 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/meu-time"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para Meu Time
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ==================== Match Summary ==================== */}
        <Card className="bg-[#0f1a2e] border-slate-700/50">
          <CardContent className="p-6">
            {/* Badges */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <Badge className="bg-slate-600/40 text-slate-300 border-slate-500/30">
                {phaseLabel(match.phase)}
              </Badge>
              {match.category && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  {match.category.name}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              {/* Home team */}
              <div className="flex-1 text-center">
                {match.home_team?.shield_url ? (
                  <img
                    src={match.home_team.shield_url}
                    alt={match.home_team.name}
                    className="h-16 w-16 rounded-full object-cover mx-auto mb-2 border-2 border-slate-600"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold text-slate-400 mx-auto mb-2">
                    {match.home_team?.name?.charAt(0)}
                  </div>
                )}
                <p className="font-bold text-white text-sm sm:text-base">
                  {match.home_team?.name}
                </p>
                {/* Card icons */}
                <div className="flex items-center justify-center gap-1 mt-1 min-h-[20px]">
                  {Array.from({ length: homeYellows }).map((_, i) => (
                    <span key={`hy${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-yellow-400" />
                  ))}
                  {Array.from({ length: homeReds }).map((_, i) => (
                    <span key={`hr${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-red-500" />
                  ))}
                </div>
                {/* Goal scorers */}
                {homeGoals.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {homeGoals.map((e: MatchEvent) => (
                      <p key={e.id} className="text-[11px] text-slate-400">
                        {'\u26BD'} {e.player?.name} {e.minute != null ? `${e.minute}'` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Score */}
              <div className="text-center">
                <div className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight">
                  {match.home_score}{' '}
                  <span className="text-slate-500 text-3xl sm:text-4xl mx-1">&times;</span>{' '}
                  {match.away_score}
                </div>
                {match.home_penalties != null && match.away_penalties != null && (
                  <p className="text-xs text-amber-400 mt-1">
                    P&ecirc;n: {match.home_penalties} &times; {match.away_penalties}
                  </p>
                )}
              </div>

              {/* Away team */}
              <div className="flex-1 text-center">
                {match.away_team?.shield_url ? (
                  <img
                    src={match.away_team.shield_url}
                    alt={match.away_team.name}
                    className="h-16 w-16 rounded-full object-cover mx-auto mb-2 border-2 border-slate-600"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold text-slate-400 mx-auto mb-2">
                    {match.away_team?.name?.charAt(0)}
                  </div>
                )}
                <p className="font-bold text-white text-sm sm:text-base">
                  {match.away_team?.name}
                </p>
                {/* Card icons */}
                <div className="flex items-center justify-center gap-1 mt-1 min-h-[20px]">
                  {Array.from({ length: awayYellows }).map((_, i) => (
                    <span key={`ay${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-yellow-400" />
                  ))}
                  {Array.from({ length: awayReds }).map((_, i) => (
                    <span key={`ar${i}`} className="inline-block w-3.5 h-5 rounded-sm bg-red-500" />
                  ))}
                </div>
                {/* Goal scorers */}
                {awayGoals.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {awayGoals.map((e: MatchEvent) => (
                      <p key={e.id} className="text-[11px] text-slate-400">
                        {'\u26BD'} {e.player?.name} {e.minute != null ? `${e.minute}'` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ==================== Events Timeline ==================== */}
        {events && events.length > 0 && (
          <Card className="bg-[#0f1a2e] border-slate-700/50">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Eventos da Partida
              </h3>
              <div className="space-y-2">
                {events.map((event: MatchEvent) => {
                  const isHome = event.team_id === match.home_team_id
                  return (
                    <div
                      key={event.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border-l-4 ${
                        isHome
                          ? 'bg-blue-900/15 border-l-blue-500'
                          : 'bg-red-900/15 border-l-red-500'
                      }`}
                    >
                      <span className="text-lg" role="img">
                        {eventIcon(event.event_type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {event.event_type === 'own_goal' ? (
                            <span className="text-red-400">Gol Contra</span>
                          ) : (
                            event.player?.name ?? 'Jogador'
                          )}
                        </p>
                        <p className={`text-xs font-medium truncate ${isHome ? 'text-blue-400' : 'text-red-400'}`}>
                          {event.team?.name}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-700/50 rounded px-2 py-0.5">
                        {event.half === 2 ? '2\u00BAT' : '1\u00BAT'}
                        {event.minute != null ? ` ${event.minute}'` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== Melhor do Time (Voting) ==================== */}
        <Card className="bg-[#0f1a2e] border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                Vota&ccedil;&atilde;o Melhor do Time
              </h3>
              {votes && (
                <span className="text-xs text-slate-500">
                  {votes.length} voto{votes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {roster && roster.length > 0 ? (
              <div className="space-y-1.5">
                {roster.map(pt => {
                  const player = pt.player
                  if (!player) return null
                  const count = voteCounts[player.id] ?? 0
                  const isMyVote = myVote?.voted_player_id === player.id
                  const isTop = player.id === topVotedId && count > 0
                  return (
                    <button
                      key={player.id}
                      onClick={() => castVote(player.id)}
                      disabled={votingFor !== null}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                        isMyVote
                          ? 'bg-amber-500/15 border border-amber-500/40'
                          : 'bg-slate-800/40 border border-transparent hover:border-slate-600'
                      }`}
                    >
                      {isTop && (
                        <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-white flex-1 truncate">
                        {pt.jersey_number != null && (
                          <span className="text-slate-500 mr-1">#{pt.jersey_number}</span>
                        )}
                        {player.name}
                      </span>
                      {count > 0 && (
                        <span
                          className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                            isTop
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                      {isMyVote && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                          Seu voto
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-3">
                Carregando elenco...
              </p>
            )}
          </CardContent>
        </Card>

        {/* ==================== Comentarios Pos-Jogo ==================== */}
        <Card className="bg-[#0f1a2e] border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Coment&aacute;rios P&oacute;s-Jogo
              </h3>
            </div>

            {/* Comment input */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendComment()}
                placeholder="Deixe seu coment&aacute;rio..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
                maxLength={500}
              />
              <Button
                onClick={sendComment}
                disabled={sendingComment || !comment.trim()}
                className="px-3 bg-amber-600 hover:bg-amber-700"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {/* Comments list */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {comments && comments.length > 0 ? (
                comments.map(msg => (
                  <div key={msg.id} className="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-amber-400 truncate">
                        {msg.player?.name ?? 'Jogador'}
                      </span>
                      <span className="text-[10px] text-slate-600 flex-shrink-0">
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' \u00B7 '}
                        {new Date(msg.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-0.5 break-words">{msg.comment}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600 text-center py-4">
                  Nenhum coment&aacute;rio ainda. Seja o primeiro!
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Prancheta Tática link */}
        <Card className="bg-[#0f1a2e] border-pitch-500/30">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-pitch-400" />
              <h3 className="text-sm font-semibold text-pitch-400 uppercase tracking-wider">
                Prancheta Tática
              </h3>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Monte a escalação e posicionamento do time
            </p>
            <Link to="/meu-time/prancheta">
              <button className="px-4 py-2 bg-pitch-600 hover:bg-pitch-700 text-white rounded-lg text-sm font-medium transition-colors">
                Abrir Prancheta
              </button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
