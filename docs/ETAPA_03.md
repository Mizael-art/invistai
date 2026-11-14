# Etapa 03 — Detalhes do ativo (`/mercado/[id]`)

## Identificação e validação do ativo
`id` = id do CoinGecko (cripto spot, ex.: `bitcoin`) ou par forex `usd-brl`. O id é validado por regex antes de qualquer chamada (`isValidAssetId`); ids inválidos, inexistentes ou de categorias sem provedor mostram **"Ativo não encontrado ou não suportado"** com link para o Mercado.

## Cabeçalho
Nome, símbolo, categoria, moeda de referência, preço, variação, origem, horário da cotação (+ "há x min") e selo "Desatualizado" conforme a cadência da fonte. Ações: **Compartilhar** (Web Share API ou copia o link da página; mensagem se falhar) e **Favoritar** (mesmo serviço das etapas anteriores, com reversão em falha). Atalhos de seção: Gráfico · Dados · Notícias relacionadas · Análise. **Não há botões de compra/venda** (verificado em teste).

## Gráfico — widget oficial TradingView (Advanced Chart, embed)
- Carregado de `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js` com a configuração em JSON (`services/market/tradingview.ts → buildTvConfig`). **Não** usa a biblioteca Advanced Charts (depende de licença própria).
- **Mapeamento curado por id do CoinGecko** (18 criptos principais → `BINANCE:XXXUSDT`) e `FX_IDC:USDxxx` para o forex. Ativos fora da lista **não recebem gráfico de outro ativo**: mostram "símbolo não mapeado" e a série de 7 dias do provedor de dados.
- **Controles externos conectados de verdade:** períodos 1D/5D/1M/6M/1A/Tudo (`range` + `interval`) e Linha/Velas (`style`) **remontam o widget** com a nova configuração. Tema (claro/escuro) e idioma do app também são repassados.
- **Indicadores:** não há botões externos de indicadores (o widget embed não expõe API de controle externo). O usuário adiciona indicadores pela **barra nativa do próprio widget** (`hide_top_toolbar: false`).
- Falha de carregamento (bloqueador, rede, 15 s sem o iframe): mensagem clara + "Tentar novamente"; o resto da página continua funcionando.
- Atribuição "Track all markets on TradingView" mantida dentro do widget, mais aviso de independência.

## Dados
Cripto (CoinGecko `/coins/{id}`): capitalização, volume 24h, máxima/mínima 24h, máxima histórica, oferta circulante, categorias e descrição (HTML removido, truncada em fim de frase, com fonte; pode vir em inglês). Se esse endpoint falhar, o restante da página segue e mostra "dados descritivos indisponíveis". Forex: máxima/mínima do período disponível, calculadas da série do provedor.

## Notícias relacionadas
NewsAPI com consulta pelo nome do ativo (título, fonte, horário, link original `noopener`). Sem chave → "provedor não configurado"; erros tratados no bloco.

## Análise educacional
- **Indicadores calculados** a partir da série do provedor (7 dias cripto / dias disponíveis no forex): variação, posição na faixa, preço vs. média, oscilação, pontos analisados, tendência observada (regra simples e transparente). Exige ≥24 pontos (cripto) / ≥5 (forex); senão informa "dados insuficientes".
- Explicação em linguagem educacional, **riscos e limitações**, fonte, janela e horário do cálculo.
- **Origem identificada:** cálculo automático (não é IA, não é recomendação). **Análise por IA:** "indisponível — provedor não configurado" (nada é simulado). **Análise da equipe:** "nenhuma publicada".

## Testes
- Unitários (44 no total): HTML→texto, detalhe do CoinGecko, mapeamento TradingView (sem colisão de símbolo), configuração do widget, validação de ids, indicadores (alta/queda/mista/insuficiente/constante/NaN), formatação compacta.
- E2E detalhes (39) + Mercado (34) + Início (30), contra servidor **mock**, com o script do TradingView **interceptado** (stub que cria o iframe, ou aborto para testar a falha): cabeçalho, config do widget, períodos, tipo, tema/idioma, dados, notícias, análise, compartilhar (clipboard), favorito, ativo não mapeado, falha parcial, forex, ids inválidos, navegação, mobile, 429.
- **Não testado (sem rede/credenciais):** o widget real do TradingView (símbolos `BINANCE:…`/`FX_IDC:…` e chaves de configuração seguem a documentação pública, mas **não foram validados contra o serviço real**), respostas reais de CoinGecko/Frankfurter/NewsAPI e contas Supabase reais. Confira os termos de uso do widget do TradingView para o seu caso (uso comercial) e os limites dos provedores.

## Pendências
Validar símbolos no TradingView real; ampliar o mapeamento; fontes das categorias pendentes (ações/FIIs/ETFs/futuros); provedor de IA; análises editoriais (equipe).
