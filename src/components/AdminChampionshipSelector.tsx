import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Trophy } from 'lucide-react'

export function AdminChampionshipSelector() {
  const { championships, selectedId, setSelectedId } = useAdminChampionship()

  if (championships.length === 0) return null

  return (
    <div className="px-3 pb-3">
      <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1">
        <Trophy className="h-3 w-3" />
        Campeonato
      </label>
      <Select value={selectedId ?? ''} onValueChange={setSelectedId}>
        <SelectTrigger className="w-full text-sm">
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {championships.map(c => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} — {c.season_year}
              {c.status === 'active' ? ' ✓' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
