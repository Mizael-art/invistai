# Etapa 07 — Login (`/login`)

## Arquitetura de autenticação (Supabase Auth, real)
- Login por **e-mail e senha** com `signInWithPassword` no **servidor** (`POST /api/auth/login`); a sessão fica em **cookies `HttpOnly`, `SameSite=Lax`** (`Secure` em produção) gerenciados por `@supabase/ssr`. O navegador nunca recebe tokens em JS nem a chave de serviço; só a **anon key** é usada (RLS protege os dados). **Não há login por Google/Apple.**
- **`middleware.ts`** (runtime Node): renova o access token (refresh) quando necessário e **protege rotas privadas no servidor** (`/perfil`, `/notificacoes`, `/favoritos` — lista em `lib/routes.ts`). Sem sessão → `/login?next=<rota>`; sessão **rejeitada** pelo provedor (JWT/refresh inválido) → `/login?next=…&expired=1` **e cookies limpos**; falha de rede/5xx do provedor **não desloga** o usuário.
- **Logout:** `POST /api/auth/logout` encerra **só a sessão atual** (`scope: local`) e limpa os cookies. Botão **Sair** no cabeçalho quando autenticado (iniciais do usuário no avatar).
- Estrutura de rotas por grupos: `app/(app)` (com sidebar/cabeçalho) e `app/(auth)` (tela cheia, sem sidebar, com alternância de idioma/tema).

## Tela de login — comportamentos
- Campos **E-mail** (obrigatório, formato validado, `trim` + minúsculas) e **Senha** (obrigatória, mostrar/ocultar com `aria-pressed`), rótulos reais, mensagens de erro acessíveis (`role="alert"`, `aria-invalid`, foco no primeiro campo inválido). Validação duplicada no **servidor** (zod).
- **Entrar:** valida; autentica; **impede envios repetidos** (trava síncrona + botão desabilitado); mensagens: credenciais inválidas (mesma mensagem para e-mail inexistente — não revela cadastro), e-mail não confirmado, limite de tentativas, provedor indisponível, falha de rede, auth não configurada. Em 401 limpa e foca a senha. Sucesso → redireciona a `?next=` (**só caminhos internos**; `//x`, `https://x`, `\`, `javascript:` e telas de auth/API caem em `/`).
- **Esqueci minha senha** → `/recuperar-senha` (Etapa 09; rota provisória). **Criar conta** → `/cadastro` (Etapa 08; provisória). Usuário já autenticado em `/login` é redirecionado.
- Aviso "Sua sessão expirou" quando `expired=1`.

## Segurança
Senha/e-mail **nunca** logados nem ecoados nas respostas; erros do provedor mapeados para categorias seguras (`lib/authErrors.ts`); **limite de tentativas** (8/min por IP+e-mail, 30/min por IP — em memória, trocar por Redis em produção multi-instância); checagem de **Origin** contra CSRF nas rotas que alteram estado; cookies HttpOnly; `service_role` jamais usada; env lido em runtime no servidor (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

## Configuração necessária no Supabase
1. Criar o projeto e definir `SUPABASE_URL`/`SUPABASE_ANON_KEY` (veja `.env.example`) e aplicar as migrações.
2. **Regra do projeto "acessar antes de confirmar o e-mail":** desative *Confirm email* em Auth → Providers → Email. Com a confirmação **ativada**, o login retorna "Confirme seu e-mail antes de entrar".
3. Ajuste os limites de taxa de Auth conforme o plano.

## Testes
- Unitários (76 no total): `safeNext`, `isPrivatePath`, `loginInput`, `mapAuthError`, `sameOrigin`.
- E2E Login (**51**) contra um **mock do Supabase Auth** (`tests/mock-supabase.mjs`): estrutura/links, validação local sem chamar a API, mostrar/ocultar senha, 5 tipos de falha, e-mail normalizado, sessão (cookie HttpOnly/Lax), cabeçalho, redirecionamentos (já autenticado, `next`, open redirect ×4), persistência entre páginas, rotas privadas (com e sem sessão), logout, envio duplo (1 chamada), sessão expirada (aviso + cookies limpos), **refresh de token**, API (Origin 403, JSON/entradas inválidas 400, resposta sem vazamento, limite 429), Supabase não configurado, EN/claro, mobile. + regressão: Início 30, Mercado 34, Detalhes 39, Notícias 35, Aprender 14, VIP 22.
- **Não testado (sem projeto/credenciais Supabase reais):** o login contra o Supabase de verdade (códigos de erro reais do GoTrue, política de confirmação de e-mail, limites do provedor). O mock segue o formato documentado do GoTrue; confirme com um projeto real.

## Pendências
Projeto Supabase e chaves; Cadastro (08) e Recuperação (09) substituem as rotas provisórias; páginas privadas reais nas Etapas 10, 11 e 13.
