import { Link, Outlet, useLocation } from 'react-router-dom'
import { Trophy, BarChart3, Calendar, Target, ShieldAlert, LogIn, Users, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const navItems = [
  { path: '/', label: 'Início', icon: Trophy },
  { path: '/classificacao', label: 'Classificação', icon: BarChart3 },
  { path: '/jogos', label: 'Jogos', icon: Calendar },
  { path: '/artilharia', label: 'Artilharia', icon: Target },
  { path: '/suspensoes', label: 'Suspensões', icon: ShieldAlert },
  { path: '/amistosos', label: 'Amistosos', icon: Swords },
]

export function PublicLayout() {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-navy-700 bg-navy-950/95 backdrop-blur supports-[backdrop-filter]:bg-navy-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <Trophy className="h-7 w-7 text-pitch-400" />
              <span className="text-lg font-bold text-white hidden sm:block">Futebol Paulistano</span>
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === path
                      ? 'bg-pitch-600/20 text-pitch-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              ))}
              {user && (
                <Link
                  to="/meu-time"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    location.pathname.startsWith('/meu-time')
                      ? 'bg-gold-500/20 text-gold-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <Users className="h-4 w-4" />
                  <span className="hidden md:inline">Meu Time</span>
                </Link>
              )}
              <Link
                to="/login"
                className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-white hover:bg-navy-800 transition-colors"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden md:inline">Admin</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-navy-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-slate-500">
          Futebol Paulistano &copy; {new Date().getFullYear()} — Campeonato de futebol do condomínio
        </div>
      </footer>
    </div>
  )
}
