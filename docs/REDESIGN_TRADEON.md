# TRADEON — Rebranding e redesign (v2.0.0)

O INVISTAÍ passa a se chamar **TRADEON — Seu mercado financeiro em um só lugar.** Mudou só a camada visual e a experiência: rotas, APIs, banco, migrações, autenticação, validações, cálculos e dados ficaram iguais. Todos os testes anteriores continuam passando.

## Referências
- **FinFinance** (referência principal): títulos grandes e firmes, rótulos de seção pequenos em maiúsculas, cards com raio grande e borda quase invisível, abas em pílula, linhas de lista limpas, avatares com fundo tingido, barra inferior com 5 itens.
- **Revolut / Wise / Stripe:** acabamento premium, hierarquia clara, poucos elementos em destaque, sistema de componentes consistente. Nenhum logotipo ou elemento proprietário foi copiado.

## Identidade
| Token | Cor | Uso |
|---|---|---|
| Obsidian | `#080D0B` | fundo escuro, texto sobre lime |
| Forest | `#14221A` | superfícies elevadas, campos, item ativo |
| Electric Lime | `#9BFF62` | ação principal, seleção, positivo, marca |
| Cloud | `#F4F6F4` | texto (escuro) e fundo (claro) |
| Slate | `#87948B` | texto secundário e metadados |
| White | `#FFFFFF` | cards no tema claro |

- **Tema claro:** fundo Cloud, cards brancos, a mesma lime nos botões. Para texto positivo usa um verde escuro (`#2B7F12`), porque a lime não tem contraste suficiente sobre branco.
- **Contraste AA (≥ 4,5:1)** verificado em teste para texto principal, secundário, positivo e negativo nos dois temas.
- **Logotipo:** um "T" cuja barra sobe em degrau, como uma leitura de mercado em alta, mais o nome **TRADE**ON com o "ON" na cor da marca.
  - Versões: menu lateral e cabeçalho (`<Logo />`), só o símbolo (`<Logo mark />` e `LogoMark`, usado no cabeçalho do celular abaixo de 420 px) e favicon (`app/icon.svg`).
  - Sem cifrões, moedas ou símbolos de banco.
- **Tipografia:** Inter Variable servida pelo próprio app (`@fontsource-variable/inter`). Removi a dependência do Google Fonts em tempo de execução, que antes era um problema conhecido.

## Design system (`app/globals.css`)
- **Tokens:** cores, raios (10/14/20/24 px), sombra só no tema claro, curva de animação.
- **Componentes:**
  - botões: principal lime, secundário neutro, perigo em vermelho;
  - campos e selects com foco em lime;
  - pílulas, segmentos, badges, tabelas, cards e `details`;
  - avisos, skeleton, gráfico, folha "Mais" e as telas Em breve, de acesso e de notificações.
- **Mantido:** os nomes de classe usados pelos componentes e pelos testes.

## Organização e navegação
- **Menu lateral agrupado:**
  - **Explorar:** Início, Mercado, Notícias.
  - **Aprenda e evolua:** Aprender, VIP.
  - **Minha conta:** Favoritos, Notificações (com contador de não lidas), Perfil.
  - **Suporte** no rodapé.
  - Antes, Favoritos, Notificações e Perfil não estavam no menu.
- **Celular:** barra inferior com Início, Mercado, Notícias, Favoritos e **Mais**. O "Mais" abre uma folha com Aprender, VIP, Notificações, Perfil e Suporte, que fecha com Esc, com toque fora ou ao navegar, e devolve o foco ao botão.
- **Cabeçalho:** busca, idioma, tema (ícones de sol e lua), sino, avatar e Sair. No celular nada se sobrepõe.
- **Início:**
  - resumo do mercado com 4 indicadores;
  - gráfico do BTC com área, grade, rótulos de máxima e mínima, período e variação de 7 dias calculada da própria série;
  - ativos em destaque, notícias, card VIP e atalhos.
  - Todas as informações anteriores continuam presentes.
- **Notícias:** grade de 2 colunas no desktop, com os mesmos itens e ações.
- **Notificações:** as ações descem para baixo do texto no celular.
- **Telas de acesso:** painel de marca compartilhado (`AuthHero`) e logotipo no celular.
- **Tabela do Mercado:** cabe nos 390 px do celular.

