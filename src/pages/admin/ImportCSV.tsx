import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { useCategories } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, Download } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

type ImportType = 'combined' | 'teams' | 'players'

interface FieldMapping {
  [csvColumn: string]: string
}

interface ImportResult {
  teamsCreated: number
  playersCreated: number
  associationsCreated: number
  errors: string[]
}

const IMPORT_MODES: { key: ImportType; label: string; description: string; fields: { key: string; label: string }[]; template: string[][] }[] = [
  {
    key: 'combined',
    label: 'Times + Jogadores',
    description: 'Importa times e jogadores juntos. Cada linha representa um jogador e seu time.',
    fields: [
      { key: 'player_name', label: 'Nome do Jogador' },
      { key: 'team_name', label: 'Nome do Time' },
      { key: 'category', label: 'Categoria (Livre/Master/Veterano)' },
    ],
    template: [
      ['Jogador', 'Time', 'Categoria'],
      ['João Silva', 'FC Condomínio', 'Livre'],
      ['Pedro Souza', 'FC Condomínio', 'Livre'],
      ['Carlos Lima', 'Os Brabos', 'Master'],
      ['Antônio Costa', 'Os Brabos', 'Veterano'],
    ],
  },
  {
    key: 'players',
    label: 'Só Jogadores',
    description: 'Importa apenas jogadores e os vincula a times existentes.',
    fields: [
      { key: 'player_name', label: 'Nome do Jogador' },
      { key: 'team_name', label: 'Nome do Time (já existente)' },
      { key: 'category', label: 'Categoria (Livre/Master/Veterano)' },
    ],
    template: [
      ['Jogador', 'Time', 'Categoria'],
      ['João Silva', 'FC Condomínio', 'Livre'],
      ['Pedro Souza', 'Os Brabos', 'Master'],
    ],
  },
  {
    key: 'teams',
    label: 'Só Times',
    description: 'Importa apenas times e os cadastra nas categorias indicadas.',
    fields: [
      { key: 'name', label: 'Nome do Time' },
      { key: 'category', label: 'Categoria (Livre/Master/Veterano)' },
    ],
    template: [
      ['Time', 'Categoria'],
      ['FC Condomínio', 'Livre'],
      ['Os Brabos', 'Master'],
      ['Veteranos FC', 'Veterano'],
    ],
  },
]

