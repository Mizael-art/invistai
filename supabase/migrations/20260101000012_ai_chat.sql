-- =====================================================================
-- Etapa 2 (ecossistema) — TRADEON AI: conversas, mensagens, análises salvas e registro de uso.
--  * Conversas/mensagens: o usuário lê, cria e apaga só as próprias (RLS). Mensagens não são editáveis,
--    exceto a marcação "salva" (coluna saved).
--  * A cota é consumida por ai_try_consume() ANTES de chamar o modelo; se a chamada falhar, o servidor
--    devolve a mensagem com ai_release(secret) — protegido pelo segredo de servidor (o cliente não consegue
--    "devolver" mensagens para si mesmo).
--  * ai_requests: custo/uso por chamada (tokens, ferramentas, latência, erro) para o painel administrativo;
--    escrito só pelo servidor via ai_log_request(secret, ...). Sem leitura pelo cliente.
-- =====================================================================
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
create policy "ai_conv_select_own" on public.ai_conversations for select using (auth.uid() = user_id);
create policy "ai_conv_insert_own" on public.ai_conversations for insert with check (auth.uid() = user_id);
create policy "ai_conv_update_own" on public.ai_conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_conv_delete_own" on public.ai_conversations for delete using (auth.uid() = user_id);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 24000),
  blocks jsonb not null default '[]'::jsonb,          -- cartões de ativos, fontes e horários vindos das ferramentas
  saved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index if not exists ai_messages_saved_idx on public.ai_messages (user_id, created_at desc) where saved;
alter table public.ai_messages enable row level security;
create policy "ai_msg_select_own" on public.ai_messages for select using (auth.uid() = user_id);
create policy "ai_msg_insert_own" on public.ai_messages for insert with check (
  auth.uid() = user_id and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "ai_msg_update_own" on public.ai_messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_msg_delete_own" on public.ai_messages for delete using (auth.uid() = user_id);

revoke all on public.ai_conversations, public.ai_messages from anon;
revoke update on public.ai_conversations, public.ai_messages from authenticated;
grant update (title, updated_at) on public.ai_conversations to authenticated;
grant update (saved) on public.ai_messages to authenticated;

create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null, model text not null,
  input_tokens integer, output_tokens integer,
  tools text[] not null default '{}',
  status text not null check (status in ('ok','error','blocked')),
  error_code text, latency_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_created_idx on public.ai_requests (created_at desc);
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;

create or replace function public.ai_release(secret text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  perform public._billing_auth(secret);
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.ai_usage set messages_used = greatest(messages_used - 1, 0), updated_at = now() where user_id = uid;
end $$;

create or replace function public.ai_log_request(secret text, p_provider text, p_model text, p_in integer, p_out integer, p_tools text[], p_status text, p_error text, p_latency integer)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  insert into public.ai_requests (user_id, provider, model, input_tokens, output_tokens, tools, status, error_code, latency_ms)
  values (auth.uid(), left(p_provider, 40), left(p_model, 80), p_in, p_out, coalesce(p_tools[1:12], '{}'), p_status, left(p_error, 80), p_latency);
end $$;

revoke execute on function public.ai_release(text), public.ai_log_request(text, text, text, integer, integer, text[], text, text, integer) from public, anon;
grant execute on function public.ai_release(text), public.ai_log_request(text, text, text, integer, integer, text[], text, text, integer) to authenticated;
