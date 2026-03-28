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
