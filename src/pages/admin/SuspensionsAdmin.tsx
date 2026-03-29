import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSuspensions, useCategories, useDeleteSuspension, useSaveSuspension, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ShieldAlert, Trash2, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import { reasonLabel } from '@/lib/utils'

export default function SuspensionsAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const { data: suspensions, isLoading } = useSuspensions(championshipId, filterCategory !== 'all' ? filterCategory : undefined)
  const deleteMutation = useDeleteSuspension()
  const saveMutation = useSaveSuspension()

  // Reset state: step 0 = idle, 1 = first confirm, 2 = final confirm
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [resetCategoryId, setResetCategoryId] = useState<string>('all')
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  // Load previous resets
  const { data: resets } = useQuery({
    queryKey: ['yellow_card_resets', championshipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yellow_card_resets')
        .select('*, category:categories(name)')
        .eq('championship_id', championshipId!)
        .order('reset_date', { ascending: false })
      if (error) throw error
      return data as any[]
    },
    enabled: !!championshipId,
  })

  const handleReset = async () => {
    if (!championshipId || !user) return
    setResetting(true)
    const { error } = await supabase.from('yellow_card_resets').insert({
      championship_id: championshipId,
      category_id: resetCategoryId !== 'all' ? resetCategoryId : null,
      created_by: user.id,
    })
    if (error) { alert('Erro: ' + error.message) }
    else {
      setResetSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['yellow_card_resets'] })
      queryClient.invalidateQueries({ queryKey: ['suspensions'] })
      setTimeout(() => setResetSuccess(false), 4000)
    }
    setResetStep(0)
    setResetting(false)
  }

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  const handleMarkServed = async (id: string) => {
    await saveMutation.mutateAsync({ id, served: true })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover esta suspensao?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  if (!championshipId) {
    return <div className="text-center py-12 text-slate-400">Nenhum campeonato ativo.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-red-400" />
          <h1 className="text-2xl font-bold text-white">Suspensoes</h1>
        </div>
      </div>

      <Select value={filterCategory} onValueChange={setFilterCategory}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {activeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pitch-500" /></div>
      ) : (
        <div className="space-y-3">
          {suspensions?.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{s.player?.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{s.category?.name}</Badge>
                    <span className="text-sm text-slate-400">{reasonLabel(s.reason)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.served ? (
                    <Badge variant="secondary">Cumprida</Badge>
                  ) : (
                    <>
                      <Badge variant="destructive">Ativa</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleMarkServed(s.id)} className="text-pitch-400">
                        <CheckCircle className="h-4 w-4 mr-1" />Cumprida
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {suspensions?.length === 0 && (
            <div className="text-center py-8 text-slate-400">Nenhuma suspensao registrada.</div>
          )}
        </div>
      )}

      {/* Reset Yellow Card Accumulation */}
      <Card className="border-amber-500/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-400" />
            <h3 className="font-bold text-white">Resetar Acúmulo de Cartões Amarelos</h3>
          </div>
          <p className="text-xs text-slate-400">
            Zera o acúmulo de cartões amarelos para todos os jogadores a partir desta data.
            Os cartões não serão excluídos do histórico, apenas não contarão mais para suspensão futura.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-semibold">Categoria</label>
              <select
                value={resetCategoryId}
                onChange={e => { setResetCategoryId(e.target.value); setResetStep(0) }}
                className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="all">Todas as categorias</option>
                {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {resetStep === 0 && (
              <Button
                onClick={() => setResetStep(1)}
                className="bg-amber-600 hover:bg-amber-700 text-black font-semibold mt-auto"
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Resetar acúmulo
              </Button>
            )}

            {resetStep === 1 && (
              <div className="flex items-center gap-2 mt-auto">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">Tem certeza?</span>
                </div>
                <Button onClick={() => setResetStep(2)} className="bg-amber-600 hover:bg-amber-700 text-black font-semibold">
                  Sim, continuar
                </Button>
                <Button variant="ghost" onClick={() => setResetStep(0)} className="text-slate-400">
                  Cancelar
                </Button>
              </div>
            )}

            {resetStep === 2 && (
              <div className="flex items-center gap-2 mt-auto">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400 font-bold">
                    CONFIRME: Resetar {resetCategoryId === 'all' ? 'TODAS categorias' : activeCategories.find(c => c.id === resetCategoryId)?.name ?? ''}?
                  </span>
                </div>
                <Button onClick={handleReset} disabled={resetting} className="bg-red-600 hover:bg-red-700 font-bold">
                  {resetting ? 'Resetando...' : 'CONFIRMAR RESET'}
                </Button>
                <Button variant="ghost" onClick={() => setResetStep(0)} className="text-slate-400">
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {resetSuccess && (
            <div className="text-pitch-400 text-sm font-medium bg-pitch-400/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Acúmulo de cartões amarelos resetado com sucesso!
            </div>
          )}

          {/* Previous resets */}
          {resets && resets.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] text-slate-500 font-semibold uppercase mb-2">Resets anteriores</p>
              <div className="space-y-1.5">
                {resets.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs bg-navy-800/50 rounded-lg px-3 py-2">
                    <RotateCcw className="h-3 w-3 text-amber-400 flex-shrink-0" />
                    <span className="text-slate-300">
                      {new Date(r.reset_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {' '}
                      {new Date(r.reset_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Badge variant="secondary" className="text-[9px]">
                      {r.category ? r.category.name : 'Todas'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
