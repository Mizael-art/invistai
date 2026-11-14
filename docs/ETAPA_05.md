# Etapa 05 — Aprender ("Em breve") — `/aprender`

## Escopo
Página visual "Em breve" no padrão do projeto (cartão com ícone do menu, selo "Aprender", título "Em breve"/"Coming soon", texto curto, tema escuro/claro, PT/EN, desktop/mobile). Componente reutilizável `features/soon/ComingSoon.tsx` (a Etapa 06 — VIP — reaproveitará).

## O que NÃO existe (por regra do escopo)
Cursos, trilhas, progresso, biblioteca/ebooks, downloads, permissões premium, checkout, assinatura, tabelas de banco ou chamadas de API. O teste e2e verifica que a página não faz nenhuma requisição a `/api/` e que não há tabela/barra de progresso/termos de compra ou download.

## Comportamentos
- Menu **Aprender permanece visível** e ativo (sidebar no desktop, barra inferior no mobile).
- **Voltar:** usa o histórico real do app quando existe (pilha de navegação interna em `sessionStorage`, `lib/navStack.ts`, mantida por `NavTracker`); sem histórico interno (acesso direto ou nova aba) vai ao **Início**. Botão **Voltar ao Início** sempre disponível. O atalho "Aprender" do Início leva à página.
- Sem JS de dados/estado além do botão Voltar.

## Testes
- Unitários (60 no total): `navStack` (empilhar, refresh, desempilhar, limite).
- E2E Aprender (14) + Início (30) + Mercado (34) + Detalhes (39) + Notícias (35): título/rótulo, menu ativo, ausência de conteúdo fictício, só ações de navegação, nenhuma chamada de API, Voltar (sem histórico → Início; Início→Aprender→Voltar → Início; Mercado→Aprender→Voltar → Mercado), atalho do Início, tema claro + EN, mobile (barra inferior, sem rolagem horizontal).
- Não há dependência externa nesta etapa.

## Pendências
Nenhuma além do módulo Aprender em si (fora do escopo desta fase). A rota `/vip` ainda usa a tela provisória genérica até a Etapa 06.
