# Etapa 00 — Diagnóstico

## Estrutura encontrada
O projeto existente era um **protótipo visual de arquivo único** (`invistai.html`, HTML+CSS+JS vanilla, ~130 KB) com 25 telas simuladas por estado local e dados fictícios. Não havia framework, rotas reais, build, banco, autenticação ou testes. Está preservado em `docs/prototipo/` como referência visual.

## Inventário (prototipo)
| Tela | Estado no protótipo | Nesta fase |
|---|---|---|
| Início | visual pronto, dados fictícios | **Etapa 01 — implementada com dados reais** |
| Mercado, Detalhe do ativo, Notícias | visual pronto, mock | pendentes (Etapas 02–04) |
| Aprender, VIP | módulos simulados | devem virar "Em breve" (rotas já criadas) |
| Login, Cadastro, Recuperação, Perfil, Favoritos, Busca, Notificações, Suporte | visual pronto, mock | pendentes (Etapas 07–14) |

## Problemas identificados
- Todo dado era fictício; nenhuma persistência; autenticação falsa.
- Aprender/VIP simulavam funcionalidades que o escopo atual proíbe.
- Sem separação de camadas nem testes.

## Arquitetura adotada (sem stack prévia → proposta do prompt)
Next.js 15 (App Router) + TypeScript + Supabase (Auth + PostgreSQL + RLS). CSS do design aprovado reaproveitado **sem alteração visual** (`app/globals.css`). Dados externos atrás de uma camada `services/` (provedor substituível); validação com `zod`; cache via `fetch` revalidate + tags; i18n PT/EN por cookie; tema por cookie (sem modo automático).

## Ordem de implementação
00 Diagnóstico → **01 Início** → 02 Mercado → 03 Detalhes do ativo → 04 Notícias → 05 Aprender → 06 VIP → 07 Login → 08 Cadastro → 09 Recuperação → 10 Perfil → 11 Favoritos → 12 Busca global → 13 Notificações → 14 Suporte → 15 Integração final.
