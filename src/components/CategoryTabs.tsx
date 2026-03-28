import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCategories, useActiveChampionship, useChampionshipCategories } from '@/hooks/useSupabase'
import type { ReactNode } from 'react'

interface CategoryTabsProps {
  children: (categoryId: string, categoryName: string) => ReactNode
}

export function CategoryTabs({ children }: CategoryTabsProps) {
  const { data: championship } = useActiveChampionship()
  const { data: champCategories } = useChampionshipCategories(championship?.id)
  const { data: categories } = useCategories()

  if (!championship) {
    return (
      <div className="text-center py-12 text-slate-400">
        Nenhum campeonato ativo no momento.
      </div>
    )
  }

  const activeCategories = categories?.filter(c =>
    champCategories?.some((cc: any) => cc.category_id === c.id)
  ) ?? []

  if (activeCategories.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        Nenhuma categoria cadastrada para este campeonato.
      </div>
    )
  }

  return (
    <Tabs defaultValue={activeCategories[0]?.id} className="w-full">
      <TabsList className="w-full justify-start mb-6">
        {activeCategories.map(cat => (
          <TabsTrigger key={cat.id} value={cat.id} className="min-w-[100px]">
            {cat.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {activeCategories.map(cat => (
        <TabsContent key={cat.id} value={cat.id}>
          {children(cat.id, cat.name)}
        </TabsContent>
      ))}
    </Tabs>
  )
}
