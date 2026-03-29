import { useMatches, useSuspensions, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import { Calendar, CheckCircle, Clock, ShieldAlert, Trophy, Users, UserCircle, Upload, Ticket } from 'lucide-react'

export default function Dashboard() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: matches } = useMatches(championshipId)
  const { data: suspensions } = useSuspensions(championshipId)
  const { data: champCategories } = useChampionshipCategories(championshipId)

  const finishedMatches = matches?.filter(m => m.status === 'finished').length ?? 0
  const pendingMatches = matches?.filter(m => m.status === 'scheduled').length ?? 0
  const activeSuspensions = suspensions?.filter(s => !s.served).length ?? 0

  const quickLinks = [
    { to: '/admin/campeonatos', label: 'Campeonatos', icon: Trophy, color: 'text-gold-400' },
    { to: '/admin/times', label: 'Times', icon: Users, color: 'text-pitch-400' },
    { to: '/admin/jogadores', label: 'Jogadores', icon: UserCircle, color: 'text-blue-400' },
    { to: '/admin/partidas', label: 'Partidas', icon: Calendar, color: 'text-purple-400' },
    { to: '/admin/suspensoes', label: 'Suspensões', icon: ShieldAlert, color: 'text-red-400' },
    { to: '/admin/importar', label: 'Importar CSV', icon: Upload, color: 'text-orange-400' },
    { to: '/admin/bolao', label: 'Bolão', icon: Ticket, color: 'text-gold-400' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {championship && (
          <div className="text-slate-400 mt-1 flex items-center gap-2">
            <span>{championship.name} — Temporada {championship.season_year}</span>
            <Badge variant="default">{championship.status === 'active' ? 'Ativo' : championship.status}</Badge>
          </div>
        )}
        {!championship && <p className="text-slate-400 mt-1">Nenhum campeonato ativo. Crie um na seção Campeonatos.</p>}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-pitch-600/20 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-pitch-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{finishedMatches}</p>
              <p className="text-sm text-slate-400">Jogos Realizados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-600/20 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{pendingMatches}</p>
              <p className="text-sm text-slate-400">Jogos Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-red-600/20 p-3 rounded-lg">
              <ShieldAlert className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeSuspensions}</p>
              <p className="text-sm text-slate-400">Suspensões Ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-gold-500/20 p-3 rounded-lg">
              <Trophy className="h-6 w-6 text-gold-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{champCategories?.length ?? 0}</p>
              <p className="text-sm text-slate-400">Categorias</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Acesso Rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickLinks.map(({ to, label, icon: Icon, color }) => (
            <Link key={to} to={to}>
              <Card className="card-hover">
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <span className="text-sm font-medium text-slate-300">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
