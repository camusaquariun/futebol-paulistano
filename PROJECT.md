# Futebol Paulistano — Documentação do Projeto

Sistema de gerenciamento de campeonato amador de futebol com **módulo de bolão** acoplado. Pensado para a Copa do Mundo Paulistano 2026 (3 categorias: Livre, Veterano, Master).

Repositório: https://github.com/camusaquariun/futebol-paulistano
Deploy: Vercel (auto-deploy do branch `master`).
Backend: Supabase (PostgreSQL + Auth + Edge Functions + Realtime).

---

## 1. Stack

- **Frontend**: Vite + React 19 + TypeScript + React Router 7 + TanStack Query + Tailwind CSS 4 + Radix UI.
- **Backend**: Supabase (Postgres + RLS + Auth GoTrue + Edge Functions em Deno + Realtime).
- **CI/CD**: Vercel (build `npm run build`, `tsc -b && vite build`).
- **Scripts auxiliares** (não vão pro Git, em `migration/`): Node + `xlsx` para importação de planilhas e Management API do Supabase para DDL/migração.

### Variáveis de ambiente

`.env` (não commitado):
```
VITE_SUPABASE_URL=https://zgpqgeaptxzchwzmsnid.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
```

Vercel: mesmos dois valores configurados em Production/Preview/Development.

### Porta de desenvolvimento

`npm run dev` sobe Vite em **localhost:8050** (configurado em `package.json` e `vite.config.ts`).

---

## 2. Modelo de dados (esquema `public`)

Principais tabelas:

| Tabela | Função |
|---|---|
| `championships` | Campeonatos (Copa do Mundo Paulistano 2026, season_year=2026) |
| `categories` | Livre, Veterano, Master |
| `championship_categories` | Liga campeonato a categorias com `turns`, `qualify_count`, `has_third_place` |
| `teams` | Times (18 nesta edição), com `primary_color`, `secondary_color`, `shield_url` |
| `team_categories` | Liga time a uma categoria |
| `players` | Jogadores. `user_id` opcional → vínculo com `auth.users` |
| `player_teams` | Inscrição de jogador num time/categoria. `positions text[]`, `is_captain`, `jersey_number`, `status` |
| `matches` | Partidas. `phase` ∈ (`grupos`,`semifinal`,`terceiro_lugar`,`final`), `round int`, `status` ∈ (`scheduled`,`finished`), `home_score`/`away_score`, `motm_player_id`, `sponsor text` |
| `match_events` | Gols, cartões (`event_type` = `goal`/`yellow_card`/`red_card`) |
| `match_attendance` | Presença confirmada por (player, match, team) |
| `match_messages` | Chat por partida |
| `match_referees` / `referees` | Arbitragem |
| `suspensions` | Suspensões por 3 amarelos / vermelho, com `served` |
| `food_donations` | Cestas básicas exigidas por cartão (alimento solidário) |
| `friendly_challenges` / `friendly_blocked_dates` | Amistosos (módulo **desativado** via feature flag) |
| `tactical_boards` / `tactical_board_players` | Prancheta tática persistida por cenário (Ataque/Defesa/Escanteio/Outro) |
| `pregame_scenarios` / `pregame_scenario_players` / `pregame_comments` | Pré-jogo |
| `post_game_votes` / `post_game_comments` / `motm_votes` | Pós-jogo + Melhor em Campo |
| `pool_match_bets` | Apostas de placar por partida |
| `pool_season_bets` | Apostas de temporada (Cinema + Extras) |
| `pool_participants` | **Whitelist** de quem pode apostar |
| `pool_audit_log` | Auditoria de toda mudança nas apostas |
| `user_roles` | `role='admin'` por usuário (1 papel por usuário, onConflict por user_id) |

### auth (schema)

- `auth.users` e `auth.identities` — gerenciado pelo GoTrue.
- `user_metadata` guarda `display_name` e `phone` (preenchidos no cadastro).
- **`mailer_autoconfirm = true`** → email de confirmação desativado (rate limit do SMTP padrão do Supabase). Para reativar com volume real, configurar Resend.

---

## 3. Autenticação & Permissões

- Login/cadastro em `/login` via Supabase Auth (email+senha). Cadastro pede **Nome, Email, Celular, Senha**.
- O hook `useAuth()` expõe `user`, `isAdmin`, `signIn`, `signOut`.
- Admin = linha em `user_roles` com `role='admin'`. Botão de toggle em `/admin/usuarios`.
- Acesso ao **bolão** controlado pela tabela `pool_participants` (admin libera via botão 🎫 na admin de usuários). Usuários não-membros veem leaderboard/feed mas não conseguem apostar.

### RLS principais

