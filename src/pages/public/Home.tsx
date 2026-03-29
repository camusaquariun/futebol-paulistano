import { Link } from 'react-router-dom'
import { useActiveChampionship, useChampionshipCategories, useCategories, useMatches } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, BarChart3, Calendar, Target, ShieldAlert, Clock, ChevronRight } from 'lucide-react'
import { TeamBadge } from '@/components/TeamBadge'

export default function Home() {
  const { data: championship, isLoading } = useActiveChampionship()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const { data: categories } = useCategories()
  const { data: allMatches } = useMatches(championship?.id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch-500" />
      </div>
    )
  }

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const categoryColors: Record<string, string> = {
    Livre: 'from-pitch-600 to-pitch-800',
    Master: 'from-blue-600 to-blue-800',
    Veterano: 'from-gold-500 to-gold-700',
  }

  const categoryIcons: Record<string, string> = {
    Livre: '⚡',
    Master: '💪',
    Veterano: '🏆',
  }

  const upcomingMatches = allMatches
    ?.filter(m => m.status === 'scheduled' && m.match_date)
    .sort((a, b) => new Date(a.match_date!).getTime() - new Date(b.match_date!).getTime())
    .slice(0, 4) ?? []

  const recentMatches = allMatches
    ?.filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.match_date ?? 0).getTime() - new Date(a.match_date ?? 0).getTime())
    .slice(0, 4) ?? []

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center py-12 sm:py-16">
        <div className="inline-flex items-center gap-3 bg-pitch-600/10 border border-pitch-600/30 rounded-full px-6 py-2 mb-6">
          <Trophy className="h-5 w-5 text-gold-400" />
          <span className="text-pitch-300 text-sm font-medium">Campeonato Oficial</span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
          {championship?.name || 'Futebol Paulistano'}
        </h1>
        {championship && (
          <p className="text-xl sm:text-2xl text-gold-400 font-bold">
            Temporada {championship.season_year}
          </p>
        )}
        {!championship && (
          <p className="text-lg text-slate-400 mt-4">Nenhum campeonato ativo no momento</p>
        )}
      </div>

      {/* Category Cards */}
      {activeCategories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {activeCategories.map(cat => (
            <Link key={cat.id} to={`/classificacao`}>
              <Card className={`card-hover overflow-hidden border-0 bg-gradient-to-br ${categoryColors[cat.name] || 'from-navy-600 to-navy-800'}`}>
                <CardContent className="p-6 text-center">
                  <div className="text-4xl mb-3">{categoryIcons[cat.name] || '⚽'}</div>
                  {(() => {
                    const cc = champCategories?.find((c: any) => c.category_id === cat.id)
                    const title = (cc as any)?.custom_title || cat.name
                    const desc = (cc as any)?.custom_description || cat.description
                    return (
                      <>
                        <h3 className="text-xl font-bold text-white">{title}</h3>
                        {desc && <p className="text-white/70 text-sm mt-1">{desc}</p>}
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Upcoming Matches */}
      {upcomingMatches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">Próximos Jogos</h2>
            </div>
            <Link to="/jogos" className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upcomingMatches.map(match => (
              <Link key={match.id} to={`/partidas/${match.id}/ao-vivo`}>
                <Card className="card-hover bg-[#0f1a2e] border-slate-700/50 hover:border-purple-500/50 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {match.category?.name}
                      </Badge>
                      {match.match_date && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(match.match_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          {' '}
                          {new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="sm" />
                        <span className="text-sm font-semibold text-white truncate">{match.home_team?.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-500 flex-shrink-0">VS</span>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-sm font-semibold text-white truncate">{match.away_team?.name}</span>
                        <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Results */}
      {recentMatches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-gold-400" />
              <h2 className="text-lg font-bold text-white">Últimos Resultados</h2>
            </div>
            <Link to="/jogos" className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentMatches.map(match => (
              <Link key={match.id} to={`/partidas/${match.id}/ao-vivo`}>
                <Card className="card-hover bg-[#0f1a2e] border-slate-700/50 hover:border-pitch-500/50 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        {match.category?.name}
                      </Badge>
                      {match.match_date && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="sm" />
                        <span className="text-sm font-semibold text-white truncate">{match.home_team?.name}</span>
                      </div>
                      <div className="flex-shrink-0 text-center px-2">
                        <span className="text-lg font-extrabold text-gold-400">
                          {match.home_score} <span className="text-slate-500 text-base">×</span> {match.away_score}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-sm font-semibold text-white truncate">{match.away_team?.name}</span>
                        <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { to: '/classificacao', label: 'Classificação', icon: BarChart3, color: 'text-pitch-400' },
          { to: '/jogos', label: 'Jogos e Resultados', icon: Calendar, color: 'text-blue-400' },
          { to: '/artilharia', label: 'Artilharia', icon: Target, color: 'text-gold-400' },
          { to: '/suspensoes', label: 'Suspensões', icon: ShieldAlert, color: 'text-red-400' },
        ].map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}>
            <Card className="card-hover h-full">
              <CardContent className="p-5 text-center flex flex-col items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <span className="text-sm font-medium text-slate-300">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
