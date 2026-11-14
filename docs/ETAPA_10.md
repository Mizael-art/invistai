# Etapa 10 — Perfil e configurações (`/perfil`)

Rota **privada** (middleware + checagem na página). Layout com sidebar/cabeçalho do app.

## Dados pessoais
- Exibe **nome, e-mail e telefone**, estado do e-mail (confirmado/pendente, com reenvio) e "membro desde".
- **Editáveis: somente nome e telefone** (mesmas regras do cadastro; telefone normalizado para E.164). O **e-mail é somente leitura**. `PUT /api/profile` usa schema **estrito**: qualquer campo extra (`email`, `id`, `role`, `lang`…) → 400. Escrita no próprio perfil via RLS (`profiles`), com limite de 20/min e checagem de Origin.
- **Salvar** só habilita com alterações; **Cancelar** descarta (sem chamar a API); validação com foco; envio repetido bloqueado (uma única escrita).

## Preferências
- **Tema e idioma:** `PUT /api/preferences/app` grava em `profiles.theme/lang` **e** atualiza os cookies; a página recarrega para aplicar. O **login aplica as preferências da conta** no dispositivo (valem em outros dispositivos). Se o usuário **nunca salvou** uma preferência (`NULL`), o login **não** sobrescreve a escolha local. O botão de tema/idioma do cabeçalho, quando logado, também salva na conta. Sem modo automático.
- **Categorias de notícias:** `user_preferences.news_categories` (alimenta o feed "Para você" das Notícias — verificado em teste).
- **Categorias de notificações:** `user_preferences.notification_categories`, restritas ao que existe no produto (**Mercado, Notícias, Conta**; não há categorias de sinais/VIP/pagamentos porque esses módulos não existem). A tela informa que **o envio de notificações ainda não está ativo** — salvar a preferência não afirma envio.
- `PUT /api/preferences` aceita as duas listas de forma independente (zod estrito, RLS, limite 20/min).

## Sessões
**Encerrar outras sessões** (com confirmação em dois passos) usa o recurso real do Supabase Auth: `signOut({ scope: "others" })`; a sessão atual continua. Não há lista de sessões (o Supabase não expõe isso ao cliente) — nada é simulado. **Limitação documentada:** os outros dispositivos perdem a capacidade de renovar o acesso, mas um *access token* já emitido pode valer até expirar (≤ 1 h por padrão). O teste confirma, no mock, que a outra sessão deixa de funcionar.

## Exclusão da conta
Sem botão de exclusão imediata. A tela explica que a exclusão é por **solicitação ao suporte**; o botão vira um link `mailto:` real quando `SUPPORT_EMAIL` (runtime, servidor) está configurado e fica **desabilitado, com explicação**, caso contrário (não inventamos endereço).

## Banco
Migração `..0006`: `profiles.lang/theme` passam a aceitar `NULL` sem padrão (distingue "nunca escolheu"; zera valores existentes) e `user_preferences.notification_categories` ganha restrição às categorias existentes.

## Testes
- Unitários (111 no total): `profileInput` (estrito), `prefsInput`/`appPrefsInput`, cookies de preferência, migração.
- E2E Perfil (**52**) + regressão (Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22, Login 51, Cadastro 61, Recuperação 55): proteção da rota; dados exibidos; e-mail bloqueado (UI e API); salvar/cancelar/validação; telefone E.164 e nome normalizado; 3 envios → 1 escrita; persistência e saudação no Início; API (campos protegidos, 400/401/403/429); tema e idioma (conta + cookie + recarga); **outro dispositivo recebe as preferências no login**; sem preferência salva o login respeita a escolha local; cabeçalho salva na conta; categorias de notícias (persistem, integração com "Para você", remoção); categorias de notificações (só as existentes, aviso, persistência); sessões (confirmação, escopo `others`, atual preservada, **outra sessão realmente encerrada**); exclusão (sem e-mail → indisponível; com e-mail → `mailto`); e-mail não confirmado; EN/claro; mobile.
- **Não testado (sem Supabase real):** persistência real no Postgres/RLS, a política efetiva de `signOut('others')` e a validade de access tokens do projeto.

## Observação sobre testes
Nas suítes de autenticação o erro de hidratação **#418** (problema conhecido, `docs/ETAPA_08.md`) passou a ser reportado como **`WARN` explícito** (não mascarado: aparece no log) e não como falha; qualquer outro erro de JS continua falhando. Ele voltou a aparecer no e2e de perfil logo após carregar `/noticias` autenticado (não reproduzi isolado em ~200 navegações automáticas).

## Pendências
Supabase real; e-mail de suporte oficial (Etapa 14); notificações reais (Etapa 13); causa do #418.
