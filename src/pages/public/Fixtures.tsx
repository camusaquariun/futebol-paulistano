import { Link } from 'react-router-dom'
import { useActiveChampionship, useMatches } from '@/hooks/useSupabase'
import { CategoryTabs } from '@/components/CategoryTabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'
import { TeamBadge } from '@/components/TeamBadge'
import type { Match, MatchPhase } from '@/types/database'

function MatchCard({ match }: { match: Match }) {
  const isFinished = match.status === 'finished'
  const isKnockout = ['semifinal', 'terceiro_lugar', 'final'].includes(match.phase)
  const hasPenalties = match.home_penalties != null && match.away_penalties != null
  const hasExtra = match.home_score_extra != null && match.away_score_extra != null

  return (
    <Link to={`/partidas/${match.id}/ao-vivo`} className="block">
    <Card className="card-hover cursor-pointer transition-all hover:ring-1 hover:ring-pitch-500/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Badge variant={isFinished ? 'default' : 'secondary'}>
            {isFinished ? 'Encerrado' : 'A realizar'}
          </Badge>
          {match.match_date && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(match.match_date)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="font-bold text-white text-sm sm:text-base">{match.home_team?.name}</span>
              <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="md" />
            </div>
          </div>
          <div className="flex-shrink-0 text-center min-w-[80px]">
            {isFinished ? (
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {match.home_score} <span className="text-slate-500">×</span> {match.away_score}
                </div>
                {hasExtra && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    Prorr: {match.home_score_extra} × {match.away_score_extra}
                  </div>
                )}
                {hasPenalties && (
                  <div className="text-xs text-gold-400 mt-0.5">
                    Pen: {match.home_penalties} × {match.away_penalties}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-lg text-slate-500 font-bold">VS</span>
            )}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="md" />
              <span className="font-bold text-white text-sm sm:text-base">{match.away_team?.name}</span>
            </div>
          </div>
        </div>
        {match.location && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-3">
            <MapPin className="h-3 w-3" />
            {match.location}
          </div>
        )}
      </CardContent>
    </Card>
    </Link>
  )
}

function KnockoutBracket({ matches }: { matches: Match[] }) {
  const semis = matches.filter(m => m.phase === 'semifinal')
  const thirdPlace = matches.find(m => m.phase === 'terceiro_lugar')
  const final_ = matches.find(m => m.phase === 'final')

  if (semis.length === 0 && !final_) return null

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-white mb-4">Chave Mata-Mata</h3>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-8">
        {/* Semifinals */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-slate-400 text-center">Semifinais</h4>
          {semis.map(m => (
            <div key={m.id} className="w-64">
              <MatchCard match={m} />
            </div>
          ))}
        </div>
        {/* Arrow */}
        {(final_ || thirdPlace) && (
          <div className="hidden lg:flex text-slate-600 text-4xl">→</div>
        )}
        {/* Final & Third Place */}
        <div className="space-y-4">
          {final_ && (
            <div>
              <h4 className="text-sm font-medium text-gold-400 text-center mb-2">Final</h4>
              <div className="w-64">
                <MatchCard match={final_} />
              </div>
            </div>
          )}
          {thirdPlace && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 text-center mb-2">Terceiro Lugar</h4>
              <div className="w-64">
                <MatchCard match={thirdPlace} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FixturesByCategory({ categoryId }: { categoryId: string }) {
  const { data: championship } = useActiveChampionship()
  const { data: matches, isLoading } = useMatches(championship?.id, categoryId)

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
  }

  if (!matches || matches.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum jogo cadastrado nesta categoria.</div>
  }

  const phases: MatchPhase[] = ['grupos', 'semifinal', 'terceiro_lugar', 'final']
  const groupedByPhase = phases.reduce((acc, phase) => {
    const phaseMatches = matches.filter(m => m.phase === phase)
    if (phaseMatches.length > 0) acc[phase] = phaseMatches
    return acc
  }, {} as Record<string, Match[]>)

  const knockoutMatches = matches.filter(m => m.phase !== 'grupos')

  return (
    <div className="space-y-8">
      {/* Group Phase */}
      {groupedByPhase['grupos'] && (() => {
        const grupoMatches = groupedByPhase['grupos']
        const hasMatchdays = grupoMatches.some(m => m.matchday != null)
        if (hasMatchdays) {
          // Group by matchday
          const byMatchday = new Map<number, Match[]>()
          const noMatchday: Match[] = []
          grupoMatches.forEach(m => {
            if (m.matchday != null) {
              const list = byMatchday.get(m.matchday) ?? []
              list.push(m)
              byMatchday.set(m.matchday, list)
            } else {
              noMatchday.push(m)
            }
          })
          const sortedDays = Array.from(byMatchday.keys()).sort((a, b) => a - b)
          return (
            <div className="space-y-6">
              {sortedDays.map(day => (
                <div key={day}>
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <span className="bg-pitch-600/20 text-pitch-400 px-3 py-1 rounded-full text-sm">Rodada {day}</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {byMatchday.get(day)!.map(match => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                  </div>
                </div>
              ))}
              {noMatchday.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-3">Sem rodada definida</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {noMatchday.map(match => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }
        return (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">{phaseLabel('grupos')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {grupoMatches.map(match => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        )
      })()}
      {/* Knockout Bracket */}
      {knockoutMatches.length > 0 && <KnockoutBracket matches={knockoutMatches} />}
    </div>
  )
}

export default function Fixtures() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-7 w-7 text-pitch-400" />
        <h1 className="text-2xl font-bold text-white">Jogos e Resultados</h1>
      </div>
      <CategoryTabs>
        {(categoryId) => <FixturesByCategory categoryId={categoryId} />}
      </CategoryTabs>
    </div>
  )
}
