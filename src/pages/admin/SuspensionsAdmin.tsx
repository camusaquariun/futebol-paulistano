import { useState } from 'react'
import { useSuspensions, useCategories, useDeleteSuspension, useSaveSuspension, useChampionshipCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ShieldAlert, Trash2, CheckCircle } from 'lucide-react'
import { reasonLabel } from '@/lib/utils'

export default function SuspensionsAdmin() {
  const { selectedId: championshipId, selected: championship } = useAdminChampionship()
  const { data: categories } = useCategories()
  const { data: champCategories } = useChampionshipCategories(championshipId)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const { data: suspensions, isLoading } = useSuspensions(championshipId, filterCategory !== 'all' ? filterCategory : undefined)
  const deleteMutation = useDeleteSuspension()
  const saveMutation = useSaveSuspension()

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
    </div>
  )
}
