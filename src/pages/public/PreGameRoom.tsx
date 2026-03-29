import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayer, useMyTeams, useTeamRoster, useActiveChampionship } from '@/hooks/useSupabase'
import TacticalBoard, { getDefaultFormation, rotatePositions, FORMATIONS } from '@/components/TacticalBoard'
import type { FieldOrientation, FormationName } from '@/components/TacticalBoard'
import { TeamBadge } from '@/components/TeamBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { resolveTeamColors } from '@/lib/utils'
import {
  ChevronLeft, Calendar, MessageSquare, Swords, Send, Loader2,
  Plus, Save, Trash2, Edit2, Check, X, MapPin,
} from 'lucide-react'
import { formatDate, phaseLabel } from '@/lib/utils'

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match_pregame', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(id,name,primary_color,secondary_color,shield_url), away_team:teams!matches_away_team_id_fkey(id,name,primary_color,secondary_color,shield_url), category:categories(id,name)')
        .eq('id', matchId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!matchId,
  })
}

function useComments(matchId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['pregame_comments', matchId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pregame_comments')
        .select('*, player:players(id,name,photo_url), scenario:pregame_scenarios(id,title)')
        .eq('match_id', matchId!)
        .eq('team_id', teamId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!matchId && !!teamId,
    refetchInterval: 8000,
    retry: 1,
  })
}