- `pool_audit_log`: SELECT só para admin.
- `pool_participants`: SELECT público; INSERT/UPDATE/DELETE só para admin.
- `pool_match_bets` / `pool_season_bets`: leitura pública; usuário só edita as próprias linhas (`auth.uid() = user_id`).
- `player_teams`: `Auth write` (permissivo, gating é feito na UI: capitão edita o time inteiro, demais só a própria posição).

---

## 4. Módulo Bolão

### Tipos de aposta (`pool_season_bets.bet_type`)

| Tipo | Cinema | Pts | Extra | Pts |
|---|---|---|---|---|
| Campeão | `champion_cinema` | 50 | `champion` | 25 |
| 2º Colocado | `runner_up_cinema` | 20 | `runner_up` | 10 |
| 3º Colocado (exceto Livre) | `third_place_cinema` | 10 | `third_place` | 5 |
| Eliminado 1ª Fase (2× Vet, 1× nas outras) | `relegated_cinema` / `relegated_cinema_2` | 20 cada | — | — |
| Artilheiro | `top_scorer_cinema` | 15 | — | — |

Regra: **Cinema = 2× Extras** quando ambos existem.

### Prazos (deadlines)

- **Cinema**: até **18/05/2026 19:00 BRT** (1h antes do 1º jogo). Editável até esse prazo. Depois disso, bloqueado.
  - Deadline em UTC no trigger: `2026-05-18 22:00:00+00`.
- **Extras**: até **30/08/2026 23:59 BRT**.
  - Deadline em UTC: `2026-08-31 03:00:00+00`.

### Pontuação por placar (palpite de partida)

Função SQL `public.calculate_pool_points(match_id)` é chamada quando a partida é finalizada. Replica a lógica de `src/lib/pool-points.ts`:

| Caso | Pts |
|---|---|
| Placar exato (qualquer resultado, incl. 1×1) | **15** |
| Acertou vencedor + gols do vencedor (ex: 4×2 → 4×0) | 10 |
| Acertou vencedor + gols do perdedor (ex: 4×2 → 3×2) | **8** |
| Acertou empate com placar diferente (ex: 1×1 → 2×2) | **8** |
| Acertou vencedor + saldo (ex: 4×2 → 3×1) | 6 |
| Apenas vencedor (ex: 4×2 → 1×0) | 5 |
| Gols de 1 time apenas (ex: 4×2 → 0×2 ou 1×1 → 3×1) | 2 |
| Nada | 0 |

Tiebreaker do leaderboard: pontos → 15s → 10s → 8s → 6s → 5s → 2s.

Palpite de partida: editável até **1h antes do jogo**. Trigger `enforce_pool_match_bet_deadline` rejeita INSERT/UPDATE depois disso. Também exige `user_id ∈ pool_participants`.

### Defesa em camadas

| Regra | UI | DB |
|---|---|---|
| Só liberado pode apostar | botão "Apostar" some, banner âmbar | trigger rejeita |
| Editar match bet até T-1h | botão "Editar" some | `enforce_pool_match_bet_deadline_trg` |
| Cinema editável até deadline | "Encerrada" badge após | `lock_cinema_bets` |
| Cinema imutável após deadline | botão some | `lock_cinema_bets` rejeita UPDATE/DELETE |
| Extras até 30/08 | botão some | `lock_cinema_bets` rejeita |

### Auditoria

`pool_audit_log` é populado por triggers AFTER INSERT/UPDATE/DELETE em ambas as tabelas. Captura:

- `user_id` (dono), `actor_id` (`auth.uid()` de quem fez), `user_email`
- `action` (INSERT/UPDATE/DELETE), `bet_kind` (match/season)
- `before_data` e `after_data` (jsonb das linhas)
- Flags: `after_kickoff` (depois do início do jogo), `after_deadline` (depois do T-1h)

Visível em `/admin/bolao/auditoria` (admin only).

---

## 5. Páginas

### Públicas

