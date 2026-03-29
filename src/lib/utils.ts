import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null): string {
  if (!date) return 'A definir'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    grupos: 'Fase de Grupos',
    semifinal: 'Semifinal',
    terceiro_lugar: 'Terceiro Lugar',
    final: 'Final',
  }
  return labels[phase] || phase
}

export function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    three_yellows: '3 Cartões Amarelos',
    red_card: 'Cartão Vermelho',
  }
  return labels[reason] || reason
}

// Converts hex color to HSL hue (0-360)
function hexToHue(hex: string): number {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return Math.round(h * 360)
}

// Hue distance (circular)
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

// Ordered list of visually distinct fallback colors
const FALLBACK_COLORS = [
  '#1d4ed8', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#ffffff', // white
]

/**
 * Returns [homeColor, awayColor] ensuring they are visually distinct (hue ≥ 60° apart).
 * If too similar, picks the most contrasting fallback for the away team.
 */
export function resolveTeamColors(homeHex: string | null | undefined, awayHex: string | null | undefined): [string, string] {
  const home = homeHex ?? '#1d4ed8'
  const away = awayHex ?? '#dc2626'
  const homeHue = hexToHue(home)
  const awayHue = hexToHue(away)
  if (hueDist(homeHue, awayHue) >= 60) return [home, away]
  // Pick fallback for away that maximises distance from home
  const best = FALLBACK_COLORS
    .filter(c => c !== home)
    .sort((a, b) => hueDist(hexToHue(b), homeHue) - hueDist(hexToHue(a), homeHue))[0]
  return [home, best]
}
