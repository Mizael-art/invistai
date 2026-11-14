# Etapa 06 — VIP ("Em breve") — `/vip`

## Escopo
Página visual "Em breve" reaproveitando `features/soon/ComingSoon.tsx` (mesmo padrão da Etapa 05): ícone de coroa, selo "VIP", título "Em breve"/"Coming soon", texto "O módulo VIP está em desenvolvimento…", temas escuro/claro, PT/EN, desktop/mobile. A rota provisória genérica foi simplificada: `/vip` e `/aprender` têm páginas próprias.

## O que NÃO existe (por regra do escopo)
Sinais, entradas/alvos/stops, assinaturas, planos/preços, pagamentos, Telegram, conteúdo premium, consultas "ilimitadas" de IA, checkout/renovação. Não há tabelas, serviços, rotas ou APIs para isso.
**Guardas automáticos:** `tests/unit/scope.test.ts` falha se uma migração mencionar assinatura/pagamento/sinais/cursos/Telegram, se existirem rotas/serviços de checkout/assinatura/sinais, ou se `/vip`/`/aprender` usarem algo além de `ComingSoon`. O e2e confere que `/vip/checkout`, `/vip/planos`, `/vip/sinais`, `/api/checkout`, `/api/subscriptions`, `/api/signals` retornam 404.

## Comportamentos
Menu VIP visível e ativo (sidebar e barra inferior); **Voltar** (histórico interno ou Início) e **Voltar ao Início**; o cartão "VIP em breve" e o atalho do Início levam à tela, sem planos, preços ou botão de assinar.

## Correção de defeito (pilha de navegação)
O teste desta etapa revelou um bug da Etapa 05: ao navegar **por link** até a página de dois passos atrás, a pilha tratava como "voltar" e o botão Voltar ia ao Início em vez da página anterior. Corrigido: só desempilha em navegação por histórico (`popstate`); links sempre empilham (`lib/navStack.ts`, `NavTracker`). Novos testes unitários cobrem os dois casos.

## Testes
- Unitários (65 no total): guarda de escopo (3) + navStack (7).
- E2E VIP (22) + Início (30) + Mercado (34) + Detalhes (39) + Notícias (35) + Aprender (14): título/rótulo, menu ativo, ausência de qualquer termo/elemento de sinais/planos/pagamento, sem chamadas de API, Voltar (3 cenários), cartão e atalho do Início, 404 das rotas/APIs inexistentes, tema claro + EN, mobile.

## Pendências
Nenhuma desta etapa. O módulo VIP em si está fora do escopo desta fase.
