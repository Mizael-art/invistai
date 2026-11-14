# Etapa 09 — Recuperação de senha (`/recuperar-senha`, `/redefinir-senha`)

## Fluxo
1. **Solicitar** (`/recuperar-senha`): e-mail (formato validado, `trim` + minúsculas) → `POST /api/auth/forgot` → `resetPasswordForEmail` no servidor.
2. **Mensagem de confirmação genérica e idêntica** ("Se existir uma conta com este e-mail, enviaremos as instruções…") para e-mails existentes e inexistentes — o servidor **não consulta se o e-mail existe**, e a API devolve o mesmo status/corpo nos dois casos (testado). Reenvio com **cooldown de 60 s**; envio duplo bloqueado.
3. **Link do e-mail:** `GET /auth/confirm?token_hash=…&type=recovery` → `verifyOtp({type:'recovery'})` (uso único) → cria a sessão de recuperação, grava o cookie **HttpOnly** `iv_recovery` (15 min) e redireciona **sempre** para `/redefinir-senha` (o parâmetro `next` é ignorado). Token inválido/expirado/já usado/malformado → `/recuperar-senha?link=invalid` com aviso.
4. **Redefinir** (`/redefinir-senha`): só abre o formulário com **cookie de recuperação + sessão válida**; caso contrário mostra "Link inválido ou expirado" com "Solicitar novo link" (inclui sessão revogada/expirada e quem está logado normalmente). Nova senha com os mesmos requisitos do cadastro (ao vivo), mostrar/ocultar. `POST /api/auth/reset-password` exige o cookie **e** a sessão, aplica `updateUser({password})` e, ao concluir, **encerra TODAS as sessões** (`signOut({scope:'global'})`) e remove os cookies. Resultado informado ("Senha alterada") com botão **Ir para o login**; a senha antiga deixa de funcionar e a nova funciona (testado).
Erros: senha fraca/vazada (provedor), **mesma senha da atual**, link expirado/usado, limite, indisponível.

## Segurança
- Sem enumeração de contas na resposta de sucesso. **Trade-off documentado:** se o provedor falhar ao enviar (SMTP) ou limitar a taxa, o app informa a falha — isso só ocorre em erro e pode, em tese, indicar que a conta existe (o Supabase só tenta enviar para contas existentes). Limites mitigam (1/min por IP+e-mail, 3/h por e-mail, 10/h por IP — `FORGOT_RATE_IP_PER_HOUR`; redefinição 10/15 min por IP; em memória, usar Redis em produção multi-instância).
- Origem checada (CSRF), JSON/entradas validadas com zod no servidor, nenhuma senha/e-mail registrados ou ecoados.
- **Limitação do modelo do Supabase:** o link de recuperação **autentica** o usuário (cria sessão). O cookie `iv_recovery` restringe a *troca de senha* a essa sessão, mas quem abrir o link já fica logado até o fim da redefinição ou do logout; por isso o link é de uso único e a redefinição encerra todas as sessões.

## Configuração necessária no Supabase
- Template **Reset password** com o link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` e **Site URL** correto.
- **SMTP próprio** e política de senha iguais às do app (veja `docs/ETAPA_08.md`). Defina a validade do link (OTP expiry) conforme o risco.

## Testes
- Unitários (101 no total): tipos de link (`recovery`), `otpTypeFor`, `forgotInput`/`resetInput`, `mapResetError`, bloqueio de `/redefinir-senha` como destino pós-login, cookie de recuperação.
- E2E Recuperação (**55**) contra o **mock do Supabase Auth**: validação sem chamar API; resposta idêntica para existente/inexistente (UI e API); provedor consultado nos dois casos; cooldown; limites (por e-mail/minuto, por IP); Origin/JSON/entradas inválidas; falhas (SMTP, limite, indisponível, não configurado); envio duplo; link válido (cookie HttpOnly, destino fixo, sem open redirect); requisitos ao vivo, mostrar/ocultar; senha vazia/fraca (cliente), fraca e igual à atual (servidor); sucesso (senha atualizada, **sessões globais encerradas**, cookies removidos); senha antiga falha/nova funciona; sessão normal não redefine; link reutilizado/inválido/curto/sem token; sessão de recuperação revogada; cookie forjado; EN/claro; mobile. + regressão: Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22, Login 51, Cadastro 61.
- **Não testado (sem Supabase/SMTP reais):** envio real do e-mail, validade real do link, formato exato das respostas do GoTrue e a política de senha do projeto.

## Pendências
Projeto Supabase/SMTP reais; o problema conhecido de hidratação (README / `docs/ETAPA_08.md`) segue em aberto.
