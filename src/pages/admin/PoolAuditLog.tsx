import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { History, Search, AlertTriangle, Loader2, Filter } from 'lucide-react'

interface AuditRow {
  id: string
  occurred_at: string
  user_id: string | null
  actor_id: string | null
  user_email: string | null
  bet_kind: 'match' | 'season'
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  bet_id: string | null
  match_id: string | null
  category_id: string | null
  bet_type: string | null
  before_data: any
  after_data: any
  match_date: string | null
  after_kickoff: boolean | null
  after_deadline: boolean | null
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    INSERT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    UPDATE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    DELETE: 'bg-red-500/20 text-red-300 border-red-500/30',
  }
  return <Badge className={`text-[10px] ${styles[action]}`}>{action}</Badge>
}

function describeChange(row: AuditRow): string {
  if (row.bet_kind === 'match') {
    const before = row.before_data
    const after = row.after_data
    const fmt = (b: any) => b ? `${b.home_score}×${b.away_score}` : '—'
    if (row.action === 'INSERT') return `Aposta: ${fmt(after)}`
    if (row.action === 'UPDATE') return `${fmt(before)} → ${fmt(after)}`
    if (row.action === 'DELETE') return `Apagou: ${fmt(before)}`
  } else {
    const before = row.before_data
    const after = row.after_data
    const fmt = (b: any) => b ? (b.team_id ?? b.player_id ?? '—').slice(0, 8) : '—'
    if (row.action === 'INSERT') return `${row.bet_type}: ${fmt(after)}`
    if (row.action === 'UPDATE') return `${row.bet_type}: ${fmt(before)} → ${fmt(after)}`
    if (row.action === 'DELETE') return `${row.bet_type} apagada`
  }
  return ''
}

export default function PoolAuditLog() {
  const [search, setSearch] = useState('')
  const [filterAlert, setFilterAlert] = useState<'all' | 'after_kickoff' | 'after_deadline'>('all')
  const [filterKind, setFilterKind] = useState<'all' | 'match' | 'season'>('all')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['pool_audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as AuditRow[]
    },
  })

  // Resolve match label (home × away — date)
  const matchIds = [...new Set((rows ?? []).map(r => r.match_id).filter(Boolean) as string[])]
  const { data: matches } = useQuery({
    queryKey: ['pool_audit_matches', matchIds],
    queryFn: async () => {
      if (matchIds.length === 0) return new Map<string, any>()
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, home_team:home_team_id(name), away_team:away_team_id(name)')
        .in('id', matchIds)
      const map = new Map<string, any>()
      for (const m of data ?? []) map.set(m.id, m)
      return map
    },
    enabled: matchIds.length > 0,
  })

  const filtered = useMemo(() => {
    const q = norm(search)
    return (rows ?? []).filter(r => {
      if (filterAlert === 'after_kickoff' && !r.after_kickoff) return false
      if (filterAlert === 'after_deadline' && !r.after_deadline) return false
      if (filterKind !== 'all' && r.bet_kind !== filterKind) return false
      if (!q) return true
      const m = matches?.get(r.match_id ?? '')
      const matchLabel = m ? `${m.home_team?.name} ${m.away_team?.name}` : ''
      return (
        norm(r.user_email ?? '').includes(q) ||
        norm(r.action).includes(q) ||
        norm(r.bet_type ?? '').includes(q) ||
        norm(matchLabel).includes(q)
      )
    })
  }, [rows, search, filterAlert, filterKind, matches])

  const alertsCount = (rows ?? []).filter(r => r.after_deadline).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="h-6 w-6 text-pitch-400" />
            Auditoria do Bolão
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Registro completo de todas as ações em apostas (últimas 500 entradas).
          </p>
        </div>
        {alertsCount > 0 && (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/30 gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {alertsCount} ações após deadline
          </Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por email, ação, time, tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={filterKind}
          onChange={e => setFilterKind(e.target.value as any)}
          className="bg-slate-800 border border-slate-600 rounded px-3 text-sm text-white"
        >
          <option value="all">Todas as apostas</option>
          <option value="match">Por partida</option>
          <option value="season">Temporada / Cinema</option>
        </select>
        <select
          value={filterAlert}
          onChange={e => setFilterAlert(e.target.value as any)}
          className="bg-slate-800 border border-slate-600 rounded px-3 text-sm text-white"
        >
          <option value="all">Todas</option>
          <option value="after_deadline">⚠️ Após deadline (-1h)</option>
          <option value="after_kickoff">🚨 Após início do jogo</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-pitch-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">Nenhuma ação registrada.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const m = matches?.get(row.match_id ?? '')
            const matchLabel = m
              ? `${m.home_team?.name ?? '?'} × ${m.away_team?.name ?? '?'}`
              : null
            const occurred = new Date(row.occurred_at)
            const kickoff = row.match_date ? new Date(row.match_date) : null
            return (
              <Card
                key={row.id}
                className={`border ${row.after_kickoff
                  ? 'border-red-500/40 bg-red-500/5'
                  : row.after_deadline
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-navy-700'}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ActionBadge action={row.action} />
                        <Badge className="bg-slate-700/40 text-slate-300 border-slate-600/40 text-[10px]">
                          {row.bet_kind === 'match' ? 'Partida' : 'Temporada'}
                        </Badge>
                        {row.after_kickoff && (
                          <Badge className="bg-red-500/30 text-red-200 border-red-500/40 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Após início do jogo
                          </Badge>
                        )}
                        {row.after_deadline && !row.after_kickoff && (
                          <Badge className="bg-amber-500/30 text-amber-200 border-amber-500/40 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Após deadline
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white">
                        <span className="text-slate-400">{row.user_email ?? '(sem email)'}</span>
                        {matchLabel && <span className="ml-2 text-slate-300">• {matchLabel}</span>}
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">{describeChange(row)}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500 leading-tight">
                      <div>{occurred.toLocaleString('pt-BR')}</div>
                      {kickoff && (
                        <div>jogo: {kickoff.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                      {row.actor_id && row.actor_id !== row.user_id && (
                        <div className="text-amber-400 mt-0.5">
                          <Filter className="inline h-3 w-3 mr-0.5" />
                          editado por outro usuário
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
