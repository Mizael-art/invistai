# Etapa 12 — Busca global (cabeçalho)

## O que pesquisa
**Somente ativos e mercados** — nunca notícias, cursos, ebooks, sinais, gravações ou conversas (verificado em teste: todo resultado aponta para `/mercado…`).
- **Criptomoedas (spot):** CoinGecko `/search` (nome, símbolo; até 8, ordenados por ranking de capitalização). Ids validados antes de virar link.
- **Forex:** catálogo local dos 10 pares suportados (`USD/BRL`, "real", "euro"…), sem consultar cotações.
- **Mercados (categorias):** nome em PT/EN e apelidos (ex.: "ações", "fii", "etf", "câmbio", "nasdaq"); categorias sem fonte aparecem marcadas **"pendente"** e levam à aba correspondente do Mercado (sem inventar ativos).
- Ordem: **símbolo exato primeiro**, depois cripto por ranking, depois forex; até 10 ativos.

## Comportamento
- Campo no cabeçalho (desktop) e botão de lupa que abre a busca em **tela cheia** no mobile (com "Fechar"). Atalho **Ctrl/⌘+K**.
- **Debounce de 300 ms** (digitação contínua = 1 requisição), **cancelamento** da requisição anterior (resposta antiga nunca sobrescreve a nova), **cache por consulta** no navegador e `fetch` com cache de 60 s no servidor — evita requisições repetidas.
- Mínimo de 2 caracteres; consulta saneada (sem caracteres de controle, espaços colapsados, até 60 caracteres).
- Resultados mostram **nome, símbolo e categoria**; clicar/Enter abre o **detalhe do ativo** (ou a categoria no Mercado) e limpa a busca.
- **Teclado/acessibilidade:** padrão *combobox* (`role=combobox/listbox/option`, `aria-activedescendant`), setas ↑↓, Enter, Esc (limpa; segundo Esc fecha), clique fora fecha, anúncio em `aria-live`.
- **Estados:** digitando, buscando, sem resultados ("Nenhum resultado encontrado."), **falha parcial** (cripto indisponível → aviso e os demais resultados continuam; nada é inventado), erro total com "Tentar novamente", limite atingido.
- Não aparece nas telas de autenticação.

## API
`GET /api/search?q=` — pública (conteúdo público), sem `q` → 400, `q` curto → lista vazia sem chamar o provedor, limite **30/min por IP** (`SEARCH_RATE_PER_MIN`, em memória), `Cache-Control: private, max-age=30`. Resposta: `{ q, markets, assets, errors }`.

## Testes
- Unitários (129 no total): saneamento, categorias/apelidos/pendentes, catálogo forex, ordenação, parser do CoinGecko, `runSearch` com provedores injetados (falha parcial, sem chamada para consulta curta, só campos de ativos/mercados).
- E2E Busca (**39**) + regressão de todas as etapas: mínimo de caracteres sem API, debounce (7 teclas → 1 requisição), campos do resultado, só ativos/mercados, abrir detalhe, símbolo, forex, mercados (inclui pendente), sem resultado, limpar, cache, teclado (setas/Enter/Esc), clique fora, Ctrl+K, **condição de corrida** (requisição lenta cancelada), API (400, curto, controle, tamanho, campos, entrada maliciosa, 429), provedor fora (falha parcial), limite atingido, ausência nas telas de login, EN/claro, mobile (tela cheia, foco, sem rolagem horizontal, tocar abre, fechar).
- **Não testado (sem rede):** respostas reais do `/search` do CoinGecko e seus limites.

## Pendências
Ações, FIIs/ETFs e futuros só aparecem como **categorias pendentes** até existir provedor dessas cotações.
