# Etapa 13 — Notificações (central interna)

## Fonte das notificações (sem dados fictícios)
Só existem notificações geradas por **eventos reais do sistema**, criadas no banco por trigger (`notify_account_events`, migração `20260101000007_notifications.sql`):
- **Boas-vindas** — ao criar a conta (`auth.users` insert);
- **E-mail confirmado** — quando `email_confirmed_at` passa a ter valor;
- **Senha alterada** — quando a senha da conta muda.

Não há notificações financeiras (alertas de preço, sinais, notícias) — **nenhuma é inventada**. As categorias *Mercado* e *Notícias* já existem no esquema/filtros para quando houver fonte real de alertas; hoje ficam vazias. **Nada é enviado por e-mail ou push** — é só a central dentro do app (dito na própria tela).

## Banco e segurança
- Tabela `notifications` (`user_id`, `kind`, `category` ∈ market|news|account, `title`, `message`, `target` restrito a caminho interno, `created_at`, `read_at`) com índices por usuário/data e não lidas.
- **RLS:** cada usuário só lê/atualiza as próprias linhas; `UPDATE` permitido **apenas na coluna `read_at`** (grant por coluna); sem política de INSERT/DELETE para o cliente (só o trigger cria).
- `POST /api/notifications/read` — `{ ids: uuid[1..100] }` ou `{ all: true, category? }`; checagem de origem (CSRF), zod estrito, sessão obrigatória (401), filtro adicional por `user_id` da sessão, limite 60/min; idempotente.

## Interface
- **Sino** no cabeçalho com contador de não lidas (`9+` acima de 9) e rótulo acessível ("5 não lidas"); abre `/notificacoes`.
- `/notificacoes` (privada → `/login?next=/notificacoes`): título, mensagem, categoria, data de recebimento e estado de leitura; **Marcar como lida** (otimista, desfaz se falhar), **Abrir** (marca como lida e vai ao destino; só aparece quando há destino válido), **Marcar todas como lidas** (abrange todas as páginas), filtros por **categoria** e **estado** (todas/não lidas), paginação de 20, estados vazio / vazio com filtro ("Limpar filtros") / erro com "Tentar novamente"; "Configurar alertas" leva às preferências do Perfil. PT/EN, temas claro/escuro, mobile.

## Testes
- Unitários (138 no total): destino seguro, `9+`, tipos conhecidos, parâmetros, validação da API, conferências da migração (RLS, grant só de `read_at`, sem INSERT).
- E2E Notificações (**34**) + regressão de todas as etapas: rota privada, sino de visitante, conta sem notificações, lista/ordem/campos, contador, marcar uma (persistência + recarga), filtros (categoria, estado, combinados, inválidos), abrir → destino, sem botão Abrir sem destino, marcar todas, isolamento entre contas (inclusive tentativa de marcar notificação alheia), API (401, 403 de origem, 400, idempotência), `9+`, paginação, marcar todas em várias páginas, cadastro gerando boas-vindas, "Configurar alertas", EN/claro, mobile.
- **Não testado:** o trigger SQL em um Postgres/Supabase real (testado com mock do Supabase que simula RLS e a regra de coluna); validar com `supabase db push` em um projeto real.

## Pendências
Alertas de mercado/notícias dependem de fonte real e de regras definidas pelo produto; envio por e-mail/push exige serviço configurado (não implementado).
