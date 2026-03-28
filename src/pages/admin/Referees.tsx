import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { useMatches } from '@/hooks/useSupabase'
import { Gavel, Plus, Edit, Star, Calendar, User, Phone, ChevronRight, ChevronLeft } from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'

function StarRating({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => !readOnly && onChange?.(n)}
          disabled={readOnly}
          className={`transition-colors ${readOnly ? '' : 'hover:scale-110 active:scale-95'}`}
        >
          <Star className={`h-5 w-5 ${n <= value ? 'text-gold-400 fill-gold-400' : 'text-slate-600'}`} />
        </button>
      ))}
    </div>
  )
}

export default function Referees() {
  const queryClient = useQueryClient()
  const { selectedId: championshipId } = useAdminChampionship()
  const { data: matches } = useMatches(championshipId)

  // Referees
  const { data: referees } = useQuery({
    queryKey: ['referees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referees').select('*').order('name')
      if (error) throw error
      return data as { id: string; name: string; phone: string | null; photo_url: string | null; active: boolean; roles: string[] }[]
    },
  })

  // All match_referees for stats
  const { data: allMatchRefs } = useQuery({
    queryKey: ['match_referees', championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_referees')
        .select('*, match:matches!inner(championship_id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), match_date, phase, category:categories(name))')
        .eq('match.championship_id', championshipId!)
      if (error) throw error
      return data as any[]
    },
    enabled: !!championshipId,
  })

  // CRUD state
  const [editOpen, setEditOpen] = useState(false)
  const [editingRef, setEditingRef] = useState<any>(null)
  const [refName, setRefName] = useState('')
  const [refPhone, setRefPhone] = useState('')
  const [refRoles, setRefRoles] = useState<string[]>(['field', 'table'])
  const [saving, setSaving] = useState(false)

  // Detail view
  const [detailRef, setDetailRef] = useState<any>(null)

  // Assign to match state
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMatchId, setAssignMatchId] = useState('')
  const [assignRole, setAssignRole] = useState<'field_1' | 'field_2' | 'table'>('field_1')
  const [assignRefId, setAssignRefId] = useState('')

  // Rating state
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingMR, setRatingMR] = useState<any>(null)
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingNotes, setRatingNotes] = useState('')

  const openNew = () => { setEditingRef(null); setRefName(''); setRefPhone(''); setRefRoles(['field', 'table']); setEditOpen(true) }
  const openEdit = (ref: any) => { setEditingRef(ref); setRefName(ref.name); setRefPhone(ref.phone ?? ''); setRefRoles(ref.roles ?? ['field', 'table']); setEditOpen(true) }

  const handleSaveRef = async () => {
    setSaving(true)
    if (editingRef) {
      await supabase.from('referees').update({ name: refName, phone: refPhone || null, roles: refRoles }).eq('id', editingRef.id)
    } else {
      await supabase.from('referees').insert({ name: refName, phone: refPhone || null, roles: refRoles })
    }
    queryClient.invalidateQueries({ queryKey: ['referees'] })
    setSaving(false)
    setEditOpen(false)
  }

  const handleAssign = async () => {
    if (!assignMatchId || !assignRefId) return
    setSaving(true)
    await supabase.from('match_referees').upsert(
      { match_id: assignMatchId, referee_id: assignRefId, role: assignRole },
      { onConflict: 'match_id,role' }
    )
    queryClient.invalidateQueries({ queryKey: ['match_referees'] })
    setSaving(false)
    setAssignOpen(false)
  }

  const handleSaveRating = async () => {
    if (!ratingMR) return
    setSaving(true)
    await supabase.from('match_referees').update({ rating: ratingValue, notes: ratingNotes || null }).eq('id', ratingMR.id)
    queryClient.invalidateQueries({ queryKey: ['match_referees'] })
    setSaving(false)
    setRatingOpen(false)
  }

  // Stats per referee
  const getRefStats = (refId: string) => {
    const refs = allMatchRefs?.filter((mr: any) => mr.referee_id === refId) ?? []
    const ratings = refs.filter((mr: any) => mr.rating != null).map((mr: any) => mr.rating as number)
    const avg = ratings.length > 0 ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) : 0
    return { total: refs.length, avgRating: avg, ratings: ratings.length, matches: refs }
  }

  const roleLabel = (r: string) => r === 'field_1' ? 'Árbitro 1' : r === 'field_2' ? 'Árbitro 2' : 'Mesa'
  const roleBadge = (r: string) => r === 'table' ? 'secondary' as const : 'default' as const

  const unratedMatches = allMatchRefs?.filter((mr: any) => mr.rating == null) ?? []
  const scheduledMatches = matches?.filter(m => m.status === 'scheduled') ?? []

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gavel className="h-7 w-7 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Arbitragem</h1>
            <p className="text-sm text-slate-400">Gerencie árbitros, escalações e avaliações</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAssignOpen(true)}>Escalar Árbitro</Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Árbitro</Button>
        </div>
      </div>

      {/* Pending ratings alert */}
      {unratedMatches.length > 0 && (
        <Card className="border-gold-500/30 bg-gold-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gold-400">{unratedMatches.length} avaliação(ões) pendente(s)</p>
              <p className="text-xs text-slate-400">Avalie os árbitros após cada partida</p>
            </div>
            <div className="flex gap-1">
              {unratedMatches.slice(0, 3).map((mr: any) => {
                const ref = referees?.find(r => r.id === mr.referee_id)
                return (
                  <Button key={mr.id} variant="outline" size="sm" onClick={() => { setRatingMR(mr); setRatingValue(0); setRatingNotes(''); setRatingOpen(true) }}>
                    {ref?.name?.split(' ')[0]} — {roleLabel(mr.role)}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Referees list */}
      {detailRef ? (
        // Detail view
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailRef(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" />Voltar
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-navy-700 flex items-center justify-center">
              <User className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{detailRef.name}</h2>
              {detailRef.phone && <p className="text-sm text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" />{detailRef.phone}</p>}
            </div>
          </div>

          {(() => {
            const stats = getRefStats(detailRef.id)
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-extrabold text-pitch-400">{stats.total}</p>
                      <p className="text-xs text-slate-400">Partidas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-extrabold text-gold-400">{stats.avgRating ? stats.avgRating.toFixed(1) : '—'}</p>
                      <p className="text-xs text-slate-400">Nota Média</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-extrabold text-blue-400">{stats.ratings}</p>
                      <p className="text-xs text-slate-400">Avaliações</p>
                    </CardContent>
                  </Card>
                </div>

                {stats.matches.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold text-slate-400 mb-3">Histórico de Partidas</h3>
                      <div className="space-y-2">
                        {stats.matches.map((mr: any) => (
                          <div key={mr.id} className="flex items-center justify-between bg-navy-800 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant={roleBadge(mr.role)} className="text-[10px]">{roleLabel(mr.role)}</Badge>
                                <Badge variant="secondary" className="text-[10px]">{mr.match?.category?.name}</Badge>
                              </div>
                              <p className="text-sm text-white">
                                {mr.match?.home_team?.name} vs {mr.match?.away_team?.name}
                              </p>
                              {mr.match?.match_date && <p className="text-[10px] text-slate-500">{formatDate(mr.match.match_date)}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {mr.rating ? (
                                <div className="text-center">
                                  <StarRating value={mr.rating} readOnly />
                                  {mr.notes && <p className="text-[9px] text-slate-500 max-w-[120px] truncate">{mr.notes}</p>}
                                </div>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => { setRatingMR(mr); setRatingValue(0); setRatingNotes(''); setRatingOpen(true) }}>
                                  Avaliar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )
          })()}
        </div>
      ) : (
        // List view
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {referees?.map(ref => {
            const stats = getRefStats(ref.id)
            return (
              <Card key={ref.id} className="card-hover cursor-pointer" onClick={() => setDetailRef(ref)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-navy-700 flex items-center justify-center text-sm font-bold text-slate-300">
                      {ref.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">{ref.name}</p>
                      <div className="flex gap-1 mt-0.5">
                        {ref.roles?.includes('field') && <Badge variant="default" className="text-[8px] px-1 py-0">Campo</Badge>}
                        {ref.roles?.includes('table') && <Badge variant="secondary" className="text-[8px] px-1 py-0">Mesa</Badge>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openEdit(ref) }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{stats.total} partida{stats.total !== 1 ? 's' : ''}</span>
                    {stats.avgRating > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-gold-400 fill-gold-400" />
                        <span className="text-gold-400 font-bold">{stats.avgRating.toFixed(1)}</span>
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {(!referees || referees.length === 0) && (
            <div className="col-span-full text-center py-8 text-slate-400">Nenhum árbitro cadastrado.</div>
          )}
        </div>
      )}

      {/* Create/Edit referee dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRef ? 'Editar Árbitro' : 'Novo Árbitro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={refName} onChange={e => setRefName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>Telefone (opcional)</Label>
              <Input value={refPhone} onChange={e => setRefPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-2">
              <Label>Funções</Label>
              <div className="flex gap-2">
                {[
                  { key: 'field', label: '⚽ Árbitro de Campo', color: 'pitch' },
                  { key: 'table', label: '📋 Árbitro de Mesa', color: 'blue' },
                ].map(r => (
                  <button
                    key={r.key}
                    onClick={() => setRefRoles(prev =>
                      prev.includes(r.key) ? (prev.length > 1 ? prev.filter(x => x !== r.key) : prev) : [...prev, r.key]
                    )}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                      refRoles.includes(r.key)
                        ? r.color === 'pitch' ? 'bg-pitch-600/20 text-pitch-400 border-pitch-600/40' : 'bg-blue-600/20 text-blue-400 border-blue-600/40'
                        : 'bg-navy-800 text-slate-500 border-navy-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleSaveRef} className="w-full" disabled={saving || !refName || refRoles.length === 0}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign referee to match dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalar Árbitro para Partida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Partida</Label>
              <Select value={assignMatchId} onValueChange={setAssignMatchId}>
                <SelectTrigger><SelectValue placeholder="Selecione a partida" /></SelectTrigger>
                <SelectContent>
                  {matches?.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.home_team?.name} vs {m.away_team?.name} — {m.category?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={assignRole} onValueChange={v => setAssignRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_1">Árbitro 1 (Campo)</SelectItem>
                  <SelectItem value="field_2">Árbitro 2 (Campo)</SelectItem>
                  <SelectItem value="table">Árbitro de Mesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Árbitro</Label>
              <Select value={assignRefId} onValueChange={setAssignRefId}>
                <SelectTrigger><SelectValue placeholder="Selecione o árbitro" /></SelectTrigger>
                <SelectContent>
                  {referees?.filter(r => r.active && r.roles?.includes(assignRole === 'table' ? 'table' : 'field')).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} className="w-full" disabled={saving || !assignMatchId || !assignRefId}>
              {saving ? 'Escalando...' : 'Escalar Árbitro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating dialog */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar Árbitro</DialogTitle>
          </DialogHeader>
          {ratingMR && (
            <div className="space-y-4">
              <div className="bg-navy-800 rounded-lg p-3">
                <p className="text-sm text-white font-medium">
                  {referees?.find(r => r.id === ratingMR.referee_id)?.name}
                </p>
                <p className="text-xs text-slate-400">
                  {roleLabel(ratingMR.role)} — {ratingMR.match?.home_team?.name} vs {ratingMR.match?.away_team?.name}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Nota</Label>
                <div className="flex justify-center py-2">
                  <StarRating value={ratingValue} onChange={setRatingValue} />
                </div>
                <div className="flex justify-center gap-4 text-xs text-slate-500">
                  <span>1 = Ruim</span><span>3 = Regular</span><span>5 = Excelente</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea value={ratingNotes} onChange={e => setRatingNotes(e.target.value)} placeholder="Comentários sobre a atuação..." rows={3} />
              </div>
              <Button onClick={handleSaveRating} className="w-full" disabled={saving || ratingValue === 0}>
                {saving ? 'Salvando...' : 'Salvar Avaliação'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