| Rota | Componente | Função |
|---|---|---|
| `/` | `Home` | Hero do campeonato, cards das categorias (deep-link para `/classificacao?cat=`), próximos jogos, botão grande de Login/Cadastro para visitantes |
| `/classificacao` | `Standings` | Tabela, tabs por categoria via querystring |
| `/jogos` | `Fixtures` | Calendário do campeonato |
| `/artilharia` | `Scorers` | Top artilheiros |
| `/suspensoes` | `Suspensions` | Suspensões ativas |
| `/amistosos` | `Friendlies` | **Bloqueada** via `FRIENDLIES_ENABLED = false` |
| `/bolao` | `Pool` | Apostas de partida + tab Cinema & Extras + leaderboard |
| `/bolao/classificacao` | `PoolLeaderboard` | Ranking do bolão |
| `/arbitragem` | `RefereeDashboard` | |
| `/partidas/:matchId/ao-vivo` | `MatchLive` | Resultado e eventos ao vivo |
| `/meu-time` | `MyTeam` | Elenco + partidas do meu time. Capitão edita posições de todos; cada usuário edita as próprias |
| `/meu-time/prancheta` | `TacticalBoardPage` | Prancheta tática |
| `/meu-time/jogo/:matchId` | `PostGame` | Votação MOTM + comentários |
| `/meu-time/preparo/:matchId` | `PreGameRoom` | Sala de preparação |
| `/times/:teamId` | `TeamProfile` | Perfil do time, posição na classificação, stats por jogador |
| `/times/:teamId/preparacao/:matchId` | `PreGame` | Preparação de partida |
| `/meu-perfil` | `MyProfile` | Edição básica do perfil |

### Admin (`/admin/*`, layout `AdminLayout` exige `isAdmin`)

| Rota | Componente | Função |
|---|---|---|
| `/admin` | `Dashboard` | Visão geral |
| `/admin/campeonatos` | `ChampionshipsAdmin` | Gerenciar campeonatos |
| `/admin/classificacao` | `StandingsAdmin` | Tabela admin |
| `/admin/times` | `TeamsAdmin` | Lista times |
| `/admin/times/:teamId` | `TeamDetail` | Editar time, elenco com posições/capitão/número |
| `/admin/jogadores` | `PlayersAdmin` | Lista jogadores, busca normaliza acentos |
| `/admin/jogadores/:playerId` | `PlayerProfile` | |
| `/admin/partidas` | `MatchesAdmin` | |
| `/admin/partidas/:matchId` | `MatchDetail` | |
| `/admin/suspensoes` | `SuspensionsAdmin` | |
| `/admin/prancheta` | `TacticalBoardAdmin` | |
| `/admin/amistosos` | `FriendlyAdmin` | |
| `/admin/arbitragem` | `RefereesAdmin` | |
| `/admin/usuarios` | `UsersAdmin` | CRUD de auth users + toggle admin/bolão, vincular a player. Filtros: papel, bolão, categoria, time, vínculo |
| `/admin/bolao` | `PoolAdmin` | 4 tabs: Classificação · Apostas por Partida · Todas as Apostas (feed em tempo real) · Participantes |
| `/admin/bolao/auditoria` | `PoolAuditLog` | Log de toda mudança no bolão; flags vermelhas/amber para ações suspeitas |

---

## 6. Edge Functions (Deno, em `supabase/functions/`)

### `link-player`

Slug: `link-player`. `verify_jwt: false`. Usa `SUPABASE_SERVICE_ROLE_KEY`. Actions:

- `list-users` → retorna `{ id, email, display_name, phone, created_at }[]`
- `link` → seta `players.user_id` por email match
- `unlink` → limpa `players.user_id`
- `create-user` → `auth.admin.createUser` com `email_confirm:true`, salva `display_name` e `phone` em `user_metadata`
- `update-user` → `auth.admin.updateUserById`, atualiza email/password/metadata
- `delete-user` → desliga players, remove `user_roles` e chama `auth.admin.deleteUser`

URL: `${VITE_SUPABASE_URL}/functions/v1/link-player`.

### `create-admin`

Slug: `create-admin`. Cria um admin via querystring (`?email=…&password=…`). Usado uma vez no setup.

---

## 7. Funções e triggers SQL relevantes

| Objeto | O que faz |
|---|---|
| `calculate_pool_points(match_id)` | Calcula pontos dos `pool_match_bets` quando o jogo termina |
| `audit_pool_match_bet()` + trigger | Loga toda mudança em `pool_match_bets` |
| `audit_pool_season_bet()` + trigger | Loga toda mudança em `pool_season_bets` |
| `enforce_pool_match_bet_deadline()` + trigger | Rejeita match bet se faltar < 1h ou usuário não estiver em `pool_participants` |
| `enforce_pool_season_participation()` + trigger | Rejeita season bet se usuário não estiver em `pool_participants` |
| `lock_cinema_bets()` + trigger | Faz cumprir as deadlines de Cinema (18/05 19:00 BRT) e Extras (30/08 23:59 BRT). Cinema: INSERT/UPDATE/DELETE bloqueados após deadline. Extras: idem após 30/08. |
| Publicação `supabase_realtime` | Inclui `pool_match_bets` e `pool_season_bets` para feed ao vivo no admin |

---

## 8. Convenções / coisas que merecem atenção

