import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, phaseLabel } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gavel, LogIn, Play, CheckCircle2 } from 'lucide-react'

export default function RefereeDashboard() {
  const { user } = useAuth()

  // Find referee linked to current user
  const { data: referee } = useQuery({
    queryKey: ['my_referee', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referees')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; name: string } | null
    },
    enabled: !!user?.id,
  })

  // Matches assigned to this referee
  const { data: myMatches } = useQuery({
    queryKey: ['my_referee_matches', referee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_referees')
        .select('*, match:matches(*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), category:categories(*))')
        .eq('referee_id', referee!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as any[]
    },
    enabled: !!referee?.id,
  })

  if (!user) {
    return (
      <div className="text-center py-16 space-y-4">
        <Gavel className="h-12 w-12 text-slate-600 mx-auto" />
        <p className="text-slate-400">Faça login para acessar a arbitragem.</p>
        <Link to="/login" className="inline-flex items-center gap-2 px-4 py-2 bg-pitch-600 text-white rounded-lg text-sm font-medium">
          <LogIn className="h-4 w-4" /> Entrar
        </Link>
      </div>
    )
  }

  if (!referee) {
    return (
      <div className="text-center py-16 space-y-4">
        <Gavel className="h-12 w-12 text-slate-600 mx-auto" />
        <p className="text-slate-400">Sua conta ainda não foi vinculada a um árbitro.</p>
        <p className="text-xs text-slate-500">Peça ao administrador para vincular seu email ao cadastro de árbitro.</p>
      </div>
    )
  }

  // Separate matches by status
  const upcoming = myMatches?.filter((mr: any) => mr.match?.match_state !== 'finished') ?? []
  const finished = myMatches?.filter((mr: any) => mr.match?.match_state === 'finished') ?? []

  const roleLabel = (r: string) => r === 'field_1' ? 'Árbitro 1' : r === 'field_2' ? 'Árbitro 2' : 'Mesa'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Gavel className="h-7 w-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Minha Arbitragem</h1>
          <p className="text-sm text-slate-400">Olá, {referee.name}</p>
        </div>
      </div>

      {/* Upcoming / Active matches */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Play className="h-4 w-4" /> Partidas Ativas / Agendadas
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Nenhuma partida agendada.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((mr: any) => {
              const m = mr.match
              if (!m) return null
              const isLive = m.match_state === 'first_half' || m.match_state === 'second_half' || m.match_state === 'halftime'
              return (
                <Link key={mr.id} to={`/arbitragem/${m.id}`}>
                  <Card className={`card-hover ${isLive ? 'border-green-500/40 bg-green-500/5' : 'bg-navy-900 border-navy-700'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {m.home_team?.shield_url ? (
                              <img src={m.home_team.shield_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                {m.home_team?.name?.charAt(0)}
                              </div>
                            )}
                            <span className="font-bold text-white">{m.home_team?.name}</span>
                          </div>
                          <span className="text-slate-500 font-bold">vs</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{m.away_team?.name}</span>
                            {m.away_team?.shield_url ? (
                              <img src={m.away_team.shield_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                {m.away_team?.name?.charAt(0)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isLive && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
                              AO VIVO
                            </Badge>
                          )}
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                            {m.category?.name}
                          </Badge>
                          <Badge className="bg-slate-600/40 text-slate-300 border-slate-500/30 text-[10px]">
                            {roleLabel(mr.role)}
                          </Badge>
                        </div>
                      </div>
                      {m.match_date && (
                        <p className="text-xs text-slate-500 mt-2">{formatDate(m.match_date)} — {phaseLabel(m.phase)}</p>
                      )}
                      {isLive && m.home_score != null && (
                        <p className="text-center text-2xl font-bold text-white mt-2">
                          {m.home_score} × {m.away_score}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Finished matches */}
      {finished.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Partidas Encerradas
          </h2>
          <div className="space-y-2">
            {finished.map((mr: any) => {
              const m = mr.match
              if (!m) return null
              return (
                <Card key={mr.id} className="bg-slate-800/30 border-slate-700/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-600/40 text-slate-400 border-slate-500/30 text-[10px]">
                        {roleLabel(mr.role)}
                      </Badge>
                      <span className="text-sm text-slate-300">
                        {m.home_team?.name} {m.home_score} × {m.away_score} {m.away_team?.name}
                      </span>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                      {m.category?.name}
                    </Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
