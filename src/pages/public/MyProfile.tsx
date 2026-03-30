import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCircle, Mail, Lock, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function MyProfile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-slate-400">
        <p>Você precisa estar logado para ver seu perfil.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Fazer login</Button>
      </div>
    )
  }

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameLoading(true)
    setNameMsg(null)
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } })
    if (error) {
      setNameMsg({ type: 'err', text: error.message })
    } else {
      setNameMsg({ type: 'ok', text: 'Nome atualizado com sucesso!' })
    }
    setNameLoading(false)
  }

  const handleEmailSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailLoading(true)
    setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate limit')) {
        setEmailMsg({ type: 'err', text: 'Muitas tentativas. Aguarde alguns minutos.' })
      } else if (msg.includes('already registered') || msg.includes('already in use')) {
        setEmailMsg({ type: 'err', text: 'Este e-mail já está em uso.' })
      } else {
        setEmailMsg({ type: 'err', text: error.message })
      }
    } else {
      setEmailMsg({ type: 'ok', text: 'Um link de confirmação foi enviado para o novo e-mail.' })
      setNewEmail('')
    }
    setEmailLoading(false)
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'err', text: 'As senhas não coincidem.' })
      return
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: 'err', text: 'A senha deve ter pelo menos 6 caracteres.' })
      return
    }
    setPwLoading(true)
    // Re-authenticate first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    })
    if (signInError) {
      setPwMsg({ type: 'err', text: 'Senha atual incorreta.' })
      setPwLoading(false)
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPwMsg({ type: 'err', text: error.message })
    } else {
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPwLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCircle className="h-7 w-7 text-pitch-400" />
        <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-300">Informações da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-400">
          <p><span className="text-slate-500">E-mail atual:</span> <span className="text-white">{user.email}</span></p>
          {memberSince && <p><span className="text-slate-500">Membro desde:</span> {memberSince}</p>}
          {user.user_metadata?.display_name && (
            <p><span className="text-slate-500">Nome:</span> <span className="text-white">{user.user_metadata.display_name}</span></p>
          )}
        </CardContent>
      </Card>

      {/* Display name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-300 flex items-center gap-2">
            <UserCircle className="h-4 w-4" /> Nome de exibição
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameSave} className="space-y-3">
            {nameMsg && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${nameMsg.type === 'ok' ? 'text-pitch-400 bg-pitch-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {nameMsg.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                {nameMsg.text}
              </div>
            )}
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Seu nome" required />
            </div>
            <Button type="submit" disabled={nameLoading} size="sm">
              {nameLoading ? 'Salvando...' : 'Salvar nome'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-300 flex items-center gap-2">
            <Mail className="h-4 w-4" /> Alterar e-mail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSave} className="space-y-3">
            {emailMsg && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${emailMsg.type === 'ok' ? 'text-pitch-400 bg-pitch-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {emailMsg.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                {emailMsg.text}
              </div>
            )}
            <div className="space-y-2">
              <Label>Novo e-mail</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="novo@email.com"
                required
              />
            </div>
            <p className="text-xs text-slate-500">Um link de confirmação será enviado para o novo endereço.</p>
            <Button type="submit" disabled={emailLoading} size="sm">
              {emailLoading ? 'Enviando...' : 'Alterar e-mail'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-300 flex items-center gap-2">
            <Lock className="h-4 w-4" /> Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSave} className="space-y-3">
            {pwMsg && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${pwMsg.type === 'ok' ? 'text-pitch-400 bg-pitch-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {pwMsg.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                {pwMsg.text}
              </div>
            )}
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" disabled={pwLoading} size="sm">
              {pwLoading ? 'Alterando...' : 'Alterar senha'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="pt-4">
          <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