function downloadTemplate(mode: ImportType) {
  const m = IMPORT_MODES.find(m => m.key === mode)!
  const csv = m.template.map(row => row.join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `modelo_importacao_${mode}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportCSV() {
  const { data: categories } = useCategories()
  const { selectedId: championshipId } = useAdminChampionship()
  const queryClient = useQueryClient()
  const [importType, setImportType] = useState<ImportType>('combined')
  const [csvData, setCsvData] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'result'>('upload')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const currentMode = IMPORT_MODES.find(m => m.key === importType)!

  const handleTypeChange = (type: ImportType) => {
    setImportType(type)
    setCsvData([])
    setHeaders([])
    setMapping({})
    setStep('upload')
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][]
        const rows = data.filter(row => row.some(cell => String(cell).trim()))
        if (rows.length < 2) return
        const rawHeaders = rows[0].map(h => String(h).trim())
        const bodyRows = rows.slice(1).map(row => row.map(cell => String(cell).trim()))
        setHeaders(rawHeaders)
        setCsvData(bodyRows)

        // Auto-map by similar names
        const autoMapping: FieldMapping = {}
        rawHeaders.forEach(header => {
          const h = header.toLowerCase().trim()
          if (h.includes('jogador') || h.includes('player') || h === 'nome do jogador') autoMapping[header] = 'player_name'
          else if (h.includes('categ')) autoMapping[header] = 'category'
          else if (h.includes('time') || h.includes('team') || h.includes('equipe') || h === 'clube') {
            autoMapping[header] = importType === 'teams' ? 'name' : 'team_name'
          } else if (h === 'nome' || h === 'name') {
            autoMapping[header] = importType === 'teams' ? 'name' : 'player_name'
          }
        })
        setMapping(autoMapping)
        setStep('mapping')
      },
      skipEmptyLines: true,
    })
  }, [importType])

  const handleImport = async () => {
    setImporting(true)
    const res: ImportResult = { teamsCreated: 0, playersCreated: 0, associationsCreated: 0, errors: [] }

    const reverseMap: Record<string, number> = {}
    Object.entries(mapping).forEach(([csvCol, targetField]) => {
      if (targetField) {
        const idx = headers.indexOf(csvCol)
        if (idx >= 0) reverseMap[targetField] = idx
      }
    })

    const categoryMap: Record<string, string> = {}
    categories?.forEach(c => {
      categoryMap[c.name.toLowerCase()] = c.id
      // Also map common abbreviations
      categoryMap[c.name.toLowerCase().substring(0, 3)] = c.id
    })

    const resolveCategory = (raw: string | undefined): string | undefined => {
      if (!raw) return undefined
      return categoryMap[raw.toLowerCase().trim()]
    }

    // Cache teams to avoid repeated DB calls
    const teamCache: Record<string, string> = {}
    const getOrCreateTeam = async (name: string): Promise<string | undefined> => {
      if (!name) return undefined
      if (teamCache[name.toLowerCase()]) return teamCache[name.toLowerCase()]
      const { data: existing } = await supabase.from('teams').select('id').ilike('name', name).eq('championship_id', championshipId!).maybeSingle()
      if (existing) {
        teamCache[name.toLowerCase()] = existing.id
        return existing.id
      }
      const { data: newTeam, error } = await supabase.from('teams').insert({ name, championship_id: championshipId }).select('id').single()
      if (error) { res.errors.push(`Erro ao criar time "${name}": ${error.message}`); return undefined }
      res.teamsCreated++
      teamCache[name.toLowerCase()] = newTeam.id
      return newTeam.id
    }

    // Cache players to avoid repeated DB calls
    const playerCache: Record<string, string> = {}
    const getOrCreatePlayer = async (name: string): Promise<string | undefined> => {
      if (!name) return undefined
      if (playerCache[name.toLowerCase()]) return playerCache[name.toLowerCase()]
      const { data: existing } = await supabase.from('players').select('id').ilike('name', name).maybeSingle()
      if (existing) {
        playerCache[name.toLowerCase()] = existing.id
        return existing.id
      }
      const { data: newPlayer, error } = await supabase.from('players').insert({ name }).select('id').single()
      if (error) { res.errors.push(`Erro ao criar jogador "${name}": ${error.message}`); return undefined }
      res.playersCreated++
      playerCache[name.toLowerCase()] = newPlayer.id
      return newPlayer.id
    }

    if (importType === 'teams') {
      for (const [lineIdx, row] of csvData.entries()) {
        try {
          const name = row[reverseMap['name']]?.trim()
          const catName = row[reverseMap['category']]?.trim()
          if (!name) { res.errors.push(`Linha ${lineIdx + 2}: nome do time ausente`); continue }
          const catId = resolveCategory(catName)
          const teamId = await getOrCreateTeam(name)
          if (!teamId) continue
          if (catId) {
            const { error } = await supabase.from('team_categories').upsert(
              { team_id: teamId, category_id: catId },
              { onConflict: 'team_id,category_id' }
            )
            if (!error) res.associationsCreated++
          }
        } catch (err: any) {
          res.errors.push(`Linha ${lineIdx + 2}: ${err.message}`)
        }
      }
    } else {
      // 'combined' and 'players' use the same logic
      for (const [lineIdx, row] of csvData.entries()) {
        try {
          const playerName = row[reverseMap['player_name']]?.trim()
          const teamName = row[reverseMap['team_name']]?.trim()
          const catName = row[reverseMap['category']]?.trim()
          if (!playerName) { res.errors.push(`Linha ${lineIdx + 2}: nome do jogador ausente`); continue }

          const catId = resolveCategory(catName)
          const teamId = teamName ? await getOrCreateTeam(teamName) : undefined
          const playerId = await getOrCreatePlayer(playerName)
          if (!playerId) continue

          // Link team to category
          if (teamId && catId) {
            await supabase.from('team_categories').upsert(
              { team_id: teamId, category_id: catId },
              { onConflict: 'team_id,category_id' }
            )
          }

          // Link player to team+category
          if (teamId && catId) {
            const { error } = await supabase.from('player_teams').upsert(
              { player_id: playerId, team_id: teamId, category_id: catId },
              { onConflict: 'player_id,team_id,category_id' }
            )
            if (!error) res.associationsCreated++
            else res.errors.push(`Linha ${lineIdx + 2}: ${error.message}`)
          }
        } catch (err: any) {
          res.errors.push(`Linha ${lineIdx + 2}: ${err.message}`)
        }
      }
    }

    setResult(res)
    setStep('result')
    setImporting(false)
    queryClient.invalidateQueries({ queryKey: ['teams'] })
    queryClient.invalidateQueries({ queryKey: ['players'] })
    queryClient.invalidateQueries({ queryKey: ['player_teams'] })
  }

  const reset = () => {
    setCsvData([])
    setHeaders([])
    setMapping({})
    setStep('upload')
    setResult(null)
  }

  if (!championshipId) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Upload className="h-7 w-7 text-orange-400" />
          <h1 className="text-2xl font-bold text-white">Importar CSV</h1>
        </div>
        <p className="text-slate-400">Selecione um campeonato no menu lateral para importar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Upload className="h-7 w-7 text-orange-400" />
        <h1 className="text-2xl font-bold text-white">Importar CSV</h1>
      </div>

      {/* Mode selector — always visible */}
      <Card>
        <CardContent className="p-5">
          <Label className="text-base mb-3 block">Tipo de Importação</Label>
          <div className="flex flex-wrap gap-3 mb-4">
            {IMPORT_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => handleTypeChange(mode.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                  importType === mode.key
                    ? 'bg-pitch-600 text-white border-pitch-600'
                    : 'bg-navy-800 text-slate-400 border-navy-600 hover:border-navy-500'
                }`}
              >
                {mode.label}
                {mode.key === 'combined' && (
                  <span className="ml-2 text-[10px] bg-gold-500 text-navy-950 rounded-full px-1.5 py-0.5 font-bold">RECOMENDADO</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-400 mb-3">{currentMode.description}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTemplate(importType)}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Baixar modelo CSV
            </Button>
            <span className="text-xs text-slate-500">Formato esperado: {currentMode.fields.map(f => f.label.split(' (')[0]).join(', ')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Selecione o arquivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-navy-600 rounded-xl p-12 cursor-pointer hover:border-pitch-500 transition-colors group">
              <FileSpreadsheet className="h-12 w-12 text-slate-400 mb-3 group-hover:text-pitch-400 transition-colors" />
              <p className="text-slate-300 font-medium">Clique para selecionar um arquivo CSV</p>
              <p className="text-sm text-slate-500 mt-1">ou arraste e solte aqui</p>
              <p className="text-xs text-slate-600 mt-3">Colunas esperadas: {currentMode.fields.map(f => f.label.split(' (')[0]).join(' · ')}</p>
              <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Field Mapping */}
      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle>Mapeamento de Colunas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">
              Associe cada coluna do CSV ao campo correto. Arquivo com <span className="text-white font-semibold">{csvData.length} linhas</span> detectado.
            </p>
            <div className="space-y-3">
              {headers.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <div className="min-w-[140px] bg-navy-800 rounded-lg px-3 py-2 text-sm text-white font-mono truncate" title={header}>
                    {header}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <Select value={mapping[header] || 'ignore'} onValueChange={v => setMapping(prev => ({ ...prev, [header]: v === 'ignore' ? '' : v }))}>
                    <SelectTrigger className="flex-1 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ignore">— Ignorar coluna —</SelectItem>
                      {currentMode.fields.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={() => setStep('preview')}>Pré-visualizar →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização (primeiras 5 linhas de {csvData.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {currentMode.fields.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                      <TableHead key={f.key}>{f.label.split(' (')[0]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvData.slice(0, 5).map((row, idx) => (
                    <TableRow key={idx}>
                      {currentMode.fields.filter(f => Object.values(mapping).includes(f.key)).map(f => {
                        const csvCol = Object.entries(mapping).find(([, v]) => v === f.key)?.[0]
                        const colIdx = csvCol ? headers.indexOf(csvCol) : -1
                        return (
                          <TableCell key={f.key}>
                            {colIdx >= 0 && row[colIdx] ? row[colIdx] : <span className="text-slate-600">—</span>}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {csvData.length > 5 && (
              <p className="text-xs text-slate-500">... e mais {csvData.length - 5} linhas</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('mapping')}>← Voltar</Button>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Importando...</>
                ) : (
                  <><Upload className="h-4 w-4" />Importar {csvData.length} registros</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 'result' && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-pitch-400" />
              Importação Concluída
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-navy-800 rounded-xl p-4 text-center border border-navy-700">
                <p className="text-3xl font-extrabold text-pitch-400">{result.teamsCreated}</p>
                <p className="text-sm text-slate-400 mt-1">Times criados</p>
              </div>
              <div className="bg-navy-800 rounded-xl p-4 text-center border border-navy-700">
                <p className="text-3xl font-extrabold text-blue-400">{result.playersCreated}</p>
                <p className="text-sm text-slate-400 mt-1">Jogadores criados</p>
              </div>
              <div className="bg-navy-800 rounded-xl p-4 text-center border border-navy-700">
                <p className="text-3xl font-extrabold text-gold-400">{result.associationsCreated}</p>
                <p className="text-sm text-slate-400 mt-1">Vínculos criados</p>
              </div>
              <div className="bg-navy-800 rounded-xl p-4 text-center border border-navy-700">
                <p className={`text-3xl font-extrabold ${result.errors.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {result.errors.length}
                </p>
                <p className="text-sm text-slate-400 mt-1">Erros</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />Erros encontrados:
                </p>
                <ul className="text-sm text-red-300 space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((err, idx) => <li key={idx}>• {err}</li>)}
                </ul>
              </div>
            )}
            {result.errors.length === 0 && (
              <p className="text-sm text-pitch-400 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />Importação realizada sem erros!
              </p>
            )}
            <div className="flex gap-3">
              <Button onClick={reset}>Nova Importação</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
