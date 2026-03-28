import { useState, useRef, useCallback, useEffect } from 'react'

export interface BoardPlayer {
  id: string
  label: string
  jerseyNumber: number | null
  x: number
  y: number
  side: 'home' | 'away'
  playerId?: string
}

type DrawTool = 'move' | 'swap' | 'eject' | 'arrow' | 'pass' | 'run' | 'zone' | 'free'
type DrawElement = ArrowElement | FreeDrawElement | ZoneElement

interface ArrowElement {
  type: 'arrow' | 'pass' | 'run'
  x1: number; y1: number; x2: number; y2: number
  color: string
}

interface FreeDrawElement {
  type: 'free'
  points: { x: number; y: number }[]
  color: string
}

interface ZoneElement {
  type: 'zone'
  x: number; y: number; w: number; h: number
  color: string
}

type HistoryAction =
  | { type: 'move'; playerId: string; prevX: number; prevY: number }
  | { type: 'swap'; id1: string; id2: string }
  | { type: 'drawing' }
  | { type: 'eject'; player: BoardPlayer }

export type FieldOrientation = 'portrait' | 'landscape'

interface TacticalBoardProps {
  homePlayers: BoardPlayer[]
  awayPlayers: BoardPlayer[]
  homeColor: string
  awayColor: string
  homeTeamName: string
  awayTeamName: string
  onPlayerMove?: (playerId: string, x: number, y: number) => void
  onPlayersSwap?: (id1: string, id2: string) => void
  onPlayerEject?: (playerId: string) => void
  onDrawingsChange?: (drawings: DrawElement[]) => void
  initialDrawings?: DrawElement[]
  readOnly?: boolean
  showAway?: boolean
  orientation?: FieldOrientation
  onOrientationChange?: (o: FieldOrientation) => void
}

// Formations in PORTRAIT mode (vertical field, home at bottom)
// Each formation: GK at index 0, then field players
export type FormationName = '3-2-1' | '2-3-1' | '2-1-2-1' | '4-1-1' | '3-3-0' | '1-3-2'

export const FORMATIONS: Record<FormationName, { label: string; home: { x: number; y: number }[]; away: { x: number; y: number }[] }> = {
  '3-2-1': {
    label: '3-2-1',
    home: [
      { x: 50, y: 92 },
      { x: 20, y: 72 }, { x: 50, y: 72 }, { x: 80, y: 72 },
      { x: 33, y: 52 }, { x: 67, y: 52 },
      { x: 50, y: 32 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 80, y: 28 }, { x: 50, y: 28 }, { x: 20, y: 28 },
      { x: 67, y: 48 }, { x: 33, y: 48 },
      { x: 50, y: 68 },
    ],
  },
  '2-3-1': {
    label: '2-3-1',
    home: [
      { x: 50, y: 92 },
      { x: 30, y: 72 }, { x: 70, y: 72 },
      { x: 20, y: 52 }, { x: 50, y: 52 }, { x: 80, y: 52 },
      { x: 50, y: 32 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 70, y: 28 }, { x: 30, y: 28 },
      { x: 80, y: 48 }, { x: 50, y: 48 }, { x: 20, y: 48 },
      { x: 50, y: 68 },
    ],
  },
  '2-1-2-1': {
    label: '2-1-2-1',
    home: [
      { x: 50, y: 92 },
      { x: 30, y: 76 }, { x: 70, y: 76 },
      { x: 50, y: 62 },
      { x: 30, y: 46 }, { x: 70, y: 46 },
      { x: 50, y: 30 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 70, y: 24 }, { x: 30, y: 24 },
      { x: 50, y: 38 },
      { x: 70, y: 54 }, { x: 30, y: 54 },
      { x: 50, y: 70 },
    ],
  },
  '4-1-1': {
    label: '4-1-1',
    home: [
      { x: 50, y: 92 },
      { x: 15, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 85, y: 70 },
      { x: 50, y: 50 },
      { x: 50, y: 32 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 85, y: 30 }, { x: 62, y: 30 }, { x: 38, y: 30 }, { x: 15, y: 30 },
      { x: 50, y: 50 },
      { x: 50, y: 68 },
    ],
  },
  '3-3-0': {
    label: '3-3-0',
    home: [
      { x: 50, y: 92 },
      { x: 20, y: 68 }, { x: 50, y: 68 }, { x: 80, y: 68 },
      { x: 20, y: 44 }, { x: 50, y: 44 }, { x: 80, y: 44 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 80, y: 32 }, { x: 50, y: 32 }, { x: 20, y: 32 },
      { x: 80, y: 56 }, { x: 50, y: 56 }, { x: 20, y: 56 },
    ],
  },
  '1-3-2': {
    label: '1-3-2',
    home: [
      { x: 50, y: 92 },
      { x: 50, y: 72 },
      { x: 20, y: 52 }, { x: 50, y: 52 }, { x: 80, y: 52 },
      { x: 33, y: 32 }, { x: 67, y: 32 },
    ],
    away: [
      { x: 50, y: 8 },
      { x: 50, y: 28 },
      { x: 80, y: 48 }, { x: 50, y: 48 }, { x: 20, y: 48 },
      { x: 67, y: 68 }, { x: 33, y: 68 },
    ],
  },
}

