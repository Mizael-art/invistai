# Etapa 04 — Notícias (`/noticias`)

## Provedor e licenciamento
Camada `services/news/` (provedor substituível). Implementado: **NewsAPI** (`/everything`), chave só no servidor (`NEWS_API_KEY`). **Antes de produção:**
- O plano **Developer não permite uso em produção** (e limita a 100 req/dia e a histórico de ~1 mês). Avalie plano pago ou outro provedor com licença que permita exibir título/fonte/link no seu caso comercial.
- Não há scraping, cópia de artigos nem paywall contornado. **Imagens não são exibidas** (direitos não verificados) e a descrição do provedor **não** é reproduzida; mostramos apenas **título, fonte, horário e link da matéria original** (abre em nova aba com `noopener`). Resumo próprio só quando houver informação suficiente — nesta etapa não há geração de resumos (não há IA configurada).
- Consumo de cota: cache de 30 min por (categoria × idioma × página). "Todas" = 4 requisições; categoria única = 1. Pior caso contínuo ≈ 4 × 2 idiomas × 48 ≈ 384 req/dia → acima do plano gratuito; planeje cota ou use um plano pago.
- Janela de 7 dias (`from` + descarte local): nada antigo é apresentado como recente.

## Comportamentos
- **Categorias:** Criptomoedas, Bolsa e ações, Economia global, Forex e moedas (consultas PT/EN em `services/news/categories.ts`) + "Todas" + "Para você" (aparece só para quem salvou preferências).
- **Feed:** mescla as categorias, **deduplica** (id estável = hash da URL canônica, sem `utm_*`; e título normalizado, inclusive entre categorias) e ordena pela **data real** de publicação. Itens sem título/data/URL válida ou `[Removed]` são descartados.
- **Busca:** título e fonte do feed **carregado**, sem acento/caixa, debounce de 400 ms, limpar busca e "Limpar filtros".
- **Paginação:** anterior/próxima por página do provedor, sem duplicar.
- **Favoritar:** persiste no Supabase (`favorites`, tipo `news`) **com metadados mínimos** (título, fonte, data, URL https — validados com zod; `javascript:`/http rejeitados) para a futura página Favoritos. Otimista, reverte em falha; 401/503 tratados.
- **Compartilhar:** Web Share API ou cópia da **URL original** da matéria.
- **Preferências de categorias:** `PUT /api/preferences` (zod, sessão, RLS, limite 20/min) → tabela `user_preferences`; habilita o chip "Para você". Visitante é convidado a entrar. **Não** há envio de notificações: só a preferência é salva (nenhuma notificação é prometida).
- **Estados:** carregando (skeleton), feed carregado, vazio, sem resultado na busca, provedor indisponível, limite de API (429), não configurado, **falha parcial** (mostra as categorias que responderam + aviso da que falhou). Falha de notícias não afeta Início/Mercado.

## Banco (novas migrações)
`..0003_favorites_metadata.sql` (coluna `metadata jsonb`, ≤ 4 KB) e `..0004_user_preferences.sql` (RLS por dono).

## Testes
Unitários (55 no total): janela de frescor, merge/dedupe/ordenação, busca, parâmetros, metadados de favorito (aceita/rejeita), preferências.
E2E Notícias (35) + Início (30) + Mercado (34) + Detalhes (39), contra mock: 35 itens únicos mesclados, ordem por data, sem imagens, links seguros, dedupe/antigos/inválidos, categoria, paginação, busca (+ acento, + categoria), limpar filtros, favorito/compartilhar, preferências (visitante), APIs (400/503), parâmetros inválidos, EN, mobile, 429, 500, sem chave, falha parcial.
**Não testado (sem rede/credenciais):** respostas reais da NewsAPI e persistência real no Supabase (favoritos com metadados e preferências). **Não implementado:** o estado "link ou matéria indisponível" (apenas linkamos a fonte; não verificamos a URL) e a página de detalhe interna (a notícia abre na fonte original, opção prevista no escopo).

## Pendências
Plano/licença de produção do provedor; resumos próprios (dependem de IA/edição); página Favoritos (Etapa 11); notificações (Etapa 13).
