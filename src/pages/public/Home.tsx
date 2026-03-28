import { Link } from 'react-router-dom'
import { useActiveChampionship, useChampionshipCategories, useCategories } from '@/hooks/useSupabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, BarChart3, Calendar, Target, ShieldAlert, Users } from 'lucide-react'

export default function Home() {
  const { data: championship, isLoading } = useActiveChampionship()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const { data: categories } = useCategories()

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

  return (
    <div className="space-y-8">
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
                  <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                  <p className="text-white/70 text-sm mt-1">
                    {cat.name === 'Livre' && 'Categoria aberta'}
                    {cat.name === 'Master' && 'Acima de 35 anos'}
                    {cat.name === 'Veterano' && 'Acima de 45 anos'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
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
