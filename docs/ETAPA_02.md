# Etapa 02 — Mercado (`/mercado`)

## Estado estritamente dirigido pela URL
`/mercado?cat=&q=&sort=&dir=&filter=&page=` — links compartilháveis, botão voltar funcional. Os parâmetros são validados com `zod` (`schemas/market.ts`); qualquer valor inválido cai no padrão, sem erro (testado com `cat=xxx&sort=drop&page=-5&filter=<script>&q=%00`).

## Categorias e fontes
| Categoria | Fonte | Estado |
|---|---|---|
| Criptomoedas (spot) | CoinGecko `/coins/markets` e `/search` | **Funcional** (USD; cache 60 s; paginação de 25) |
| Forex e moedas | Frankfurter (taxas de referência diárias do BCE), 10 pares USD/xxx | **Funcional** — **não é tempo real**; variação = último dia útil vs. anterior; a UI avisa e só marca "desatualizado" após 4 dias |
| Criptomoedas (futuros) | — | **Pendente** (provedor de derivativos a definir; apenas consulta informativa) |
| Ações brasileiras | — | **Pendente** (ex.: brapi, requer token) |
| Ações internacionais | — | **Pendente** |
| FIIs e ETFs | — | **Pendente** |
As abas pendentes aparecem marcadas e, ao abrir, mostram "sem fonte de dados configurada" — nenhum dado é inventado. Para ativar uma categoria: implementar um adaptador em `services/market/` e apontá-lo em `services/market/categories.ts` + `query.ts`.

## Comportamentos
- **Busca:** nome/símbolo, espaços e caracteres de controle normalizados, debounce de 400 ms (evita consultas repetidas), botão limpar, mensagem sem resultados. Cripto: busca remota (até 20 correspondências); Forex: busca local sem acento/caixa.
- **Filtro de variação:** Todas / Em alta / Em baixa; "Limpar filtros" aparece quando há filtro, busca ou ordenação ativos. Itens sem variação nunca aparecem em "alta/baixa".
- **Ordenação:** nome, preço, variação (cabeçalhos clicáveis, `aria-sort`); itens sem variação ficam por último. **Aplica-se aos resultados carregados na página** (aviso exibido na UI) — ordenar o mercado inteiro exigiria que o provedor suportasse a ordenação.
- **Lista:** #, ativo, preço com moeda de referência (USD / "1 USD = x BRL"), variação, mini-gráfico de 7 dias (dados reais), horário da cotação com selo "Desatualizado", favorito.
- **Paginação:** anterior/próxima, sem duplicar itens (testado).
- **Favoritos:** mesmo serviço da Etapa 01 (otimista, reverte em falha; 401/503 tratados).
- **Linha/nome → `/mercado/[id]`:** página provisória até a Etapa 03.
- **Estados:** carregamento (Suspense/skeleton), vazio, erro com "Tentar novamente", 429, provedor indisponível, categoria pendente.
- Itens sem preço são descartados; nunca viram zero.

## Testes
Unitários (26 no total): normalização de Forex, variação, cadência de desatualização, filtro/ordenação (nulos por último, imutabilidade), validação de parâmetros, busca, `priceText`.
E2E Mercado (34) + E2E Início (30), contra servidor **mock**: listas, paginação, busca, filtros, ordenação asc/desc, Forex, categoria pendente, parâmetros inválidos, favoritos, navegação, EN, mobile sem rolagem horizontal, 429 e 500.
**Não testado (sem rede/credenciais):** respostas reais de CoinGecko e Frankfurter — o formato foi implementado conforme a documentação pública e validado com `zod`; qualquer divergência cai em "resposta inválida do provedor" sem quebrar a página. Verifique também os termos/limites de cada provedor para uso comercial.

## Pendências
Fontes das 4 categorias pendentes; ordenação global (depende do provedor); Etapa 03 (detalhes).
