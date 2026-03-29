import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, AlertCircle, UserPlus, LogIn } from 'lucide-react'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await signIn(email, password)
    if (result.error) {
      const msg = result.error.toLowerCase()
      if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('email not confirmed')) {
        setError('E-mail ou senha incorretos.')
      } else if (msg.includes('rate limit')) {
        setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
      } else {
        setError(result.error)
      }
      setLoading(false)
    } else {
      navigate(result.isAdmin ? '/admin' : '/meu-time')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      setLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    })

    if (signUpError) {
      const msg = signUpError.message.toLowerCase()
      if (msg.includes('rate limit') || msg.includes('email rate')) {
        setError('Limite de emails atingido. Aguarde alguns minutos e tente novamente, ou peça ao administrador para criar sua conta.')
      } else if (msg.includes('already registered') || msg.includes('user already')) {
        setError('Este e-mail já está cadastrado. Tente fazer login.')
      } else if (msg.includes('invalid email')) {
        setError('E-mail inválido.')
      } else if (msg.includes('weak password') || msg.includes('password')) {
        setError('Senha muito fraca. Use pelo menos 6 caracteres.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    if (data.user) {
      // Auto sign in after registration
      const { error: signInError } = await signIn(email, password)
      if (signInError) {
        setSuccess('Conta criada! Faça login para continuar.')
        setMode('login')
      } else {
        navigate('/meu-time')
      }
    }
    setLoading(false)
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setName('')
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-navy-950">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-pitch-600/20 p-3 rounded-full">
              <Trophy className="h-8 w-8 text-pitch-400" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">
            {mode === 'login' ? 'Entrar' : 'Criar Conta'}
          </CardTitle>
          <p className="text-sm text-slate-400 mt-1">
            {mode === 'login'
              ? 'Acesse sua conta para participar do campeonato'
              : 'Registre-se para votar, comentar e acompanhar seu time'
            }
          </p>
        </CardHeader>
        <CardContent>
          {/* Tab toggle */}
          <div className="flex gap-1 mb-5 bg-navy-800 rounded-lg p-1">
            <button
              onClick={() => { setMode('login'); resetForm() }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-pitch-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </button>
            <button
              onClick={() => { setMode('register'); resetForm() }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'register' ? 'bg-pitch-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Registrar
            </button>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-pitch-400 text-sm bg-pitch-400/10 p-3 rounded-lg">
                <Trophy className="h-4 w-4 flex-shrink-0" />
                {success}
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? (mode === 'login' ? 'Entrando...' : 'Registrando...')
                : (mode === 'login' ? 'Entrar' : 'Criar Conta')
              }
            </Button>
          </form>

          {mode === 'register' && (
            <p className="text-xs text-slate-500 text-center mt-4">
              Ao criar sua conta, o administrador poderá vincular você a um jogador do campeonato.
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-navy-700 text-center">
            <Link to="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← Voltar para o site
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
