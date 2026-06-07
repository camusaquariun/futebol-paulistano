import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy, BarChart3, Calendar, Target, ShieldAlert, LogIn, Users, Swords, Ticket, Gavel, Sun, Moon, Menu, X, UserCircle, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'

const navItems = [
  { path: '/', label: 'Início', icon: Trophy },
  { path: '/classificacao', label: 'Classificação', icon: BarChart3 },
  { path: '/jogos', label: 'Jogos', icon: Calendar },
  { path: '/artilharia', label: 'Artilharia', icon: Target },
  { path: '/suspensoes', label: 'Suspensões', icon: ShieldAlert },
  { path: '/amistosos', label: 'Amistosos', icon: Swords },
  { path: '/bolao', label: 'Bolão', icon: Ticket },
]

export function PublicLayout() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  // Is the logged-in user registered as a referee?
  const { data: isReferee } = useQuery({
    queryKey: ['am_i_referee', user?.id],
    queryFn: async () => {
      if (!user) return false
      const { data } = await supabase.from('referees').select('id').eq('user_id', user.id).limit(1)
      return (data?.length ?? 0) > 0
    },
    enabled: !!user,
  })

  const allNavItems = [
    ...navItems,
    ...(user ? [
      { path: '/meu-time', label: 'Meu Time', icon: Users },
      { path: '/meus-jogos', label: 'Meus Jogos', icon: CalendarDays },
    ] : []),
    ...(user && isReferee ? [
      { path: '/arbitragem', label: 'Arbitragem', icon: Gavel },
    ] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-navy-700 bg-navy-950/95 backdrop-blur supports-[backdrop-filter]:bg-navy-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0" aria-label="Copa do Mundo Paulistano">
              <img
                src="/Logo-oficial-azul.png"
                alt="Copa do Mundo Paulistano"
                className="h-12 w-auto"
              />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {allNavItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                      ? 'bg-pitch-600/20 text-pitch-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              ))}
              <button
                onClick={toggleTheme}
                className="ml-1 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              {user && (
                <Link
                  to="/meu-perfil"
                  className={cn(
                    'ml-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === '/meu-perfil'
                      ? 'bg-pitch-600/20 text-pitch-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <UserCircle className="h-4 w-4" />
                  <span>Perfil</span>
                </Link>
              )}
              <Link
                to={user && isAdmin ? '/admin' : '/login'}
                className={cn(
                  'ml-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  user
                    ? 'text-slate-500 hover:text-white hover:bg-navy-800'
                    : 'bg-pitch-600/20 text-pitch-400 hover:bg-pitch-600/30'
                )}
              >
                <LogIn className="h-4 w-4" />
                <span>{user && isAdmin ? 'Admin' : 'Entrar'}</span>
              </Link>
            </nav>

            {/* Mobile right side */}
            <div className="flex items-center gap-1 md:hidden">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                aria-label="Menu"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-navy-700 bg-navy-950">
            <nav className="px-4 py-3 space-y-1">
              {allNavItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                      ? 'bg-pitch-600/20 text-pitch-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
              {user && (
                <Link
                  to="/meu-perfil"
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === '/meu-perfil'
                      ? 'bg-pitch-600/20 text-pitch-400'
                      : 'text-slate-400 hover:text-white hover:bg-navy-800'
                  )}
                >
                  <UserCircle className="h-4 w-4" />
                  Meu Perfil
                </Link>
              )}
              <Link
                to={user && isAdmin ? '/admin' : '/login'}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  user
                    ? 'text-slate-500 hover:text-white hover:bg-navy-800'
                    : 'bg-pitch-600/20 text-pitch-400 hover:bg-pitch-600/30'
                )}
              >
                <LogIn className="h-4 w-4" />
                {user && isAdmin ? 'Admin' : 'Entrar'}
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Patrocinadores: faixa fina no topo, abaixo do header */}
      <section aria-label="Patrocinadores" className="border-b border-navy-800">
        <img
          src="/sponsors-banner.png"
          alt="Patrocinadores: PROcontaty, PrimeCall BPO, Made Nova, K Projetos Especiais, TSCardoso"
          className="w-full max-w-3xl mx-auto h-auto block select-none px-4 py-2"
        />
      </section>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Patrocinadores: faixa edge-to-edge para evitar emenda de fundo */}
      <section aria-label="Patrocinadores" className="border-t border-navy-800">
        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-slate-500 pt-4 pb-2">
          Patrocinadores Oficiais
        </p>
        <img
          src="/sponsors-banner.png"
          alt="Patrocinadores: PROcontaty, PrimeCall BPO, Made Nova, K Projetos Especiais, TSCardoso"
          className="w-full max-w-4xl mx-auto h-auto block select-none px-4"
          loading="lazy"
        />
      </section>

      <footer className="border-t border-navy-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-slate-500">
          Futebol Paulistano &copy; {new Date().getFullYear()} — Campeonato de futebol do condomínio
        </div>
      </footer>
    </div>
  )
}
