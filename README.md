# TRADEON — v2.0.0 (rebranding e redesign) — inclui todas as funcionalidades das Etapas 01 a 15

**TRADEON — Seu mercado financeiro em um só lugar.** Antes chamado INVISTAÍ. O redesign está descrito em `docs/REDESIGN_TRADEON.md`.


App Next.js 15 + TypeScript + Supabase (Auth, Postgres e RLS) com dados de mercado reais (CoinGecko, BCE via Frankfurter), notícias (NewsAPI) e gráfico do widget oficial do TradingView. Este ZIP contém o projeto completo e não depende de arquivos das entregas anteriores.

## Requisitos
Node.js ≥ 20 e npm. Para o banco e o login: um projeto Supabase. Para notícias: chave da NewsAPI. Para os testes e2e: Python 3 + `pip install playwright` + Chromium (`python -m playwright install chromium`).

## Instalação e execução
```bash
npm install
cp .env.example .env.local     # preencha o que tiver; tudo é opcional para abrir o app
npm run dev                    # http://localhost:3000
# produção:
npm run build && npm start
```
Sem variáveis, o app abre como visitante e cada bloco informa "provedor não configurado" (nenhum dado é inventado).

## Variáveis de ambiente
Todas listadas em `.env.example` e lidas **no servidor, em runtime**. Nunca faça commit de `.env.local`. A `service_role` do Supabase **não** é usada em lugar nenhum.

| Variável | Para quê | Sem ela |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | login, cadastro, perfil, favoritos, notificações | app só como visitante |
| `COINGECKO_API_KEY` (opcional), `COINGECKO_BASE_URL` | cripto (spot) | limites menores da API pública |
| `FOREX_BASE_URL` | câmbio (taxas diárias do BCE) | — (padrão público) |
| `NEWS_PROVIDER`, `NEWS_API_KEY`, `NEWS_API_BASE_URL` | notícias: RSS público sem chave (padrão) ou NewsAPI | — (RSS funciona sem chave) |
| `APP_TIMEZONE` | fuso dos horários exibidos | `America/Sao_Paulo` |
| `SUPPORT_EMAIL` | página Suporte e pedido de exclusão de conta | canal de suporte indisponível |
| `*_RATE_*`, `REFRESH_GLOBAL_PER_MIN` | ajustes de limites | valores padrão |

## Banco (Supabase)
1. Crie o projeto e defina `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
2. Aplique as migrações versionadas: `supabase db push` (pasta `supabase/migrations`, 8 arquivos, em ordem).
3. Configure o Auth (URL do site, redirecionamento `/auth/confirm`, SMTP) conforme `docs/ETAPA_08.md` e `docs/ETAPA_09.md`.

Tabelas: `profiles`, `favorites` (único por usuário+tipo+item), `user_preferences`, `notifications` — todas com **RLS** (cada usuário só acessa as próprias linhas), chaves estrangeiras para `auth.users` com exclusão em cascata e índices. O cliente não tem `TRUNCATE`, não cria/apaga notificações e só altera `read_at` delas; visitantes não têm acesso às tabelas.

## Testes
```bash
npm run typecheck
npm test                              # 160 unitários (vitest) — inclui as migrações num Postgres real (PGlite)
npm run build && npm run test:e2e     # 597 verificações e2e em 16 suítes (Playwright), com mocks dos provedores e do Supabase
```
Os e2e sobem `tests/mock-server.mjs` (provedores: respostas normais, limite e queda) e `tests/mock-supabase.mjs` (Auth + REST simulando RLS). Não acessam serviços reais.

## Páginas
| Rota | Acesso | Etapa |
|---|---|---|
| `/` Início | público | 01 |
| `/mercado`, `/mercado/[id]` | público | 02, 03 |
| `/noticias` | público | 04 |
| `/aprender`, `/vip` | público — "Em breve" | 05, 06 |
| `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` | público | 07, 08, 09 |
| `/perfil`, `/favoritos`, `/notificacoes` | **privado** (sessão validada no servidor) | 10, 11, 13 |
| Busca global (cabeçalho) | público | 12 |
| `/suporte` | público | 14 |

Detalhes de cada etapa: `docs/ETAPA_01.md` … `docs/ETAPA_15.md`. Diagnóstico inicial: `docs/DIAGNOSTICO.md`.

## Segurança (resumo)
Sessão em cookie HttpOnly (Supabase SSR); rotas privadas protegidas no middleware e de novo em cada página/API; validação com zod em todas as entradas; checagem de origem (CSRF) em todas as APIs que alteram estado; limites de requisições; erros sem detalhes internos; links externos só `http(s)`; cabeçalhos `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`; `npm audit` sem vulnerabilidades (PostCSS fixado em versão corrigida via `overrides`).

## Assinaturas FREE / PRO / MAX (ecossistema — Etapa 1)
- Planos: FREE R$ 0 (3 mensagens da TRADEON AI no total, por conta), PRO R$ 30/mês, MAX R$ 50/mês. Matriz de permissões em `lib/plans.ts`; o plano efetivo é calculado no servidor/banco (`public.current_plan`).
- Pagamento real pela Stripe (Checkout + Portal do cliente). O plano só muda pelo webhook `/api/billing/webhook` com assinatura HMAC válida e evento idempotente; voltar do Checkout não libera nada.
- Escrita de cobrança sem `service_role`: funções `billing_*` (SECURITY DEFINER) protegidas por `BILLING_DB_SECRET`, cujo SHA-256 fica em `billing_private.settings`:
  `insert into billing_private.settings (key,value) values ('secret_sha256', encode(sha256('<BILLING_DB_SECRET>'::bytea),'hex')) on conflict (key) do update set value = excluded.value;`
- Configuração na Stripe: criar os produtos PRO e MAX com preço mensal recorrente em BRL; criar o endpoint `https://<domínio>/api/billing/webhook` com os eventos `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`; ativar o Portal do cliente (troca de plano e cancelamento).

## Pendências / dependências externas
- **Validar com serviços reais:** projeto Supabase + SMTP (login, cadastro, e-mails de confirmação/recuperação), plano de produção da NewsAPI (o plano gratuito não permite uso em produção), símbolos no TradingView real, respostas reais da CoinGecko.
- **Configurar:** e-mail oficial de suporte (`SUPPORT_EMAIL`).
- **Fontes ainda inexistentes:** ações BR/internacionais, FIIs/ETFs e cripto futuros aparecem como categorias "pendentes".
- **Fora do escopo desta fase:** conteúdos de Aprender, VIP/pagamentos, alertas de mercado, envio por e-mail/push, sistema de chamados.

## Problemas conhecidos
- **React #418 (hidratação) intermitente:** visto em ≈ 1 de 10 execuções do e2e de login sob carga de CPU nas etapas 07–08; **não reproduzido na Etapa 15** (40 tentativas dirigidas sob carga, inclusive em modo dev, + todas as suítes). A causa não foi identificada; o React se recupera sozinho. Os testes o reportam como `WARN` (`docs/ETAPA_08.md`).
- Limites de requisições ficam em memória (por instância); em produção com várias instâncias, usar um armazenamento compartilhado (ex.: Redis). O IP vem de `x-forwarded-for` — confie nele só atrás de um proxy que o reescreva.
- Tema e idioma são aplicados recarregando a página (cookie como fonte de verdade).
