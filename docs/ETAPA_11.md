# Etapa 11 — Favoritos (`/favoritos`)

Rota **privada** (middleware + checagem na página). Reutiliza o **mesmo serviço** de favoritos de Mercado, Detalhes e Notícias (`/api/favorites` + `FavoriteButton`).

## O que a lista mostra
- **Ativos e notícias** favoritados, **mais recentes primeiro**, em abas **Todos / Ativos / Notícias** com contagem.
- **Ativo:** símbolo, nome, **cotação atual** (preço com moeda, variação, fonte, horário, selo "Desatualizado") buscada nos provedores só para os itens da página; botão **Abrir ativo** → `/mercado/[id]`.
- **Notícia:** título, categoria, fonte e data, a partir dos **metadados salvos** (título/fonte/data/URL https — nunca o texto); **Abrir notícia** → matéria original em nova aba (`noopener`). A notícia não é apresentada como "recente": só mostra a data de publicação.
- **Resiliência:** se o provedor de cotações falha, o ativo aparece com o **nome/símbolo salvos** e o aviso "Cotação indisponível" (nenhum preço é inventado). Favoritos antigos **sem metadados** aparecem pelo id (ativo) ou "Notícia salva sem dados disponíveis" (sem link) e continuam removíveis e pesquisáveis pelo id.
- **Busca** (debounce 400 ms; nome/símbolo/id do ativo; título/fonte da notícia; sem acento/caixa), **abas**, **paginação** (20/página) e **"Limpar busca e filtros"**, tudo na URL (`?type=&q=&page=`, validado com zod; valores inválidos caem no padrão).
- **Remover dos favoritos:** `DELETE /api/favorites`; o item some na hora, o banco é atualizado e o servidor atualiza contadores/paginação; remover o último item visível mostra aviso.
- **Estados:** carregando (skeleton), **vazio** ("Nenhum favorito salvo." + *Voltar ao mercado* / *Ver notícias*), **sem resultado** (mensagem simples), erro de leitura com "Tentar novamente".

## Segurança e integridade
- **Isolamento por usuário:** a API usa sempre o `user_id` da sessão (não do corpo da requisição) e a **RLS** do banco restringe leitura/gravação/remoção ao dono. O e2e confirma, com RLS simulada no mock, que outra conta **não vê nem remove** favoritos alheios.
- **Sem duplicatas:** `unique (user_id, item_type, item_id)` + `upsert ignoreDuplicates`; favoritar duas vezes mantém uma linha.
- **Sincronização entre dispositivos:** os dados vivem no banco (testado com dois dispositivos: lista igual; remoção em um aparece no outro).
- **Metadados validados por tipo** (zod): ativo `{symbol, name, category?}` (estrito), notícia `{title, source, url https, publishedAt, category?}`; tipo errado, campos extras, `javascript:`/http → 400. Limite de 60 requisições/min por usuário. Leitura limitada a **500** favoritos por usuário (`FAVORITES_CAP`).
- As páginas **Mercado, Início e Detalhes** passaram a enviar o metadado do ativo ao favoritar (necessário para exibir o item com o provedor fora do ar). Favoritos criados antes (sem metadados) continuam funcionando.

## Testes
- Unitários (119 no total): metadados por tipo (aceita/rejeita), `toItems` (tolerância a metadados ausentes), contagem, filtro/busca, paginação, parâmetros.
- E2E Favoritos (**42**) + regressão (Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22, Login 51, Cadastro 61, Recuperação 55, Perfil 52): visitante → login; estado vazio; favoritar a partir de Mercado, Início, Detalhes e Notícias; metadados gravados; ordem; dados do ativo e da notícia; abas; buscas (nome, símbolo, título/fonte, combinada, sem resultado); parâmetros inválidos; remover (UI, banco, persistência, estrela no Mercado); outro dispositivo; isolamento entre contas; duplicatas; API (401, metadados inválidos, 429); paginação (25 itens → 20 + 5); provedor fora do ar; favoritos sem metadados; EN/claro; mobile.
- **Não testado (sem Supabase real):** a RLS real no Postgres (foi simulada no mock; as políticas estão nas migrações `..0002`/`..0003`) e a persistência real.

## Pendências
Supabase real; análises/conteúdos/gravações como tipos de favorito **não existem** (módulos fora do escopo atual); causa do erro de hidratação #418 (README).
