import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useTeams, useTeamRoster, useUpdatePlayerPositions, useSetCaptain, useCategories, useUpdateJerseyNumber } from '@/hooks/useSupabase'
import { useAdminChampionship } from '@/hooks/useAdminChampionship'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Shield, UserCircle, Pencil, Save, X, Crown } from 'lucide-react'
import { ALL_POSITIONS } from '@/types/database'
import type { PlayerTeam } from '@/types/database'

const POSITION_COLORS: Record<string, string> = {
  'Goleiro': 'bg-gold-500 text-navy-950',
  'Zagueiro': 'bg-blue-600 text-white',
  'Ala': 'bg-cyan-600 text-white',
  'Meio-campo': 'bg-pitch-600 text-white',
  'Meia-atacante': 'bg-purple-600 text-white',
  'Atacante': 'bg-red-500 text-white',
  'Centroavante': 'bg-orange-500 text-white',
}

function PositionBadge({ pos }: { pos: string }) {
  const colors = POSITION_COLORS[pos] ?? 'bg-navy-600 text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors}`}>
      {pos}
    </span>
  )
}

function PlayerRow({ playerTeam }: { playerTeam: PlayerTeam }) {
  const positions = playerTeam.positions?.filter(p => p !== 'Jogador') ?? []
  const isGk = positions.includes('Goleiro')
  const isCaptain = playerTeam.is_captain

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-navy-800 last:border-0">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 relative ${isGk ? 'bg-gold-500/20 text-gold-400' : 'bg-navy-700 text-slate-300'}`}>
        {playerTeam.jersey_number ?? '—'}
        {isCaptain && (
          <div className="absolute -top-1 -right-1 bg-gold-500 rounded-full p-0.5">
            <Crown className="h-2.5 w-2.5 text-navy-950" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-white text-sm">{playerTeam.player?.name}</p>
          {playerTeam.player?.user_id && <span className="text-[10px] text-pitch-400" title="Conta vinculada">🔗</span>}
          {isCaptain && <Badge variant="warning" className="text-[9px] px-1 py-0">C</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 justify-end">
        {positions.length > 0 ? positions.map(pos => (
          <PositionBadge key={pos} pos={pos} />
        )) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </div>
    </div>
  )
}

function PositionEditor({
  playerTeam,
  onSave,
  onSetCaptain,
  onJerseyChange,
  onLinkUser,
  saving,
  settingCaptain,
}: {
  playerTeam: PlayerTeam
  onSave: (id: string, positions: string[]) => void
  onSetCaptain: (id: string) => void
  onJerseyChange: (id: string, value: string) => void
  onLinkUser: (playerId: string, email: string) => void
  saving: boolean
  settingCaptain: boolean
}) {
  const [selected, setSelected] = useState<string[]>(playerTeam.positions ?? [])
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...(playerTeam.positions ?? [])].sort())

  const toggle = (pos: string) => {
    setSelected(prev => {
      if (prev.includes(pos)) return prev.filter(p => p !== pos)
      if (prev.length >= 3) return prev
      return [...prev, pos]
    })
  }

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-navy-800 last:border-0 bg-navy-800/30">
      <div className="h-9 w-9 rounded-full bg-navy-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0 relative">
        {playerTeam.player?.name?.charAt(0) ?? '?'}
        {playerTeam.is_captain && (
          <div className="absolute -top-1 -right-1 bg-gold-500 rounded-full p-0.5">
            <Crown className="h-2.5 w-2.5 text-navy-950" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="font-medium text-white text-sm">{playerTeam.player?.name}</p>
          <input
            type="number"
            defaultValue={playerTeam.jersey_number ?? ''}
            onBlur={e => onJerseyChange(playerTeam.id, e.target.value)}
            placeholder="Nº"
            className="w-12 h-7 text-center text-xs bg-navy-800 border border-navy-600 rounded text-white focus:border-pitch-500 focus:outline-none"
          />
          <button
            onClick={() => onSetCaptain(playerTeam.id)}
            disabled={playerTeam.is_captain || settingCaptain}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
              playerTeam.is_captain
                ? 'bg-gold-500 text-navy-950 border-gold-500'
                : 'bg-navy-800 text-slate-500 border-navy-700 hover:border-gold-500 hover:text-gold-400'
            }`}
            title={playerTeam.is_captain ? 'Capitão atual' : 'Definir como capitão'}
          >
            <Crown className="h-3 w-3" />
            {playerTeam.is_captain ? 'Capitão' : 'Capitão'}
          </button>
          <input
            type="email"
            defaultValue=""
            onBlur={e => { if (e.target.value.trim()) onLinkUser(playerTeam.player_id, e.target.value.trim()) }}
            placeholder={playerTeam.player?.user_id ? '🔗 Vinculado' : 'Email p/ vincular'}
            className="w-36 h-6 text-[10px] bg-navy-800 border border-navy-600 rounded px-1.5 text-white placeholder:text-slate-500 focus:border-pitch-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => toggle(pos)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                selected.includes(pos)
                  ? `${POSITION_COLORS[pos] ?? 'bg-navy-600 text-slate-300'} border-transparent`
                  : 'bg-navy-800 text-slate-500 border-navy-700 hover:border-navy-500'
              } ${selected.length >= 3 && !selected.includes(pos) ? 'opacity-30 cursor-not-allowed' : ''}`}
              disabled={selected.length >= 3 && !selected.includes(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>
      {changed && (
        <Button size="sm" onClick={() => onSave(playerTeam.id, selected)} disabled={saving} className="flex-shrink-0">
          <Save className="h-3 w-3 mr-1" />{saving ? '...' : 'Salvar'}
        </Button>
      )}
    </div>
  )
}

export default function TeamDetail() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { selectedId: championshipId } = useAdminChampionship()
  const { data: teams } = useTeams(championshipId)
  const { data: categories } = useCategories()
  const updatePositions = useUpdatePlayerPositions()
  const setCaptain = useSetCaptain()
  const updateJersey = useUpdateJerseyNumber()
  const [editing, setEditing] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [settingCaptain, setSettingCaptain] = useState(false)

  const team = teams?.find(t => t.id === teamId)

  const masterCatId = categories?.find(c => c.name === 'Master')?.id
  const livreCatId = categories?.find(c => c.name === 'Livre')?.id
  const veteranoCatId = categories?.find(c => c.name === 'Veterano')?.id

  const { data: masterRoster } = useTeamRoster(teamId, masterCatId)
  const { data: livreRoster } = useTeamRoster(teamId, livreCatId)
  const { data: veteranoRoster } = useTeamRoster(teamId, veteranoCatId)

  const activeRoster = (masterRoster?.length ?? 0) > 0
    ? { roster: masterRoster!, catName: 'Master', catId: masterCatId! }
    : (livreRoster?.length ?? 0) > 0
    ? { roster: livreRoster!, catName: 'Livre', catId: livreCatId! }
    : (veteranoRoster?.length ?? 0) > 0
    ? { roster: veteranoRoster!, catName: 'Veterano', catId: veteranoCatId! }
    : null

  // Sort: captain first, then goalkeepers, then alphabetical
  const sortedRoster = activeRoster?.roster.slice().sort((a, b) => {
    if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1
    const aGk = a.positions?.includes('Goleiro') ? 0 : 1
    const bGk = b.positions?.includes('Goleiro') ? 0 : 1
    if (aGk !== bGk) return aGk - bGk
    return (a.player?.name ?? '').localeCompare(b.player?.name ?? '')
  })

  const captain = activeRoster?.roster.find(pt => pt.is_captain)

  const handleLinkUser = async (playerId: string, email: string) => {
    try {
      const res = await fetch('https://euufoowdghcczoovulfq.supabase.co/functions/v1/link-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', player_id: playerId, email }),
      })
      const data = await res.json()
      if (data.error) alert('Erro: ' + data.error)
      else alert('Jogador vinculado com sucesso!')
    } catch { alert('Erro ao vincular') }
  }

  const handleJerseyChange = async (playerTeamId: string, value: string) => {
    const num = value ? parseInt(value) : null
    await updateJersey.mutateAsync({ playerTeamId, jerseyNumber: num })
  }

  const handleSave = async (playerTeamId: string, positions: string[]) => {
    setSavingId(playerTeamId)
    await updatePositions.mutateAsync({ playerTeamId, positions })
    setSavingId(null)
  }

  const handleSetCaptain = async (playerTeamId: string) => {
    if (!teamId || !activeRoster) return
    setSettingCaptain(true)
    await setCaptain.mutateAsync({
      playerTeamId,
      teamId,
      categoryId: activeRoster.catId,
    })
    setSettingCaptain(false)
  }

  if (!team) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/admin/times')}>
          <ChevronLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <p className="text-slate-400">Time não encontrado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/admin/times')}>
        <ChevronLeft className="h-4 w-4 mr-1" />Voltar aos Times
      </Button>

      {/* Team Header */}
      <div className="flex items-center gap-4">
        {team.shield_url ? (
          <img src={team.shield_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-navy-700 flex items-center justify-center">
            <Shield className="h-8 w-8 text-slate-400" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{team.name}</h1>
          {activeRoster && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{activeRoster.catName}</Badge>
              <span className="text-sm text-slate-400">{activeRoster.roster.length} jogadores</span>
              {captain && (
                <span className="text-sm text-gold-400 flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5" />
                  {captain.player?.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Roster */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-700">
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-pitch-400" />
            <h2 className="text-base font-semibold text-white">Elenco</h2>
          </div>
          <Button
            variant={editing ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? <><X className="h-3.5 w-3.5 mr-1" />Fechar edição</> : <><Pencil className="h-3.5 w-3.5 mr-1" />Editar</>}
          </Button>
        </div>

        {!sortedRoster || sortedRoster.length === 0 ? (
          <CardContent className="py-8">
            <p className="text-slate-400 text-center">Nenhum jogador vinculado a este time.</p>
          </CardContent>
        ) : (
          <div>
            <div className="flex items-center gap-3 py-2 px-4 border-b border-navy-700 text-xs text-slate-500 font-medium">
              <div className="w-9" />
              <div className="flex-1">Jogador</div>
              <div className="text-right">{editing ? 'Posições + Capitão' : 'Posições'}</div>
            </div>
            {sortedRoster.map(pt =>
              editing ? (
                <PositionEditor
                  key={pt.id}
                  playerTeam={pt}
                  onSave={handleSave}
                  onSetCaptain={handleSetCaptain}
                  onJerseyChange={handleJerseyChange}
                  onLinkUser={handleLinkUser}
                  saving={savingId === pt.id}
                  settingCaptain={settingCaptain}
                />
              ) : (
                <PlayerRow key={pt.id} playerTeam={pt} />
              )
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