function useScenarioComments(matchId: string | undefined, teamId: string | undefined, scenarioId: string | undefined) {
  return useQuery({
    queryKey: ['pregame_comments', matchId, teamId, scenarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pregame_comments')
        .select('*, player:players(id,name,photo_url)')
        .eq('match_id', matchId!)
        .eq('team_id', teamId!)
        .eq('scenario_id', scenarioId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!matchId && !!teamId && !!scenarioId,
    refetchInterval: 10000,
    retry: 1,
  })
}

function useScenarios(matchId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['pregame_scenarios', matchId, teamId],
    queryFn: async () => {
      const { data: scenarios, error } = await supabase
        .from('pregame_scenarios')
        .select('*')
        .eq('match_id', matchId!)
        .eq('team_id', teamId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      if (!scenarios || scenarios.length === 0) return []
      const ids = scenarios.map((s: any) => s.id)
      const userIds = [...new Set(scenarios.map((s: any) => s.created_by))]
      const [{ data: scenPlayers }, { data: creators }] = await Promise.all([
        supabase.from('pregame_scenario_players').select('*').in('scenario_id', ids),
        supabase.from('players').select('user_id, name').in('user_id', userIds),
      ])
      return scenarios.map((s: any) => ({
        ...s,
        players: (scenPlayers ?? []).filter((p: any) => p.scenario_id === s.id),
        creator_name: (creators ?? []).find((c: any) => c.user_id === s.created_by)?.name ?? null,
      }))
    },
    enabled: !!matchId && !!teamId,
    refetchInterval: 15000,
    retry: 1,
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiscussionTab({ matchId, teamId, myPlayer }: { matchId: string; teamId: string; myPlayer: any }) {
  const { data: comments = [], isLoading, isError, error: queryError } = useComments(matchId, teamId)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !user) return
    setSending(true)
    setSendError(null)
    const { error } = await supabase.from('pregame_comments').insert({
      match_id: matchId,
      team_id: teamId,
      player_id: myPlayer?.id ?? null,
      user_id: user.id,
      content: text.trim(),
    })
    if (error) {
      setSendError(error.message.includes('relation') || error.message.includes('does not exist')
        ? 'Tabela não encontrada. Execute o SQL de configuração no Supabase.'
        : `Erro ao enviar: ${error.message}`)
    } else {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['pregame_comments', matchId, teamId] })
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3" style={{ maxHeight: 480 }}>
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-pitch-400" />
          </div>
        )}
        {isError && (
          <div className="text-center py-6 text-red-400 text-sm bg-red-400/10 rounded-lg px-4">
            {(queryError as any)?.message?.includes('relation') || (queryError as any)?.message?.includes('does not exist')
              ? '⚠️ Tabela não encontrada. Execute o SQL de configuração no Supabase antes de usar esta função.'
              : `Erro: ${(queryError as any)?.message}`}
          </div>
        )}
        {!isLoading && !isError && comments.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">
            Nenhum comentário ainda. Seja o primeiro a falar!
          </div>
        )}
        {comments.map((c: any) => {
          const isMe = c.user_id === user?.id
          return (
            <div key={c.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className="h-8 w-8 rounded-full bg-navy-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                {c.player?.name?.charAt(0) ?? '?'}
              </div>
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                <span className="text-[10px] text-slate-500 px-1">{c.player?.name ?? 'Usuário'}</span>
                {c.scenario && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full bg-pitch-600/20 text-pitch-400 flex items-center gap-1 w-fit ${isMe ? 'self-end' : ''}`}>
                    <MapPin className="h-2.5 w-2.5" /> {c.scenario.title}
                  </span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-pitch-600 text-white rounded-tr-sm' : 'bg-navy-800 text-slate-200 rounded-tl-sm'}`}>
                  {c.content}
                </div>
                <span className="text-[9px] text-slate-600 px-1">
                  {(() => {
                    const d = new Date(c.created_at)
                    const today = new Date()
                    const isToday = d.toDateString() === today.toDateString()
                    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    if (isToday) return time
                    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
                  })()}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <div className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2 mt-2">{sendError}</div>
      )}
      <form onSubmit={handleSend} className="flex gap-2 mt-3 pt-3 border-t border-navy-700">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="flex-1"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={!text.trim() || sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}

function ScenarioDiscussion({ matchId, teamId, scenarioId, myPlayer }: {
  matchId: string; teamId: string; scenarioId: string; myPlayer: any
}) {
  const { data: comments = [], isLoading } = useScenarioComments(matchId, teamId, scenarioId)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !user) return
    setSending(true)
    await supabase.from('pregame_comments').insert({
      match_id: matchId, team_id: teamId, scenario_id: scenarioId,
      player_id: myPlayer?.id ?? null, user_id: user.id, content: text.trim(),
    })
    setText('')
    queryClient.invalidateQueries({ queryKey: ['pregame_comments', matchId, teamId, scenarioId] })
    queryClient.invalidateQueries({ queryKey: ['pregame_comments', matchId, teamId] })
    setSending(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-navy-700">
      <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-3">
        <MessageSquare className="h-3.5 w-3.5" /> Discussão deste cenário
      </h4>
      <div className="space-y-2 max-h-52 overflow-y-auto pr-1 mb-3">
        {isLoading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-pitch-400" /></div>}
        {!isLoading && comments.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-3">Nenhum comentário ainda.</p>
        )}
        {comments.map((c: any) => {
          const isMe = c.user_id === user?.id
          return (
            <div key={c.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className="h-6 w-6 rounded-full bg-navy-700 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
                {c.player?.name?.charAt(0) ?? '?'}
              </div>
              <div className={`max-w-[80%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[9px] text-slate-500 px-1">{c.player?.name ?? 'Usuário'}</span>
                <div className={`px-2.5 py-1.5 rounded-xl text-xs ${isMe ? 'bg-pitch-600 text-white rounded-tr-sm' : 'bg-navy-800 text-slate-200 rounded-tl-sm'}`}>
                  {c.content}
                </div>
                <span className="text-[8px] text-slate-600 px-1">
                  {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2">
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="Comente sobre este cenário..." className="flex-1 h-8 text-xs" disabled={sending} />
        <Button type="submit" size="icon" className="h-8 w-8" disabled={!text.trim() || sending}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </div>
  )
}

function ScenariosTab({
  matchId, teamId, myRoster, opponentRoster,
  myTeamData, opponentTeamData, myPlayer,
}: {
  matchId: string
  teamId: string
  myRoster: any[]
  opponentRoster: any[]
  myTeamData: any
  opponentTeamData: any
  myPlayer: any
}) {
  const { data: scenarios = [], isLoading, isError: scenariosError, error: scenariosQueryError } = useScenarios(matchId, teamId)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [activeScenarioId, setActiveScenarioId] = useState<string | 'new' | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)

  const [orientation, setOrientation] = useState<FieldOrientation>('portrait')
  const [homeFormation, setHomeFormation] = useState<FormationName>('3-2-1')
  const [awayFormation, setAwayFormation] = useState<FormationName>('3-2-1')
  const [homePlayers, setHomePlayers] = useState<any[]>([])
  const [awayPlayers, setAwayPlayers] = useState<any[]>([])
  const [drawings, setDrawings] = useState<any[]>([])
  const [showOpponent, setShowOpponent] = useState(true)

  const [homeColor, awayColor] = resolveTeamColors(myTeamData?.primary_color, opponentTeamData?.primary_color)

  // Load scenario into board
  const loadScenario = (scenario: any) => {
    setActiveScenarioId(scenario.id)
    setEditTitle(scenario.title)
    setEditDesc(scenario.description ?? '')
    setDrawings(scenario.drawings ?? [])
    const home = (scenario.players ?? []).filter((p: any) => p.team_side === 'home')
    const away = (scenario.players ?? []).filter((p: any) => p.team_side === 'away')
    if (home.length > 0) {
      setHomePlayers(home.map((p: any) => ({
        id: p.id, label: p.label, jerseyNumber: p.jersey_number,
        x: p.position_x, y: p.position_y, side: 'home', playerId: p.player_id,
      })))
    }
    if (away.length > 0) {
      setAwayPlayers(away.map((p: any) => ({
        id: p.id, label: p.label, jerseyNumber: p.jersey_number,
        x: p.position_x, y: p.position_y, side: 'away', playerId: p.player_id,
      })))
    }
  }

  const openNew = () => {
    setActiveScenarioId('new')
    setEditTitle('Novo Cenário')
    setEditDesc('')
    setDrawings([])
    const rp = myRoster.slice(0, 7).map(pt => ({
      id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
    }))
    setHomePlayers(getDefaultFormation(rp, 'home', orientation, homeFormation))
    if (opponentRoster.length > 0) {
      const rp2 = opponentRoster.slice(0, 7).map(pt => ({
        id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id,
      }))
      setAwayPlayers(getDefaultFormation(rp2, 'away', orientation, awayFormation))
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      let sid = activeScenarioId === 'new' ? null : activeScenarioId

      if (!sid) {
        const { data, error } = await supabase
          .from('pregame_scenarios')
          .insert({ match_id: matchId, team_id: teamId, title: editTitle, description: editDesc, drawings, created_by: user.id })
          .select('id').single()
        if (error) throw error
        sid = data.id
        setActiveScenarioId(sid)
      } else {
        const { error } = await supabase.from('pregame_scenarios')
          .update({ title: editTitle, description: editDesc, drawings, updated_at: new Date().toISOString() })
          .eq('id', sid)
        if (error) throw error
      }

      // Save players
      const { error: delErr } = await supabase.from('pregame_scenario_players').delete().eq('scenario_id', sid!)
      if (delErr) throw delErr

      const allPlayers = [
        ...homePlayers.map(p => ({ scenario_id: sid!, player_id: p.playerId ?? null, label: p.label, jersey_number: p.jerseyNumber, position_x: p.x, position_y: p.y, team_side: 'home' })),
        ...awayPlayers.map(p => ({ scenario_id: sid!, player_id: p.playerId ?? null, label: p.label, jersey_number: p.jerseyNumber, position_x: p.x, position_y: p.y, team_side: 'away' })),
      ]
      if (allPlayers.length > 0) {
        const { error: insErr } = await supabase.from('pregame_scenario_players').insert(allPlayers)
        if (insErr) throw insErr
      }

      queryClient.invalidateQueries({ queryKey: ['pregame_scenarios', matchId, teamId] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido'
      setSaveError(msg.includes('relation') || msg.includes('does not exist')
        ? '⚠️ Tabela não encontrada. Execute o SQL de configuração no Supabase.'
        : `Erro ao salvar: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cenário?')) return
    setDeleting(id)
    await supabase.from('pregame_scenarios').delete().eq('id', id)
    if (activeScenarioId === id) setActiveScenarioId(null)
    queryClient.invalidateQueries({ queryKey: ['pregame_scenarios', matchId, teamId] })
    setDeleting(null)
  }

  const handleOrientationChange = (newO: FieldOrientation) => {
    setHomePlayers(prev => rotatePositions(prev, orientation, newO))
    setAwayPlayers(prev => rotatePositions(prev, orientation, newO))
    setOrientation(newO)
  }

  return (
    <div className="space-y-4">
      {/* Scenario list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Cenários salvos ({scenarios.length})</h3>
        {activeScenarioId === 'new' ? (
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Salvando...' : 'Salvar cenário'}
          </Button>
        ) : (
          <Button size="sm" onClick={openNew} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Novo cenário
          </Button>
        )}
      </div>

      {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-pitch-400" /></div>}
      {scenariosError && (
        <div className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-3">
          {(scenariosQueryError as any)?.message?.includes('relation') || (scenariosQueryError as any)?.message?.includes('does not exist')
            ? '⚠️ Tabela não encontrada. Execute o SQL de configuração no Supabase antes de usar esta função.'
            : `Erro: ${(scenariosQueryError as any)?.message}`}
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {scenarios.map((s: any) => {
            const savedAt = new Date(s.updated_at ?? s.created_at)
            const today = new Date()
            const isToday = savedAt.toDateString() === today.toDateString()
            const savedLabel = `${s.creator_name ?? 'Alguém'} · ${isToday ? '' : savedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' '}${savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            return (
            <div
              key={s.id}
              className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${activeScenarioId === s.id ? 'bg-pitch-600/20 border-pitch-500 text-pitch-400' : 'bg-navy-800 border-navy-700 text-slate-300 hover:bg-navy-700'}`}
              onClick={() => loadScenario(s)}
            >
              <div className="flex items-center gap-2">
                {editingTitleId === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.title}
                    className="bg-transparent border-b border-pitch-500 text-white text-sm outline-none w-28"
                    onBlur={async e => {
                      await supabase.from('pregame_scenarios').update({ title: e.target.value }).eq('id', s.id)
                      queryClient.invalidateQueries({ queryKey: ['pregame_scenarios', matchId, teamId] })
                      setEditingTitleId(null)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span>{s.title}</span>
                )}
                <button className="text-slate-500 hover:text-slate-300 transition-colors" onClick={e => { e.stopPropagation(); setEditingTitleId(s.id) }} title="Renomear">
                  <Edit2 className="h-3 w-3" />
                </button>
                <button className="text-red-400/50 hover:text-red-400 transition-colors" onClick={e => { e.stopPropagation(); handleDelete(s.id) }} disabled={deleting === s.id}>
                  {deleting === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </div>
              <span className="text-[9px] text-slate-500">{savedLabel}</span>
            </div>
          )})}

        </div>
      )}

      {/* Board editor */}
      {activeScenarioId && (
        <Card className="border-pitch-600/30">
          <CardContent className="p-4 space-y-4">
            {/* Title + Description */}
            <div className="space-y-2">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Título do cenário"
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm font-semibold focus:border-pitch-500 focus:outline-none"
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Descreva a jogada, posicionamento ou instrução para o time..."
                rows={3}
                className="w-full bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-white text-sm placeholder:text-slate-500 focus:border-pitch-500 focus:outline-none resize-none"
              />
            </div>

            {/* Formation selectors */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-blue-400 font-semibold">{myTeamData?.name}:</span>
                {(Object.keys(FORMATIONS) as FormationName[]).map(f => (
                  <button key={f} onClick={() => {
                    setHomeFormation(f)
                    const rp = myRoster.slice(0, 7).map(pt => ({ id: `home-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
                    setHomePlayers(getDefaultFormation(rp, 'home', orientation, f))
                  }} className={`px-2 py-1 rounded text-xs font-bold transition-all ${homeFormation === f ? 'bg-blue-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>{f}</button>
                ))}
              </div>
              {opponentRoster.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-red-400 font-semibold">{opponentTeamData?.name}:</span>
                  {showOpponent && (Object.keys(FORMATIONS) as FormationName[]).map(f => (
                    <button key={f} onClick={() => {
                      setAwayFormation(f)
                      const rp = opponentRoster.slice(0, 7).map(pt => ({ id: `away-${pt.id}`, name: pt.player?.name ?? '?', jerseyNumber: pt.jersey_number, playerId: pt.player_id }))
                      setAwayPlayers(getDefaultFormation(rp, 'away', orientation, f))
                    }} className={`px-2 py-1 rounded text-xs font-bold transition-all ${awayFormation === f ? 'bg-red-600 text-white' : 'bg-navy-800 text-slate-400 hover:bg-navy-700'}`}>{f}</button>
                  ))}
                  <button
                    onClick={() => setShowOpponent(prev => !prev)}
                    className={`px-2 py-1 rounded text-xs font-bold transition-all border ${showOpponent ? 'border-red-400/50 text-red-400 hover:bg-red-400/10' : 'border-slate-600 text-slate-500 hover:bg-navy-700'}`}
                  >
                    {showOpponent ? 'Ocultar' : 'Mostrar adversário'}
                  </button>
                </div>
              )}
            </div>

            {/* Tactical board */}
            <TacticalBoard
              homePlayers={homePlayers}
              awayPlayers={awayPlayers}
              homeColor={homeColor}
              awayColor={awayColor}
              homeTeamName={myTeamData?.name ?? 'Meu Time'}
              awayTeamName={opponentTeamData?.name ?? 'Adversário'}
              onPlayerMove={(id, x, y) => {
                setHomePlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
                setAwayPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))
              }}
              onPlayersSwap={(id1, id2) => {
                const doSwap = (list: any[], set: (fn: (p: any[]) => any[]) => void) => {
                  const p1 = list.find(p => p.id === id1)
                  const p2 = list.find(p => p.id === id2)
                  if (p1 && p2) set(prev => prev.map(p => p.id === id1 ? { ...p, x: p2.x, y: p2.y } : p.id === id2 ? { ...p, x: p1.x, y: p1.y } : p))
                }
                doSwap(homePlayers, setHomePlayers)
                doSwap(awayPlayers, setAwayPlayers)
              }}
              onPlayerEject={id => {
                if (id.startsWith('undo:')) return
                setHomePlayers(prev => prev.filter(p => p.id !== id))
                setAwayPlayers(prev => prev.filter(p => p.id !== id))
              }}
              onDrawingsChange={setDrawings}
              initialDrawings={drawings}
              showAway={opponentRoster.length > 0 && showOpponent}
              orientation={orientation}
              onOrientationChange={handleOrientationChange}
            />

            {saveError && (
              <div className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{saveError}</div>
            )}
            {saveSuccess && (
              <div className="text-pitch-400 text-xs bg-pitch-400/10 rounded-lg px-3 py-2 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Cenário salvo com sucesso!
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => setActiveScenarioId(null)}>
                <X className="h-3.5 w-3.5 mr-1" /> Fechar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {saving ? 'Salvando...' : 'Salvar cenário'}
              </Button>
            </div>

            {activeScenarioId && activeScenarioId !== 'new' && (
              <ScenarioDiscussion
                matchId={matchId}
                teamId={teamId}
                scenarioId={activeScenarioId}
                myPlayer={myPlayer}
              />
            )}
          </CardContent>
        </Card>
      )}

      {!activeScenarioId && !isLoading && scenarios.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          Nenhum cenário criado ainda. Clique em "Novo cenário" para começar.
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PreGameRoom() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: myPlayer } = useMyPlayer(user?.id)
  const { data: myTeamLinks } = useMyTeams(myPlayer?.id)
  const { data: match, isLoading: matchLoading } = useMatch(matchId)

  // Find which team the user belongs to in this match
  const activeLinks = myTeamLinks?.filter((l: any) => l.team?.championship?.id === championship?.id) ?? []
  const myLink = activeLinks.find((l: any) =>
    l.team_id === match?.home_team_id || l.team_id === match?.away_team_id
  )
  const teamId = myLink?.team_id as string | undefined
  const categoryId = myLink?.category_id as string | undefined

  const isHome = teamId === match?.home_team_id
  const myTeamData = isHome ? match?.home_team : match?.away_team
  const opponentTeamData = isHome ? match?.away_team : match?.home_team
  const opponentTeamId = opponentTeamData?.id as string | undefined

  // Load category id for opponent
  const { data: opponentCatId } = useQuery({
    queryKey: ['team_category_id', opponentTeamId],
    queryFn: async () => {
      const { data } = await supabase.from('player_teams').select('category_id').eq('team_id', opponentTeamId!).limit(1)
      return data?.[0]?.category_id as string | null ?? null
    },
    enabled: !!opponentTeamId,
  })

  const { data: myRoster = [] } = useTeamRoster(teamId, categoryId)
  const { data: opponentRoster = [] } = useTeamRoster(opponentTeamId, opponentCatId ?? undefined)

  // ── Access control ────────────────────────────────────────
  if (!user) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Faça <Link to="/login" className="text-pitch-400 hover:underline">login</Link> para acessar esta página.</p>
      </div>
    )
  }

  if (!matchLoading && match && myTeamLinks !== undefined && !myLink) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-slate-400">Você não faz parte de nenhum dos times desta partida.</p>
        <Button variant="outline" onClick={() => navigate('/meu-time')}>← Meu Time</Button>
      </div>
    )
  }

  if (matchLoading || !match) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-pitch-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Back */}
      <Link to="/meu-time" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
        <ChevronLeft className="h-4 w-4" /> Meu Time
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Swords className="h-6 w-6 text-pitch-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Sala de Preparação</h1>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-pitch-400 inline-block animate-pulse" />
            Compartilhado com todos os jogadores do time
          </p>
        </div>
      </div>

      {/* Match card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Badge variant="secondary">{phaseLabel(match.phase)}</Badge>
            {match.category && <Badge variant="outline">{match.category.name}</Badge>}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <TeamBadge name={match.home_team?.name} shieldUrl={match.home_team?.shield_url} size="lg" className="mx-auto mb-2" />
              <p className={`font-bold text-sm ${match.home_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                {match.home_team?.name}
              </p>
            </div>
            <div className="text-slate-400 font-extrabold text-xl px-2">VS</div>
            <div className="flex-1 text-center">
              <TeamBadge name={match.away_team?.name} shieldUrl={match.away_team?.shield_url} size="lg" className="mx-auto mb-2" />
              <p className={`font-bold text-sm ${match.away_team_id === teamId ? 'text-white' : 'text-slate-400'}`}>
                {match.away_team?.name}
              </p>
            </div>
          </div>
          {(match.match_date || match.location) && (
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-slate-400">
              {match.match_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{formatDate(match.match_date)}
                </span>
              )}
              {match.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{match.location}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {teamId && (
        <>
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4 text-pitch-400" /> Cenários Táticos
              </h2>
              <ScenariosTab
                matchId={matchId!}
                teamId={teamId}
                myRoster={myRoster as any[]}
                opponentRoster={opponentRoster as any[]}
                myTeamData={myTeamData}
                opponentTeamData={opponentTeamData}
                myPlayer={myPlayer}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                <MessageSquare className="h-4 w-4 text-pitch-400" /> Discussão Geral
              </h2>
              <DiscussionTab
                matchId={matchId!}
                teamId={teamId}
                myPlayer={myPlayer}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
