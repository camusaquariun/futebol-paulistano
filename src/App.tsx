import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/components/PublicLayout'
import { AdminLayout } from '@/components/AdminLayout'
import Home from '@/pages/public/Home'
import Standings from '@/pages/public/Standings'
import Fixtures from '@/pages/public/Fixtures'
import Scorers from '@/pages/public/Scorers'
import Suspensions from '@/pages/public/Suspensions'
import Login from '@/pages/Login'
import Dashboard from '@/pages/admin/Dashboard'
import ChampionshipsAdmin from '@/pages/admin/Championships'
import TeamsAdmin from '@/pages/admin/Teams'
import PlayersAdmin from '@/pages/admin/Players'
import MatchesAdmin from '@/pages/admin/Matches'
import MatchDetail from '@/pages/admin/MatchDetail'
import SuspensionsAdmin from '@/pages/admin/SuspensionsAdmin'
import ImportCSV from '@/pages/admin/ImportCSV'
import TeamDetail from '@/pages/admin/TeamDetail'
import StandingsAdmin from '@/pages/admin/StandingsAdmin'
import TacticalBoardAdmin from '@/pages/admin/TacticalBoardAdmin'
import FriendlyAdmin from '@/pages/admin/FriendlyAdmin'
import RefereesAdmin from '@/pages/admin/Referees'
import UsersAdmin from '@/pages/admin/UsersAdmin'
import PoolAdmin from '@/pages/admin/PoolAdmin'
import TeamProfile from '@/pages/public/TeamProfile'
import MatchLive from '@/pages/public/MatchLive'
import MyTeam from '@/pages/public/MyTeam'
import PostGame from '@/pages/public/PostGame'
import TacticalBoardPage from '@/pages/public/TacticalBoardPage'
import PreGame from '@/pages/public/PreGame'
import PreGameRoom from '@/pages/public/PreGameRoom'
import Friendlies from '@/pages/public/Friendlies'
import Pool from '@/pages/public/Pool'
import PoolLeaderboard from '@/pages/public/PoolLeaderboard'
import RefereeDashboard from '@/pages/public/RefereeDashboard'
import RefereeLive from '@/pages/public/RefereeLive'
import PlayerProfile from '@/pages/admin/PlayerProfile'
import MyProfile from '@/pages/public/MyProfile'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/classificacao" element={<Standings />} />
        <Route path="/jogos" element={<Fixtures />} />
        <Route path="/artilharia" element={<Scorers />} />
        <Route path="/suspensoes" element={<Suspensions />} />
        <Route path="/times/:teamId" element={<TeamProfile />} />
        <Route path="/times/:teamId/preparacao/:matchId" element={<PreGame />} />
        <Route path="/partidas/:matchId/ao-vivo" element={<MatchLive />} />
        <Route path="/partidas/:matchId/ao-vivo/:slug" element={<MatchLive />} />
        <Route path="/amistosos" element={<Friendlies />} />
        <Route path="/bolao" element={<Pool />} />
        <Route path="/bolao/classificacao" element={<PoolLeaderboard />} />
        <Route path="/arbitragem" element={<RefereeDashboard />} />
        <Route path="/arbitragem/:matchId" element={<RefereeLive />} />
        <Route path="/meu-time" element={<MyTeam />} />
        <Route path="/meu-time/jogo/:matchId" element={<PostGame />} />
        <Route path="/meu-time/preparo/:matchId" element={<PreGameRoom />} />
        <Route path="/meu-time/prancheta" element={<TacticalBoardPage />} />
        <Route path="/meu-perfil" element={<MyProfile />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="campeonatos" element={<ChampionshipsAdmin />} />
        <Route path="classificacao" element={<StandingsAdmin />} />
        <Route path="times" element={<TeamsAdmin />} />
        <Route path="times/:teamId" element={<TeamDetail />} />
        <Route path="jogadores" element={<PlayersAdmin />} />
        <Route path="jogadores/:playerId" element={<PlayerProfile />} />
        <Route path="partidas" element={<MatchesAdmin />} />
        <Route path="partidas/:matchId" element={<MatchDetail />} />
        <Route path="suspensoes" element={<SuspensionsAdmin />} />
        <Route path="importar" element={<ImportCSV />} />
        <Route path="prancheta" element={<TacticalBoardAdmin />} />
        <Route path="amistosos" element={<FriendlyAdmin />} />
        <Route path="arbitragem" element={<RefereesAdmin />} />
        <Route path="usuarios" element={<UsersAdmin />} />
        <Route path="bolao" element={<PoolAdmin />} />
      </Route>
    </Routes>
  )
}
