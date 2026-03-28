import { Link, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AdminChampionshipProvider } from '@/hooks/useAdminChampionship'
import { AdminChampionshipSelector } from '@/components/AdminChampionshipSelector'
import {
  LayoutDashboard, Trophy, Users, UserCircle, Calendar, ShieldAlert, Upload, LogOut, ChevronLeft, BarChart3, MapPin, Swords, Gavel,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const sidebarItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/campeonatos', label: 'Campeonatos', icon: Trophy },
  { path: '/admin/classificacao', label: 'Classificação', icon: BarChart3 },
  { path: '/admin/times', label: 'Times', icon: Users },
  { path: '/admin/jogadores', label: 'Jogadores', icon: UserCircle },
  { path: '/admin/partidas', label: 'Partidas', icon: Calendar },
  { path: '/admin/suspensoes', label: 'Suspensões', icon: ShieldAlert },
  { path: '/admin/importar', label: 'Importar CSV', icon: Upload },
  { path: '/admin/prancheta', label: 'Prancheta Tática', icon: MapPin },
  { path: '/admin/arbitragem', label: 'Arbitragem', icon: Gavel },
  { path: '/admin/amistosos', label: 'Amistosos', icon: Swords },
]

export function AdminLayout() {
  const { user, isAdmin, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch-500" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />
  }

  return (
    <AdminChampionshipProvider>
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-navy-700 bg-navy-900 flex flex-col fixed h-full">
        <div className="p-4 border-b border-navy-700">
          <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-3">
            <ChevronLeft className="h-4 w-4" />
            Voltar ao site
          </Link>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-pitch-400" />
            Admin
          </h2>
        </div>
        <AdminChampionshipSelector />
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                location.pathname === path
                  ? 'bg-pitch-600/20 text-pitch-400'
                  : 'text-slate-400 hover:text-white hover:bg-navy-800'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-navy-700">
          <div className="text-xs text-slate-500 mb-2 px-3 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-400" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 ml-64">
        <div className="p-6 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
    </AdminChampionshipProvider>
  )
}
