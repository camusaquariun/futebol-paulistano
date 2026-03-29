import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveChampionship, useChampionshipCategories, useTeamsByCategory, useTeamRoster } from '@/hooks/useSupabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TeamBadge } from '@/components/TeamBadge'
import { ChevronLeft, ChevronRight, Link2, CheckCircle, UserCircle, Loader2 } from 'lucide-react'
import type { PlayerTeam } from '@/types/database'

const EDGE_FN_URL = 'https://euufoowdghcczoovulfq.supabase.co/functions/v1/link-player'

const CATEGORY_COLORS: Record<string, string> = {
  Livre: 'from-pitch-600 to-pitch-800',
  Master: 'from-blue-600 to-blue-800',
  Veterano: 'from-gold-500 to-gold-700',
}

type Step = 'category' | 'team' | 'player' | 'done'

interface LinkedInfo {
  playerName: string
  teamName: string
  categoryName: string
}

function StepCategory({ champId, onSelect }: { champId: string; onSelect: (catId: string, catName: string) => void }) {
  const { data: champCats } = useChampionshipCategories(champId)
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Selecione a categoria em que você joga:</p>
      {(champCats ?? []).map((cc: any) => {
        const name = cc.category?.name ?? ''
        return (
          <button
            key={cc.category_id}
            onClick={() => onSelect(cc.category_id, name)}
            className={`w-full bg-gradient-to-r ${CATEGORY_COLORS[name] ?? 'from-navy-600 to-navy-800'} rounded-xl p-4 flex items-center justify-between hover:opacity-90 transition-opacity`}
          >
            <span className="text-lg font-bold text-white">{name}</span>
            <ChevronRight className="h-5 w-5 text-white/60" />
          </button>
        )
      })}
    </div>
  )
}

function StepTeam({ champId, categoryId, categoryName, onSelect, onBack }: {
  champId: string
  categoryId: string
  categoryName: string
  onSelect: (teamId: string, teamName: string) => void
  onBack: () => void
}) {
  const { data: teams } = useTeamsByCategory(champId, categoryId)
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Categoria <strong className="text-white">{categoryName}</strong> — Selecione seu time:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(teams ?? []).map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id, t.name)}
            className="flex items-center gap-3 p-3 bg-navy-800 rounded-xl hover:bg-navy-700 transition-colors text-left"
          >
            <TeamBadge name={t.name} shieldUrl={t.shield_url} size="md" />
            <span className="font-semibold text-white text-sm">{t.name}</span>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-2">
        <ChevronLeft className="h-3 w-3" /> Voltar
      </button>
    </div>
  )
}

function StepPlayer({ teamId, categoryId, teamName, categoryName, userEmail, onLinked, onBack }: {
  teamId: string
  categoryId: string
  teamName: string
  categoryName: string
  userEmail: string
  onLinked: (info: LinkedInfo) => void
  onBack: () => void
}) {
  const { data: roster, isLoading } = useTeamRoster(teamId, categoryId)
  const queryClient = useQueryClient()
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Show only players not yet linked to any user
  const unlinked = (roster ?? []).filter((pt: PlayerTeam) => !pt.player?.user_id)

  const handleLink = async (pt: PlayerTeam) => {
    setLinking(pt.player_id)
    setError(null)
    try {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', player_id: pt.player_id, email: userEmail }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['players'] })
        queryClient.invalidateQueries({ queryKey: ['my_player'] })
        queryClient.invalidateQueries({ queryKey: ['my_teams'] })
        onLinked({ playerName: pt.player?.name ?? '', teamName, categoryName })
      }
    } catch {
      setError('Erro ao vincular. Tente novamente.')
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Time <strong className="text-white">{teamName}</strong> / {categoryName} — Clique no seu nome:
      </p>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-pitch-400" />
        </div>
      )}

      {!isLoading && unlinked.length === 0 && (
        <div className="text-center py-6 text-slate-500 text-sm">
          Todos os jogadores deste time já estão vinculados.<br />
          Verifique se selecionou o time correto.
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {unlinked.map((pt: PlayerTeam) => (
          <button
            key={pt.id}
            onClick={() => handleLink(pt)}
            disabled={!!linking}
            className="w-full flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-xl hover:bg-navy-700 transition-colors text-left disabled:opacity-60"
          >
            <div className="h-9 w-9 rounded-full bg-navy-600 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
              {pt.jersey_number ?? pt.player?.name?.charAt(0) ?? '?'}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{pt.player?.name}</p>
              {pt.positions && pt.positions.length > 0 && (
                <p className="text-xs text-slate-500">{pt.positions.filter(p => p !== 'Jogador').join(', ')}</p>
              )}
            </div>
            {linking === pt.player_id ? (
              <Loader2 className="h-4 w-4 animate-spin text-pitch-400" />
            ) : (
              <Link2 className="h-4 w-4 text-slate-600" />
            )}
          </button>
        ))}
      </div>

      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-2">
        <ChevronLeft className="h-3 w-3" /> Voltar
      </button>
    </div>
  )
}

export function PlayerLinkWizard({ userEmail, onComplete }: { userEmail: string; onComplete: () => void }) {
  const { data: championship } = useActiveChampionship()
  const [step, setStep] = useState<Step>('category')
  const [categoryId, setCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [linkedList, setLinkedList] = useState<LinkedInfo[]>([])

  const handleLinked = (info: LinkedInfo) => {
    setLinkedList(prev => [...prev, info])
    setStep('done')
  }

  const handleLinkAnother = () => {
    setCategoryId('')
    setCategoryName('')
    setTeamId('')
    setTeamName('')
    setStep('category')
  }

  if (!championship) return null

  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-pitch-600/20 p-2.5 rounded-full">
            <UserCircle className="h-6 w-6 text-pitch-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Vincular ao meu jogador</h2>
            <p className="text-xs text-slate-400">Encontre seu nome no elenco do campeonato</p>
          </div>
        </div>

        {/* Progress */}
        {step !== 'done' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={step === 'category' ? 'text-pitch-400 font-semibold' : 'text-slate-400'}>Categoria</span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'team' ? 'text-pitch-400 font-semibold' : 'text-slate-400'}>Time</span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'player' ? 'text-pitch-400 font-semibold' : 'text-slate-400'}>Jogador</span>
          </div>
        )}

        {/* Steps */}
        {step === 'category' && (
          <StepCategory
            champId={championship.id}
            onSelect={(id, name) => { setCategoryId(id); setCategoryName(name); setStep('team') }}
          />
        )}

        {step === 'team' && (
          <StepTeam
            champId={championship.id}
            categoryId={categoryId}
            categoryName={categoryName}
            onSelect={(id, name) => { setTeamId(id); setTeamName(name); setStep('player') }}
            onBack={() => setStep('category')}
          />
        )}

        {step === 'player' && (
          <StepPlayer
            teamId={teamId}
            categoryId={categoryId}
            teamName={teamName}
            categoryName={categoryName}
            userEmail={userEmail}
            onLinked={handleLinked}
            onBack={() => setStep('team')}
          />
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle className="h-12 w-12 text-pitch-400" />
              <div>
                <p className="text-lg font-bold text-white">Vinculado com sucesso!</p>
                {linkedList.map((info, i) => (
                  <p key={i} className="text-sm text-slate-400 mt-1">
                    <span className="text-white font-medium">{info.playerName}</span> · {info.teamName} · {info.categoryName}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 text-center">Você também joga em outra categoria?</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-sm" onClick={handleLinkAnother}>
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Vincular outra categoria
                </Button>
                <Button className="flex-1 text-sm" onClick={onComplete}>
                  Ver meu time
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
