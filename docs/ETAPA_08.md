# Etapa 08 — Cadastro (`/cadastro`)

## Campos e validação (cliente **e** servidor, mesmo esquema zod)
- **Nome:** NFC, sem caracteres de controle, espaços colapsados; 2–100 caracteres com pelo menos uma letra (aceita acentos e alfabetos não latinos).
- **E-mail:** formato validado, `trim` + minúsculas.
- **Telefone:** `libphonenumber-js/min`, padrão **Brasil** (DDD + 8/9 dígitos, com ou sem `+55`, com máscara) **e internacional** com `+`. Normalizado para **E.164** (`+5511912345678`) e gravado em `profiles.phone` (migração `..0005`, valor inválido nunca bloqueia o cadastro). Biblioteca em modo permissivo (`/min`) para não rejeitar números válidos.
- **Senha:** requisitos mostrados ao vivo (≥8 caracteres, maiúscula, número, caractere especial; máx. 72 por limite do bcrypt), mostrar/ocultar. **Configure a mesma política no Supabase** (Auth → Passwords) para o servidor aplicar a regra também fora do app.
- Sem campo de confirmação de senha e sem aceite de "Termos" (não constam do escopo; não há páginas legais ainda).

## Fluxo
`POST /api/auth/register` (origem checada, zod, limites 3/h por e-mail e 10/h por IP — configurável via `REGISTER_RATE_IP_PER_HOUR`, em memória) → `signUp` no servidor com `name`/`phone` em `user_metadata` (o trigger cria o perfil). Respostas: `signed_in` (provedor devolveu sessão → vai ao Início), `confirmation_required` (tela "Verifique seu e-mail" com reenvio) ou erro seguro: e-mail já cadastrado (inclui a resposta ofuscada do Supabase, `identities: []`), senha fraca, limite, **falha de envio do e-mail (SMTP)**, indisponível, auth não configurada. A tela só diz "**Solicitamos** o envio" quando o provedor aceitou o pedido; **nunca** afirma envio em caso de erro ou sem Supabase configurado.
- **Reenvio:** `POST /api/auth/resend` (resposta genérica, 1/min por e-mail+IP, 5/h) com **cooldown visual de 60 s** e bloqueio de cliques repetidos; disponível na tela de sucesso, na tela de login quando o e-mail não está confirmado e no banner.
- **Estado da conta:** `SessionUser.emailConfirmed`; usuário com sessão e e-mail **não confirmado** vê o banner "Seu e-mail ainda não foi confirmado" (acesso liberado) com reenvio.
- **Link de confirmação:** `GET /auth/confirm?token_hash=…&type=email&next=/` → `verifyOtp`, cria a sessão e redireciona (destino seguro) com aviso "E-mail confirmado com sucesso"; link inválido/expirado, tipo não permitido ou token malformado → `/login?confirm=failed` com aviso.

## Configuração necessária no Supabase (e limitação da plataforma)
1. Template **Confirm signup**: link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/` e **Site URL** correto. Configure **SMTP próprio** (o SMTP padrão tem limites muito baixos).
2. **Regra do projeto "entrar antes de confirmar":** o Supabase Auth **não** oferece confirmação opcional nativa. Com *Confirm email* **ativo**: o e-mail é enviado e o login só funciona após confirmar. Com *Confirm email* **desativado**: a sessão é criada na hora, mas **nenhum e-mail de confirmação é enviado**. Para obter "acesso imediato + e-mail de confirmação" é preciso uma opção do provedor que permita login de e-mail não verificado (verifique na sua versão do painel) ou lógica própria. O app trata os três cenários (banner quando há sessão sem confirmação).
3. Política de senha igual à do app.

## Testes
- Unitários (94 no total): telefones BR/internacionais válidos e inválidos, nome, regras de senha, `registerInput` (normalização/rejeição), `mapSignUpError` (inclui o formato real do supabase-js para falha de SMTP), tipos de link de confirmação, migração, URL pública.
- E2E Cadastro (**61**) contra o **mock do Supabase Auth**: estrutura, requisitos ao vivo, validação local sem chamar API, 4 formatos de telefone → E.164, nome normalizado, confirmação obrigatória (cooldown, texto honesto), login de conta pendente + reenvio, conta que confirma e entra, confirmação desativada (login imediato), acesso antes da confirmação (banner persistente + reenvio), erros do servidor (6), e-mail existente com links, envio duplo (1 chamada), API (Origin, JSON/entradas inválidas, sem vazamento, limites por e-mail e IP), link de confirmação (válido, expirado, tipo/token inválidos, open redirect), sem Supabase, EN/claro, mobile. + regressão: Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22, Login 51.
- **Não testado (sem projeto Supabase real/SMTP):** o envio real do e-mail, o formato exato das respostas do GoTrue em produção e as políticas de senha/limites do projeto.

## Defeitos encontrados e corrigidos nesta etapa
1. **Redirects trocavam o host** (`req.nextUrl` usa o hostname interno → cookie perdido; em produção atrás de proxy quebraria login/confirmação). Agora usam o host público da requisição (`lib/publicUrl.ts`, aplicado também ao middleware do login).
2. O middleware tratava os cookies temporários PKCE (`code-verifier`) como sessão; agora só reage ao cookie `sb-*-auth-token`.
3. Falha de SMTP não era reconhecida (o supabase-js entrega 5xx como `AuthRetryableFetchError` sem `code`).

## Problema conhecido (não resolvido): erro de hidratação intermitente
Em cerca de 1 de cada 10 execuções do e2e de **Login** (nunca nas demais suítes) o teste "sem erros de JS" falha com **React #418 (hydration mismatch)**, sempre **sob carga de CPU** (instalação/compilação em paralelo ou carga artificial de teste). A reprodução com carga mostrou que o erro ocorre **no carregamento da própria Home logo após o login** (a URL `/mercado` ou `/noticias` registrada nos relatos antigos era só a página seguinte do teste). Não ocorre em condições normais (≥ 50 execuções) nem em 120 carregamentos em modo dev. Comparações do HTML do servidor com o DOM não mostraram diferença estrutural identificável (as primeiras comparações eram artefatos: atributos/estilos serializados de forma diferente e a API de requests do Playwright não envia cookies `Secure` por HTTP). O React recupera sozinho (re-renderiza no cliente), sem efeito funcional observado, **mas a causa não foi identificada**. Recomendação: antes de produção, reproduzir com Supabase real e em modo dev sob carga e examinar o diff completo do React na Home autenticada (blocos com `Suspense`: Indicadores, Gráfico, Destaques e Notícias); o teste `auth.py` pode falhar esporadicamente por isso.

## Pendências
Projeto Supabase/SMTP reais; páginas legais (Termos/Privacidade) se desejar aceite no cadastro; Recuperação de senha (Etapa 09) reaproveitará `/auth/confirm` e o reenvio.