## Não alterado / fora do escopo
- O prompt cita **Carteira, Investimentos, Calendário econômico, Análises e Inteligência artificial**. Essas telas **não existem** no projeto e não foram criadas, porque fazê-las exigiria dados fictícios.
  - O detalhe do ativo já tem a "Análise educacional", calculada de dados reais, e o aviso de que a análise por IA está indisponível; ambos foram mantidos.
- Os cookies internos continuam com o prefixo `iv_` (`iv_lang`, `iv_theme`). Renomeá-los apagaria as preferências de quem já usa o app.

## Testes
- Nova suíte `tests/e2e/design.py` com **26 verificações**:
  - marca: logotipo, favicon, nenhuma tela com o nome antigo;
  - paleta oficial nos dois temas, Inter local sem Google Fonts, contraste AA;
  - estilo dos botões, raio dos cards e elementos do gráfico;
  - menu agrupado e contador no menu, menu "Mais" (abrir, Esc, foco, toque fora, navegar);
  - cabeçalho do celular sem sobreposição, logotipo nas telas de acesso no celular;
  - tablet e notebook sem rolagem horizontal, consistência dos títulos.
- Regressão completa: todas as suítes anteriores. Mudaram só as contagens de navegação: o menu passou de 6 para 9 links e a barra inferior agora tem 4 links + "Mais".
- Capturas: `docs/screenshots/tradeon/` (desktop escuro e claro, celular).

## Correções durante a revisão
- **Favoritos:** os contadores das abas (Todos/Ativos/Notícias) agora caem na hora ao remover um item. Antes dependiam só da atualização do servidor, que às vezes demorava. Quando o servidor responde, o valor dele passa a valer, sem descontar duas vezes.
- **Testes:** Favoritos e Notificações esperam a página ficar interativa antes de clicar.

## v2.1.0 (após o deploy)
- **Notícias sem chave:** provedor RSS público (`services/news/rss.ts`) com fontes reais por categoria e idioma — PT: Livecoins e Money Times; EN: CoinDesk, Cointelegraph e investingLive. Só manchete, fonte, data e link para a matéria original. Remove duplicatas, itens com mais de 7 dias e links não-http; falha parcial por categoria. A NewsAPI continua disponível (`NEWS_PROVIDER=newsapi`/`NEWS_API_KEY`).
- **Gráfico estilo corretora:** barra de tempos 15m · 1h · 4h · 1D visível e "Mais" (1m, 5m, 30m, 2h, 1S, 1Mês); Linha/Velas; EMA 7/14/28 e volume (desligáveis); barra do widget oculta; maior; horário de Brasília; escolhas lembradas no navegador. Cabeçalho do ativo com preço colorido pela variação e máx./mín./volume 24h.
- **Telas de acesso:** o logotipo leva ao Início (desktop e celular).
- **Horários** no fuso de Brasília (`APP_TIMEZONE`), também no servidor da Vercel.

## v2.2.0 — visual da referência (showcase TRADEON)
- **Logotipo:** três barras ascendentes inclinadas + "TRADE**ON**"; favicon no mesmo desenho.
- **Fundo e cards:** Obsidian com brilho verde sutil nos cantos; cards com leve gradiente e borda esverdeada; raio de 18px.
- **Início:** card de destaque "Mercado agora" (BTC/USD real) com preço grande, pílula de variação, gráfico de área com brilho ao lado e linha de indicadores (variação 24h e 7 dias, máxima e mínima de 7 dias, tudo calculado da série real); fileira de ações rápidas (Mercado, Notícias, Favoritos, Alertas, Aprender, VIP); "Mercados hoje" e notícias recentes com miniatura quando a fonte fornece imagem; faixa VIP. Não há "patrimônio" nem carteira: o app não tem esses dados e nada foi inventado.
- **Variação em pílula** (▲ verde / ▼ vermelha) no Início, Mercado, Ativo e Favoritos; seta via CSS, texto do número inalterado.
- **Abas em pílula sólida** (lime) para filtros; **abas sublinhadas** fixas no detalhe do ativo, acompanhando a seção visível.
- **Notícias:** imagem da matéria quando o RSS a fornece (só https); a primeira vira destaque grande.
- **Cabeçalho logado:** avatar com menu da conta (Perfil, Favoritos, Suporte, Idioma, Tema, Sair).
