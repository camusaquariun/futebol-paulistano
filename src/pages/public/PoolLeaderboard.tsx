import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useActiveChampionship,
  usePoolMatchBets,
  usePoolSeasonBets,
} from '@/hooks/useSupabase'
import { buildLeaderboard, POINT_TIER_LABELS, TIEBREAKER_ORDER } from '@/lib/pool-points'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Trophy, Medal, Crown } from 'lucide-react'

export default function PoolLeaderboard() {
  const { user } = useAuth()
  const { data: championship } = useActiveChampionship()
  const { data: matchBets } = usePoolMatchBets(championship?.id)
  const { data: seasonBets } = usePoolSeasonBets(championship?.id)

  const leaderboard = useMemo(() => {
    return buildLeaderboard(matchBets ?? [], seasonBets ?? [])
  }, [matchBets, seasonBets])

  const myRank = leaderboard.findIndex(e => e.userId === user?.id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/bolao"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="h-6 w-6 text-gold-400" />
            Classificação do Bolão
          </h1>
          {championship && (
            <p className="text-sm text-slate-400">{championship.name}</p>
          )}
        </div>
      </div>

      {/* My position card */}
      {user && myRank >= 0 && (
        <Card className="bg-gradient-to-r from-pitch-600/10 to-navy-800 border-pitch-600/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-pitch-600/20 flex items-center justify-center">
              <span className="text-lg font-bold text-pitch-400">#{myRank + 1}</span>
            </div>
            <div>
              <p className="text-xs text-pitch-400 uppercase tracking-wider font-semibold">
                Sua posição
              </p>
              <p className="text-lg font-bold text-white">
                {leaderboard[myRank].totalPoints} pontos
              </p>
              <p className="text-[10px] text-slate-400">
                {leaderboard[myRank].totalBets} apostas computadas
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard table */}
      <Card className="bg-navy-900 border-navy-700">
        <CardContent className="p-0">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              Nenhuma aposta computada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium text-xs">#</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium text-xs">Participante</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs">Pts</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden sm:table-cell" title="Placar Exato (15)">
                      PE
                    </th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden sm:table-cell" title="Venc+Gols Venc (10)">
                      VG
                    </th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Venc+Gols Perd (8)">
                      VP
                    </th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Venc+Saldo (6)">
                      VS
                    </th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden md:table-cell" title="Apenas Venc (5)">
                      AV
                    </th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium text-xs hidden lg:table-cell">Apostas</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => {
                    const isMe = entry.userId === user?.id
                    const rank = idx + 1
                    return (
                      <tr
                        key={entry.userId}
                        className={`border-b border-navy-800/50 ${
                          isMe ? 'bg-pitch-600/5' : ''
                        } ${rank <= 3 ? 'bg-amber-500/[0.02]' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {rank === 1 && <Crown className="h-4 w-4 text-gold-400" />}
                            {rank === 2 && <Medal className="h-4 w-4 text-slate-300" />}
                            {rank === 3 && <Medal className="h-4 w-4 text-amber-700" />}
                            <span className={`font-bold ${
                              rank === 1 ? 'text-gold-400' : rank <= 3 ? 'text-amber-400' : 'text-slate-500'
                            }`}>
                              {rank}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-medium truncate max-w-[200px] block ${isMe ? 'text-pitch-400' : 'text-white'}`}>
                            {entry.email.split('@')[0]}
                          </span>
                          {isMe && (
                            <span className="text-[10px] text-pitch-400">Você</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-bold text-base ${
                            rank === 1 ? 'text-gold-400' : rank <= 3 ? 'text-amber-400' : 'text-white'
                          }`}>
                            {entry.totalPoints}
                          </span>
                          {entry.seasonPoints > 0 && (
                            <div className="text-[10px] text-slate-500">
                              +{entry.seasonPoints} extras
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center hidden sm:table-cell text-slate-300">{entry.tierCounts[15] || '-'}</td>
                        <td className="py-3 px-4 text-center hidden sm:table-cell text-slate-300">{entry.tierCounts[10] || '-'}</td>
                        <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[8] || '-'}</td>
                        <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[6] || '-'}</td>
                        <td className="py-3 px-4 text-center hidden md:table-cell text-slate-300">{entry.tierCounts[5] || '-'}</td>
                        <td className="py-3 px-4 text-center hidden lg:table-cell text-slate-400">{entry.totalBets}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tiebreaker explanation */}
      <Card className="bg-navy-900/50 border-navy-700/50">
        <CardContent className="p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Critérios de Desempate</h3>
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>Total de pontos</li>
            {TIEBREAKER_ORDER.map(tier => (
              <li key={tier}>Mais acertos de "{POINT_TIER_LABELS[tier]}" ({tier} pts)</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