const DEFAULT_FORMATION: FormationName = '3-2-1'

export function getDefaultFormation(
  players: { id: string; name: string; jerseyNumber: number | null; playerId?: string }[],
  side: 'home' | 'away',
  orientation: FieldOrientation = 'portrait',
  formation: FormationName = DEFAULT_FORMATION
): BoardPlayer[] {
  const positions = side === 'home' ? FORMATIONS[formation].home : FORMATIONS[formation].away
  return players.slice(0, 7).map((p, i) => {
    const pos = positions[i] ?? { x: 50, y: 50 }
    const fx = orientation === 'landscape' ? pos.y : pos.x
    const fy = orientation === 'landscape' ? pos.x : pos.y
    return { id: p.id, label: p.name, jerseyNumber: p.jerseyNumber, x: fx, y: fy, side, playerId: p.playerId }
  })
}

// Rotate all players when switching orientation
export function rotatePositions(players: BoardPlayer[], from: FieldOrientation, to: FieldOrientation): BoardPlayer[] {
  if (from === to) return players
  // Portrait→Landscape: (x,y) → (y, x)
  // Landscape→Portrait: (x,y) → (y, x) — same transform, it's a 90° rotation
  return players.map(p => ({ ...p, x: p.y, y: p.x }))
}

const TOOLS: { key: DrawTool; label: string; icon: string; desc: string }[] = [
  { key: 'move', label: 'Mover', icon: '✋', desc: 'Arrastar jogadores' },
  { key: 'swap', label: 'Trocar', icon: '🔄', desc: 'Trocar posição de 2 jogadores' },
  { key: 'eject', label: 'Expulsar', icon: '🟥', desc: 'Expulsar jogador do campo' },
  { key: 'arrow', label: 'Seta', icon: '➡️', desc: 'Movimento tático' },
  { key: 'pass', label: 'Passe', icon: '⚡', desc: 'Linha de passe' },
  { key: 'run', label: 'Corrida', icon: '🏃', desc: 'Corrida sem bola' },
  { key: 'zone', label: 'Zona', icon: '🟦', desc: 'Marcação' },
  { key: 'free', label: 'Livre', icon: '✏️', desc: 'Desenho livre' },
]

const DRAW_COLORS = ['#ffffff', '#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a855f7']