1. **Datas das partidas**: a planilha original (`Calendário Copa do Mundo PAULISTANO 2026 - 18-05.xlsx`) usava serials Excel de 2024 para a maioria das rodadas. Na importação, foi feito um shift de **+728 dias + 2 dias = +730 dias** sobre as datas de 2024 para alinhar com 2026 mantendo o mesmo dia-do-mês (não dia-da-semana). A primeira rodada (LIVRE em 18/05) já estava em 2026 e não foi alterada.

2. **Bandeiras dos times**: `teams.shield_url` aponta para `https://flagcdn.com/w160/<iso2>.png` (ex: `br`, `de`, `gb-eng`).

3. **Eliminado 1ª Fase**: na categoria **Veterano** há 2 slots de eliminado (`relegated_cinema` + `relegated_cinema_2`), nas outras só 1.

4. **3º Lugar**: removido da Livre (cinema e extras), pois não há disputa de 3º lugar nessa categoria.

5. **Capitão**: marcado em `player_teams.is_captain`. Aparece com coroa dourada na UI. A prancheta tática **não** dá cor diferente ao capitão — a TacticalBoard normaliza `side` pelo array em que o jogador está, então qualquer `team_side='away'` legado é ignorado.

6. **Bolão participation** (`pool_participants`): admins precisam adicionar manualmente cada usuário liberado a participar. Os 7 usuários originais que já tinham apostas foram auto-incluídos durante a migração.

7. **Auditoria**: triggers usam `SECURITY DEFINER` e capturam `auth.uid()` como `actor_id`. Se `actor_id ≠ user_id`, é destacado no admin como "editado por outro usuário".

8. **Friendlies (amistosos)**: o módulo existe no código mas está bloqueado via `FRIENDLIES_ENABLED = false` em `src/pages/public/Friendlies.tsx`. Trocar para `true` reabre tudo.

9. **Login/cadastro**: o telefone é **obrigatório** no cadastro novo. Confirmação de email está **desabilitada** (`mailer_autoconfirm`).

10. **Cores dos times**: `lib/utils.ts::resolveTeamColors` força contraste mínimo de 60° de matiz entre home/away. Se Holanda (sem `primary_color` definido) e o adversário também não tiver, cai pro fallback (azul vs vermelho).

---

## 9. Onde está cada coisa

- Lógica de bolão (cálculo, tiers, leaderboard): `src/lib/pool-points.ts`
- Componente do bolão público: `src/pages/public/Pool.tsx`
- Componente da prancheta: `src/components/TacticalBoard.tsx`
- Wizard de vinculação de player: `src/components/PlayerLinkWizard.tsx`
- Hooks centralizados de queries: `src/hooks/useSupabase.ts`
- Cliente Supabase: `src/lib/supabase.ts`
- Tipos: `src/types/database.ts`
- Rotas (App tree): `src/App.tsx`
- Layouts: `src/components/PublicLayout.tsx`, `src/components/AdminLayout.tsx`

---

## 10. Operação (cheatsheet)

- **Liberar um usuário para o bolão**: `/admin/usuarios` → clica no ícone 🎫 do card. Verde = liberado.
- **Tornar admin**: mesmo card, ícone de escudo.
- **Editar usuário (nome/email/telefone/senha)**: lápis no card → modal.
- **Vincular usuário a jogador**: botão "Vincular jogador" no card → busca + select.
- **Auditar apostas suspeitas**: `/admin/bolao/auditoria` → filtra por "Após deadline" ou "Após início do jogo".
- **Feed ao vivo de apostas**: `/admin/bolao` → tab "Todas as Apostas".
- **Subir nova partida**: `/admin/partidas` (depende do schema existente).
- **Rotacionar chave service_role do Supabase**: dashboard → Settings → API → "Reset". Idealmente fazer ao final do setup; até lá, manter o segredo apenas em scripts locais (`migration/`, gitignored).
- **Configurar Resend (recomendado para produção)**: criar conta em resend.com, gerar API key, configurar SMTP no Supabase (`smtp_host=smtp.resend.com`, `smtp_user=resend`, `smtp_pass=<api-key>`). Necessário para escalar reset-de-senha e email-de-confirmação quando reabrir.

---

## 11. Pendências conhecidas

- Configurar provedor de SMTP customizado (Resend) — sem isso, recuperação de senha pode esbarrar no rate limit do SMTP do Supabase.
- Rotacionar a service_role key e revogar o PAT do Supabase (usados durante a migração inicial).
- Os scripts em `migration/` estão gitignored — contêm seeds + dump da auth.users com password hashes. Mantidos só local.
- Friendlies está desativado por feature flag, não há UI de admin pra reativar (mudar no código).
- Não há reset client-side dos pontos do bolão quando uma partida é "desmarcada como finalizada".
