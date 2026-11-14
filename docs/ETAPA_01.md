# Etapa 01 — Início

## Fontes de dados
| Bloco | Fonte | Configuração | Observações |
|---|---|---|---|
| Indicadores, ativos em destaque, gráfico 7 dias | CoinGecko `/coins/markets` (cripto spot, USD) | `COINGECKO_API_KEY` (Demo, opcional), `COINGECKO_BASE_URL` | Cache 60 s. Dados **não** são garantidos em tempo real; a UI mostra horário e fonte e marca "Desatualizado" após 15 min. Verifique os termos/atribuição e o plano da CoinGecko para uso comercial antes de produção. |
| Notícias | NewsAPI `/everything` | `NEWS_API_KEY`, `NEWS_API_BASE_URL` | Cache 10 min. **O plano Developer da NewsAPI não permite uso em produção**; avaliar plano pago ou outro provedor (a camada `services/news` é substituível). Imagens não são exibidas (direitos não verificados). Só título, fonte, horário e link original. |
| Ações, FIIs, ETFs, Forex | — | — | Sem provedor configurado: a UI informa isso; nenhum número é inventado. |

## Comportamentos entregues
Saudação (nome do perfil se autenticado, genérica para visitante); 4 indicadores; gráfico de 7 dias do BTC (dados reais, SVG); ativos em destaque com favorito; notícias recentes (deduplicadas, ordenadas por data real); "Atualizar dados" (revalida cache, com limite de abuso); atalhos; VIP/Aprender abrem "Em breve"; estados de carregamento (Suspense/skeleton), erro (por bloco, sem derrubar a página), vazio, não configurado, limite de API e dados desatualizados; tema escuro padrão + claro; PT/EN.

## Favoritos
`POST/DELETE /api/favorites` (zod + sessão Supabase + RLS + limite de 60/min). Sem login → 401 e link "Entre para favoritar"; sem Supabase → 503 e aviso. A UI é otimista e **reverte** em falha.

## Banco (`supabase/migrations`)
`profiles` (RLS dono) com trigger de criação no cadastro; `favorites` (unique user+tipo+item, índice, RLS dono). Aplicar com `supabase db push` (ou executar os `.sql` em ordem).

## Elementos desabilitados de propósito
Busca global (Etapa 12). Links de sino/Entrar levam a páginas "etapa futura" até as Etapas 13/07.

## Testes
`npm test` → 15 testes unitários. `npm run build && npm run test:e2e` → 30 verificações e2e contra servidor **mock** local (sucesso, 429, 500, sem chave, API de favoritos, rate limit, mobile, tema, idioma).
**Não testado:** chamadas reais a CoinGecko/NewsAPI (sem acesso de rede no ambiente de desenvolvimento) e fluxos autenticados reais do Supabase (sem projeto configurado) — dependem de credenciais.