export default function TacticalBoard({
  homePlayers,
  awayPlayers,
  homeColor,
  awayColor,
  homeTeamName,
  awayTeamName,
  onPlayerMove,
  onPlayersSwap,
  onPlayerEject,
  onDrawingsChange,
  initialDrawings,
  readOnly = false,
  showAway = true,
  orientation = 'portrait',
  onOrientationChange,
}: TacticalBoardProps) {
  const isLandscape = orientation === 'landscape'
  const fieldRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [tool, setTool] = useState<DrawTool>('move')
  const [drawColor, setDrawColor] = useState('#ffffff')
  const [drawings, setDrawings] = useState<DrawElement[]>(initialDrawings ?? [])
  const [drawing, setDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [currentFree, setCurrentFree] = useState<{ x: number; y: number }[]>([])
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null)
  const [swapFirst, setSwapFirst] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryAction[]>([])

  const visiblePlayers = showAway ? [...homePlayers, ...awayPlayers] : homePlayers

  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    for (const p of [...homePlayers, ...awayPlayers]) {
      pos[p.id] = { x: p.x, y: p.y }
    }
    setPositions(pos)
  }, [homePlayers, awayPlayers])

  useEffect(() => {
    if (initialDrawings) setDrawings(initialDrawings)
  }, [initialDrawings])

  const getCoords = useCallback((clientX: number, clientY: number) => {
    if (!fieldRef.current) return { x: 50, y: 50 }
    const rect = fieldRef.current.getBoundingClientRect()
    return {
      x: Math.max(3, Math.min(97, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(3, Math.min(97, ((clientY - rect.top) / rect.height) * 100)),
    }
  }, [])

  const pushHistory = (action: HistoryAction) => {
    setHistory(prev => [...prev, action])
  }

  const undo = useCallback(() => {
    if (history.length === 0) return
    const last = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))

    if (last.type === 'move') {
      setPositions(prev => ({ ...prev, [last.playerId]: { x: last.prevX, y: last.prevY } }))
      onPlayerMove?.(last.playerId, last.prevX, last.prevY)
    } else if (last.type === 'swap') {
      // Swap back
      const pos1 = positions[last.id1]
      const pos2 = positions[last.id2]
      if (pos1 && pos2) {
        setPositions(prev => ({ ...prev, [last.id1]: pos2, [last.id2]: pos1 }))
        onPlayersSwap?.(last.id1, last.id2)
      }
    } else if (last.type === 'eject') {
      // Re-add ejected player — notify parent to re-add
      // Can't fully undo from here since parent manages the list, but we signal it
      onPlayerEject?.(`undo:${last.player.id}`)
    } else if (last.type === 'drawing') {
      setDrawings(prev => { const n = prev.slice(0, -1); onDrawingsChange?.(n); return n })
    }
  }, [history, positions, onPlayerMove, onPlayersSwap, onPlayerEject, onDrawingsChange])

  const handleFieldPointerDown = useCallback((e: React.PointerEvent) => {
    if (readOnly) return
    const coords = getCoords(e.clientX, e.clientY)
    if (tool === 'move' || tool === 'swap') return
    if (tool === 'arrow' || tool === 'pass' || tool === 'run' || tool === 'zone') {
      setDrawStart(coords); setPreviewEnd(coords); setDrawing(true)
    } else if (tool === 'free') {
      setCurrentFree([coords]); setDrawing(true)
    }
  }, [tool, readOnly, getCoords])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const coords = getCoords(e.clientX, e.clientY)
    if (tool === 'move' && dragging) {
      setPositions(prev => ({ ...prev, [dragging]: coords }))
    } else if (drawing) {
      if (tool === 'free') setCurrentFree(prev => [...prev, coords])
      else setPreviewEnd(coords)
    }
  }, [tool, dragging, drawing, getCoords])

  const handlePointerUp = useCallback(() => {
    if (tool === 'move' && dragging) {
      const pos = positions[dragging]
      if (pos && dragStart) {
        pushHistory({ type: 'move', playerId: dragging, prevX: dragStart.x, prevY: dragStart.y })
        onPlayerMove?.(dragging, pos.x, pos.y)
      }
      setDragging(null); setDragStart(null)
    } else if (drawing) {
      if ((tool === 'arrow' || tool === 'pass' || tool === 'run') && drawStart && previewEnd) {
        if (Math.hypot(previewEnd.x - drawStart.x, previewEnd.y - drawStart.y) > 2) {
          const el: ArrowElement = { type: tool, x1: drawStart.x, y1: drawStart.y, x2: previewEnd.x, y2: previewEnd.y, color: drawColor }
          setDrawings(prev => { const n = [...prev, el]; onDrawingsChange?.(n); return n })
          pushHistory({ type: 'drawing' })
        }
      } else if (tool === 'zone' && drawStart && previewEnd) {
        const w = Math.abs(previewEnd.x - drawStart.x), h = Math.abs(previewEnd.y - drawStart.y)
        if (w > 2 && h > 2) {
          const el: ZoneElement = { type: 'zone', x: Math.min(drawStart.x, previewEnd.x), y: Math.min(drawStart.y, previewEnd.y), w, h, color: drawColor }
          setDrawings(prev => { const n = [...prev, el]; onDrawingsChange?.(n); return n })
          pushHistory({ type: 'drawing' })
        }
      } else if (tool === 'free' && currentFree.length > 2) {
        const el: FreeDrawElement = { type: 'free', points: currentFree, color: drawColor }
        setDrawings(prev => { const n = [...prev, el]; onDrawingsChange?.(n); return n })
        pushHistory({ type: 'drawing' })
      }
      setDrawing(false); setDrawStart(null); setPreviewEnd(null); setCurrentFree([])
    }
  }, [tool, dragging, dragStart, drawing, drawStart, previewEnd, currentFree, drawColor, positions, onPlayerMove, onDrawingsChange])

  const handlePlayerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly) return
    e.stopPropagation()
    if (tool === 'move') {
      const pos = positions[id]
      setDragStart(pos ? { ...pos } : null)
      setDragging(id)
    } else if (tool === 'swap') {
      if (!swapFirst) {
        setSwapFirst(id)
      } else if (swapFirst !== id) {
        // Swap positions
        const pos1 = positions[swapFirst]
        const pos2 = positions[id]
        if (pos1 && pos2) {
          setPositions(prev => ({ ...prev, [swapFirst!]: pos2, [id]: pos1 }))
          pushHistory({ type: 'swap', id1: swapFirst, id2: id })
          onPlayersSwap?.(swapFirst, id)
        }
        setSwapFirst(null)
      }
    } else if (tool === 'eject') {
      const player = visiblePlayers.find(p => p.id === id)
      if (player) {
        pushHistory({ type: 'eject', player })
        onPlayerEject?.(id)
      }
    }
  }, [tool, readOnly, swapFirst, positions, visiblePlayers, onPlayersSwap, onPlayerEject])

  const clearAll = () => { setDrawings([]); onDrawingsChange?.([]); setHistory([]) }

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const renderArrowHead = (x1: number, y1: number, x2: number, y2: number, color: string, key: string) => {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const hl = 1.5
    return <polygon key={key} points={`${x2},${y2} ${x2 - hl * Math.cos(angle - 0.5)},${y2 - hl * Math.sin(angle - 0.5)} ${x2 - hl * Math.cos(angle + 0.5)},${y2 - hl * Math.sin(angle + 0.5)}`} fill={color} />
  }

  return (
    <div ref={containerRef} className={`space-y-2 ${isFullscreen ? 'bg-navy-950 p-4 flex flex-col justify-center min-h-screen' : ''}`}>
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: homeColor }} />
          <span className="text-slate-300">{homeTeamName}</span>
        </div>
        {showAway && (
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: awayColor }} />
            <span className="text-slate-300">{awayTeamName}</span>
          </div>
        )}
      </div>

      {/* Orientation + Fullscreen toggles */}
      {!readOnly && (
        <div className="flex justify-center gap-2">
          {onOrientationChange && (
            <button
              onClick={() => onOrientationChange(isLandscape ? 'portrait' : 'landscape')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-800 text-slate-400 hover:bg-navy-700 active:scale-95 transition-all"
            >
              {isLandscape ? '📱 Retrato' : '🖥️ Paisagem'}
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-800 text-slate-400 hover:bg-navy-700 active:scale-95 transition-all"
          >
            {isFullscreen ? '↙️ Sair tela cheia' : '⛶ Tela cheia'}
          </button>
        </div>
      )}

      {/* Toolbar — large touch targets */}
      {!readOnly && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            {TOOLS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTool(t.key); setSwapFirst(null) }}
                title={t.desc}
                className={`flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  tool === t.key ? 'bg-pitch-600 text-white ring-2 ring-pitch-400 scale-105' : 'bg-navy-800 text-slate-400 hover:bg-navy-700 active:scale-95'
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${drawColor === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
            <div className="w-px h-6 bg-navy-600 mx-1" />
            <button onClick={undo} disabled={history.length === 0}
              className="px-3 py-2 rounded-xl text-sm bg-navy-800 text-slate-400 hover:bg-navy-700 disabled:opacity-30 active:scale-95 font-semibold">
              ↩️ Desfazer
            </button>
            <button onClick={clearAll}
              className="px-3 py-2 rounded-xl text-sm bg-navy-800 text-red-400 hover:bg-red-900/30 active:scale-95 font-semibold">
              🗑️ Limpar
            </button>
          </div>
        </div>
      )}

      {/* Swap indicator */}
      {tool === 'swap' && swapFirst && (
        <div className="text-center text-xs text-gold-400 animate-pulse font-semibold">
          Selecione o segundo jogador para trocar posição
        </div>
      )}

      {/* Field */}
      <div
        ref={fieldRef}
        className="relative w-full select-none touch-none overflow-hidden rounded-xl border-2 border-white/20"
        style={{
          aspectRatio: isLandscape ? '42/25' : '25/42',
          background: isLandscape
            ? 'linear-gradient(90deg, #2d8a4e 0%, #1e7a3e 25%, #2d8a4e 50%, #1e7a3e 75%, #2d8a4e 100%)'
            : 'linear-gradient(180deg, #2d8a4e 0%, #1e7a3e 25%, #2d8a4e 50%, #1e7a3e 75%, #2d8a4e 100%)',
          maxWidth: isFullscreen ? '90vh' : isLandscape ? '600px' : '400px',
          margin: '0 auto',
        }}
        onPointerDown={handleFieldPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Field markings */}
        {isLandscape ? (
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 250" fill="none">
            <rect x="5" y="5" width="410" height="240" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
            <line x1="210" y1="5" x2="210" y2="245" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <circle cx="210" cy="125" r="40" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <circle cx="210" cy="125" r="2" fill="rgba(255,255,255,0.35)" />
            <rect x="5" y="55" width="60" height="140" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="5" y="85" width="25" height="80" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="0" y="100" width="6" height="50" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="rgba(255,255,255,0.08)" />
            <rect x="355" y="55" width="60" height="140" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="390" y="85" width="25" height="80" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="414" y="100" width="6" height="50" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="rgba(255,255,255,0.08)" />
          </svg>
        ) : (
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 250 420" fill="none">
            <rect x="5" y="5" width="240" height="410" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
            <line x1="5" y1="210" x2="245" y2="210" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <circle cx="125" cy="210" r="40" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <circle cx="125" cy="210" r="2" fill="rgba(255,255,255,0.35)" />
            {/* Top goal area (away) */}
            <rect x="55" y="5" width="140" height="60" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="85" y="5" width="80" height="25" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="100" y="0" width="50" height="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="rgba(255,255,255,0.08)" />
            {/* Bottom goal area (home) */}
            <rect x="55" y="355" width="140" height="60" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="85" y="390" width="80" height="25" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
            <rect x="100" y="414" width="50" height="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="rgba(255,255,255,0.08)" />
          </svg>
        )}

        {/* Drawings overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {drawings.map((d, i) => {
            if (d.type === 'arrow' || d.type === 'pass' || d.type === 'run') {
              const da = d.type === 'pass' ? '1.5,1' : d.type === 'run' ? '0.8,0.8' : undefined
              return (<g key={i}><line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.color} strokeWidth="0.6" strokeDasharray={da} strokeOpacity={0.85} />{renderArrowHead(d.x1, d.y1, d.x2, d.y2, d.color, `ah${i}`)}</g>)
            }
            if (d.type === 'zone') return <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill={d.color} fillOpacity={0.15} stroke={d.color} strokeWidth="0.4" strokeDasharray="1,0.5" rx="0.5" />
            if (d.type === 'free' && d.points.length > 1) return <path key={i} d={d.points.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')} stroke={d.color} strokeWidth="0.5" fill="none" strokeLinecap="round" strokeOpacity={0.85} />
            return null
          })}
          {drawing && drawStart && previewEnd && (tool === 'arrow' || tool === 'pass' || tool === 'run') && (
            <g><line x1={drawStart.x} y1={drawStart.y} x2={previewEnd.x} y2={previewEnd.y} stroke={drawColor} strokeWidth="0.6" strokeOpacity={0.4} strokeDasharray={tool === 'pass' ? '1.5,1' : tool === 'run' ? '0.8,0.8' : undefined} />{renderArrowHead(drawStart.x, drawStart.y, previewEnd.x, previewEnd.y, drawColor, 'pah')}</g>
          )}
          {drawing && drawStart && previewEnd && tool === 'zone' && (
            <rect x={Math.min(drawStart.x, previewEnd.x)} y={Math.min(drawStart.y, previewEnd.y)} width={Math.abs(previewEnd.x - drawStart.x)} height={Math.abs(previewEnd.y - drawStart.y)} fill={drawColor} fillOpacity={0.1} stroke={drawColor} strokeWidth="0.4" strokeDasharray="1,0.5" />
          )}
          {drawing && currentFree.length > 1 && tool === 'free' && (
            <path d={currentFree.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')} stroke={drawColor} strokeWidth="0.5" fill="none" strokeLinecap="round" strokeOpacity={0.4} />
          )}
        </svg>

        {/* Players */}
        {visiblePlayers.map(player => {
          const pos = positions[player.id] ?? { x: player.x, y: player.y }
          const color = player.side === 'home' ? homeColor : awayColor
          const isDragged = dragging === player.id
          const isSwapSelected = swapFirst === player.id

          return (
            <div
              key={player.id}
              className={`absolute flex flex-col items-center pointer-events-auto ${isDragged ? 'z-30' : 'z-10'} ${
                !readOnly && (tool === 'move' || tool === 'swap') ? 'cursor-pointer' : ''
              }`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: isDragged ? 'none' : 'left 0.15s, top 0.15s',
              }}
              onPointerDown={(e) => handlePlayerDown(e, player.id)}
            >
              <div
                className={`flex items-center justify-center rounded-full text-white font-extrabold shadow-lg border-2 ${
                  isSwapSelected ? 'border-gold-400 ring-2 ring-gold-400 scale-125' : isDragged ? 'border-white scale-125' : 'border-white/40'
                }`}
                style={{
                  backgroundColor: color,
                  width: '32px',
                  height: '32px',
                  fontSize: '13px',
                  transition: isDragged ? 'none' : 'transform 0.15s',
                }}
              >
                {player.jerseyNumber ?? '?'}
              </div>
              <span className="text-[8px] text-white font-semibold mt-0.5 whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] max-w-[55px] truncate text-center">
                {player.label}
              </span>
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <p className="text-center text-[10px] text-slate-500">
          {tool === 'move' && 'Arraste jogadores para reposicionar'}
          {tool === 'swap' && (swapFirst ? 'Toque no segundo jogador para trocar' : 'Toque em um jogador para iniciar a troca')}
          {tool === 'eject' && 'Toque no jogador para expulsar do campo'}
          {tool === 'arrow' && 'Arraste para criar seta de movimento'}
          {tool === 'pass' && 'Arraste para traçar linha de passe'}
          {tool === 'run' && 'Arraste para traçar corrida sem bola'}
          {tool === 'zone' && 'Arraste para marcar zona de marcação'}
          {tool === 'free' && 'Desenhe livremente sobre o campo'}
        </p>
      )}
    </div>
  )
}
