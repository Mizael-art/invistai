# Etapa 15 — Integração final

## Auditoria e correções
| Área | Encontrado | Correção |
|---|---|---|
| Dependências | `npm audit`: PostCSS (alta) embutido no Next | `overrides` → `postcss@8.5.32`; `npm audit` = 0 vulnerabilidades |
| CSRF | `PUT /api/preferences`, `POST/DELETE /api/favorites` e `POST /api/refresh` sem checagem de origem | `sameOrigin` em todas as APIs que alteram estado (teste: 5 APIs → 403 com outra origem) |
| Abuso | `/api/refresh` limitado só por IP (cabeçalho forjável) → poderia esgotar a cota dos provedores | teto global `REFRESH_GLOBAL_PER_MIN` (padrão 30/min) |
| XSS | notícias aceitavam qualquer URL válida do provedor (inclusive `javascript:`/`data:`) | só `http(s)`; imagens só `https` (teste unitário) |
| Cabeçalhos | nenhum cabeçalho de segurança | `nosniff`, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri; form-action; object-src`, `Referrer-Policy`, `Permissions-Policy` |
| Banco | cliente tinha privilégios desnecessários (TRUNCATE ignora RLS; INSERT/DELETE em notificações; visitante com grants nas tabelas privadas) | migração `20260101000008_hardening.sql` |
| 404 | rota inexistente mostrava a página padrão do Next (fora do visual) | `app/not-found.tsx` com menu/cabeçalho, PT/EN, "Voltar ao Início" e "Suporte" |
| Erro de página | mensagem bilíngue fixa ("… / …") | traduzida pelo idioma ativo, com "Tentar novamente" e "Suporte" |
| Acessibilidade | detalhe do ativo sem título (h1) quando o provedor falha | h1 com o identificador do ativo |
| Notificações | após "Marcar como lida", o contador da central descontava o item duas vezes quando a página se atualizava (podia chegar a 0 e desabilitar "Marcar todas"); o sino dependia só da atualização do servidor | contagem corrigida; o sino é atualizado na hora (evento interno) e confirmado pelo servidor; teste de regressão |
| Campos de busca (Mercado, Notícias, Favoritos) | uma resposta atrasada da busca anterior podia sobrescrever o texto que o usuário ainda estava digitando | o campo só é sincronizado com a URL quando não está em uso |
| Testes instáveis | cliques antes da hidratação em Notificações/Favoritos | espera da hidratação (`networkidle`) e prazos maiores |

## Migrações num Postgres real
`tests/unit/db-migrations.test.ts` aplica **todas** as migrações em ordem num Postgres 17 real (PGlite) com um shim mínimo do Supabase (`tests/db/supabase-shim.sql`: papéis `anon`/`authenticated`, `auth.users`, `auth.uid()`, privilégios padrão) e verifica: RLS ligada nas 4 tabelas; trigger de cadastro cria perfil (telefone só E.164) e notificação de boas-vindas; e-mail confirmado/senha alterada geram notificação uma única vez; isolamento entre usuários em perfis, favoritos, preferências e notificações; favorito duplicado recusado; notificações: só `read_at` alterável, sem criar/apagar/TRUNCATE; visitante sem acesso; destino só interno e categoria restrita; exclusão em cascata. Isso resolve a pendência "trigger não testado em Postgres real" da Etapa 13 (o Supabase real continua a validar via `supabase db push`).

## E2E de integração (`tests/e2e/integration.py`, 30 verificações)
Jornada completa: visitante (rotas privadas → login com destino) → cadastro → login bloqueado até confirmar → login volta ao destino → favoritar no Mercado → detalhe marcado → favoritar notícia → busca global → favoritar no detalhe → Favoritos com 3 itens → sino → notificação abre o Perfil → inglês + tema claro valem no app todo → Suporte → logout → outro dispositivo com tema/idioma/favoritos sincronizados. Varredura de **todas as páginas** (desktop PT/escuro e EN/claro, mobile 390 px, visitante e logado): status 200, título, sidebar/barra inferior, sem rolagem horizontal. 404, cabeçalhos de segurança, CSRF nas 5 APIs, ausência de segredos no HTML e **todos os provedores fora do ar** sem derrubar nenhuma página.

## Resultado
- Typecheck e build: OK.
- Unitários: **160** (vitest).
- E2E: **15 suítes / 571 verificações** — Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22, Login 51, Cadastro 61, Recuperação 55, Perfil 52, Favoritos 42, Busca 39, Notificações 35, Suporte 32, Integração 30.
- ZIP final validado em pasta limpa (instalação do zero + typecheck + unitários + build + todas as suítes e2e).

## React #418
Não reproduzido nesta etapa: 25 logins sob carga máxima de CPU em produção, 15 em modo dev sob carga e todas as suítes sem ocorrência. A causa segue não identificada (ver `docs/ETAPA_08.md`); os testes continuam a reportá-lo como `WARN` se aparecer.

## Não testado (depende de serviços reais)
Supabase/SMTP reais, NewsAPI em produção, TradingView real, CoinGecko real, abertura do aplicativo de e-mail no dispositivo.
