import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Swords, Lock, Trash2, Plus } from 'lucide-react'

const VALID_DAYS = [1, 2, 4]
const DAY_NAMES: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 4: 'Quinta' }

function formatDateBR(date: string): string {
  const d = new Date(date + 'T12:00:00')
  const dayName = DAY_NAMES[d.getDay()] ?? ''
  return `${dayName}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function isValidDay(date: string): boolean {
  const d = new Date(date + 'T12:00:00')
  return VALID_DAYS.includes(d.getDay())
}

export default function FriendlyAdmin() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: blockedDates } = useQuery({
    queryKey: ['friendly_blocked_dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendly_blocked_dates')
        .select('*')
        .order('blocked_date')
      if (error) throw error
      return data as { id: string; blocked_date: string; reason: string | null }[]
    },
  })

  const { data: challenges } = useQuery({
    queryKey: ['friendly_challenges_admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendly_challenges')
        .select('*, challenger_team:teams!friendly_challenges_challenger_team_id_fkey(name), opponent_team:teams!friendly_challenges_opponent_team_id_fkey(name), category:categories(name)')
        .neq('status', 'cancelled')
        .order('match_date')
      if (error) throw error
      return data
    },
  })

  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [newDate, setNewDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [newReason, setNewReason] = useState('')
  const [saving, setSaving] = useState(false)

  const getValidDatesInRange = (start: string, end: string): string[] => {
    const dates: string[] = []
    const d = new Date(start + 'T12:00:00')
    const endDate = new Date(end + 'T12:00:00')
    while (d <= endDate) {
      if (VALID_DAYS.includes(d.getDay())) {
        dates.push(d.toISOString().split('T')[0])
      }
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  const handleBlock = async () => {
    if (!user) return
    setSaving(true)

    let datesToBlock: string[] = []
    if (mode === 'single') {
      if (!newDate) { setSaving(false); return }
      if (!isValidDay(newDate)) { alert('Selecione apenas segunda, terça ou quinta-feira.'); setSaving(false); return }
      datesToBlock = [newDate]
    } else {
      if (!rangeStart || !rangeEnd) { setSaving(false); return }
      datesToBlock = getValidDatesInRange(rangeStart, rangeEnd)
      if (datesToBlock.length === 0) { alert('Nenhuma data válida (seg/ter/qui) no período selecionado.'); setSaving(false); return }
    }

    // Filter out already blocked
    const alreadyBlocked = new Set(blockedDates?.map(d => d.blocked_date) ?? [])
    const toInsert = datesToBlock.filter(d => !alreadyBlocked.has(d))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('friendly_blocked_dates').insert(
        toInsert.map(d => ({ blocked_date: d, reason: newReason || null, blocked_by: user.id }))
      )
      if (error) alert('Erro: ' + error.message)
    }

    queryClient.invalidateQueries({ queryKey: ['friendly_blocked_dates'] })
    setNewDate('')
    setRangeStart('')
    setRangeEnd('')
    setNewReason('')
    setSaving(false)

    if (toInsert.length > 0) {
      alert(`${toInsert.length} data(s) bloqueada(s) com sucesso!`)
    }
  }

  const handleUnblock = async (id: string) => {
    await supabase.from('friendly_blocked_dates').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['friendly_blocked_dates'] })
  }

  const handleCancelChallenge = async (id: string) => {
    await supabase.from('friendly_challenges').update({ status: 'cancelled' }).eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['friendly_challenges_admin'] })
  }

  const futureBlocked = blockedDates?.filter(d => new Date(d.blocked_date + 'T12:00:00') >= new Date()) ?? []
  const pastBlocked = blockedDates?.filter(d => new Date(d.blocked_date + 'T12:00:00') < new Date()) ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Swords className="h-7 w-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Amistosos — Admin</h1>
          <p className="text-sm text-slate-400">Gerencie datas bloqueadas e desafios</p>
        </div>
      </div>

      {/* Block date form */}
      <Card className="border-red-500/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-400" />
              Bloquear Datas para Amistosos
            </h3>
            <div className="flex gap-1">
              <button onClick={() => setMode('single')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'single' ? 'bg-red-600 text-white' : 'bg-navy-700 text-slate-400'}`}>
                Data única
              </button>
              <button onClick={() => setMode('range')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === 'range' ? 'bg-red-600 text-white' : 'bg-navy-700 text-slate-400'}`}>
                Período
              </button>
            </div>
          </div>

          {mode === 'single' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data (Seg, Ter ou Qui)</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Ex: Rodada do campeonato" />
              </div>
              <div className="flex items-end">
                <Button onClick={handleBlock} disabled={saving || !newDate} className="w-full bg-red-600 hover:bg-red-700">
                  <Lock className="h-4 w-4 mr-1" />{saving ? 'Bloqueando...' : 'Bloquear'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data inicial</Label>
                  <Input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data final</Label>
                  <Input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Ex: Férias" />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBlock} disabled={saving || !rangeStart || !rangeEnd} className="w-full bg-red-600 hover:bg-red-700">
                    <Lock className="h-4 w-4 mr-1" />{saving ? 'Bloqueando...' : 'Bloquear período'}
                  </Button>
                </div>
              </div>
              {rangeStart && rangeEnd && (
                <p className="text-xs text-slate-400">
                  {(() => {
                    const dates = getValidDatesInRange(rangeStart, rangeEnd)
                    return dates.length > 0
                      ? `${dates.length} data(s) válida(s) serão bloqueadas: ${dates.map(d => formatDateBR(d)).join(', ')}`
                      : 'Nenhuma data válida (seg/ter/qui) neste período'
                  })()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked dates list */}
      {futureBlocked.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Datas Bloqueadas ({futureBlocked.length})
            </h3>
            <div className="space-y-2">
              {futureBlocked.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-red-900/10 rounded-lg px-3 py-2 border border-red-600/20">
                  <div>
                    <span className="text-sm font-medium text-white">{formatDateBR(d.blocked_date)}</span>
                    {d.reason && <span className="text-xs text-slate-400 ml-2">— {d.reason}</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handleUnblock(d.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Desbloquear
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active challenges */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Desafios Ativos</h3>
          {challenges && challenges.length > 0 ? (
            <div className="space-y-2">
              {challenges.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between bg-navy-800 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="secondary" className="text-[10px]">{c.category?.name}</Badge>
                      <Badge variant={c.status === 'accepted' ? 'default' : 'warning'} className="text-[10px]">
                        {c.status === 'accepted' ? 'Confirmado' : 'Aberto'}
                      </Badge>
                    </div>
                    <span className="text-sm text-white font-medium">
                      {c.challenger_team?.name}
                      {c.opponent_team ? ` vs ${c.opponent_team.name}` : ' (procura adversário)'}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">
                      {formatDateBR(c.match_date)} {c.match_time}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => handleCancelChallenge(c.id)}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Nenhum desafio ativo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
