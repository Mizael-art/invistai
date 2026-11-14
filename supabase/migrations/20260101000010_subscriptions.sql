-- =====================================================================
-- Etapa 1 (ecossistema) — planos, assinaturas, pagamentos, cota da TRADEON AI e administradores.
-- Regras:
--  * O cliente (anon/authenticated) só LÊ os próprios dados. Toda escrita de assinatura/pagamento vem do
--    servidor (webhook do provedor de pagamento validado) usando a service_role — nunca do navegador.
--  * O plano efetivo é calculado no banco (public.current_plan): assinatura paga e dentro do período.
--  * A cota gratuita da IA é consumida de forma atômica por public.ai_try_consume() com auth.uid():
--    vale por CONTA (não por sessão/navegador), então logout/login ou nova sessão não zeram o contador.
-- =====================================================================

-- Planos (catálogo). Preço em centavos; o ID de preço do provedor fica no servidor (variáveis de ambiente).
create table if not exists public.subscription_plans (
  id text primary key check (id in ('free','pro','max')),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL',
  interval text not null default 'month' check (interval in ('month')),
  ai_message_limit integer,                 -- null = ilimitado (sujeito a uso justo)
  features jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  active boolean not null default true
);
insert into public.subscription_plans (id, name, price_cents, ai_message_limit, features, sort) values
  ('free', 'Free', 0,    3,    '{"ai":"limited","calls":false,"vip_portfolios":false,"bots":false,"broker_api":false,"auto_calls":false}', 0),
  ('pro',  'Pro',  3000, null, '{"ai":"fair_use","calls":true,"vip_portfolios":true,"bots":false,"broker_api":false,"auto_calls":false}', 1),
  ('max',  'Max',  5000, null, '{"ai":"fair_use","calls":true,"vip_portfolios":true,"bots":true,"broker_api":true,"auto_calls":true}', 2)
on conflict (id) do update set name = excluded.name, price_cents = excluded.price_cents, ai_message_limit = excluded.ai_message_limit, features = excluded.features, sort = excluded.sort;
alter table public.subscription_plans enable row level security;
create policy "plans_read_all" on public.subscription_plans for select using (true);

-- Assinatura atual (uma por usuário). Status segue o provedor; o plano só vale se pago e no período.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free' references public.subscription_plans(id),
  status text not null default 'none' check (status in ('none','incomplete','active','trialing','past_due','canceled','unpaid','expired')),
  provider text check (provider in ('stripe')),
  provider_customer_id text,
  provider_subscription_id text unique,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,          -- renovação / vencimento
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions (provider_customer_id);
alter table public.subscriptions enable row level security;
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);

-- Pagamentos (faturas) confirmados/recusados/reembolsados pelo provedor.
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  provider_invoice_id text not null unique,
  plan_id text references public.subscription_plans(id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null,
  status text not null check (status in ('paid','failed','refunded','partially_refunded')),
  invoice_url text check (invoice_url is null or invoice_url ~ '^https://'),
  period_start timestamptz, period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists subscription_payments_user_idx on public.subscription_payments (user_id, created_at desc);
alter table public.subscription_payments enable row level security;
create policy "payments_select_own" on public.subscription_payments for select using (auth.uid() = user_id);

-- Histórico de mudanças de plano/status.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_plan text, to_plan text, from_status text, to_status text,
  reason text not null check (char_length(reason) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, created_at desc);
alter table public.subscription_events enable row level security;
create policy "sub_events_select_own" on public.subscription_events for select using (auth.uid() = user_id);

-- Idempotência dos webhooks: cada evento do provedor é processado uma única vez. Sem acesso do cliente.
create table if not exists public.payment_webhook_events (
  id text primary key,                      -- id do evento no provedor
  provider text not null,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.payment_webhook_events enable row level security;

-- Uso da TRADEON AI por conta.
create table if not exists public.ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_used integer not null default 0 check (messages_used >= 0),
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create policy "ai_usage_select_own" on public.ai_usage for select using (auth.uid() = user_id);

-- Administradores (concedido só pelo servidor/painel do banco) e auditoria.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy "admins_select_self" on public.app_admins for select using (auth.uid() = user_id);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text, target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
alter table public.admin_audit_logs enable row level security;

-- Privilégios: o cliente só lê; escritas apenas pela service_role (servidor).
revoke insert, update, delete, truncate on public.subscription_plans, public.subscriptions, public.subscription_payments, public.subscription_events,
  public.payment_webhook_events, public.ai_usage, public.app_admins, public.admin_audit_logs from anon, authenticated;
revoke all on public.subscriptions, public.subscription_payments, public.subscription_events, public.payment_webhook_events, public.ai_usage, public.app_admins, public.admin_audit_logs from anon;
revoke select on public.payment_webhook_events, public.admin_audit_logs from authenticated;

-- ----- Funções -----
-- Plano efetivo: pago/ativo e dentro do período (past_due mantém acesso até o fim do período já pago).
create or replace function public.current_plan(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.plan_id from public.subscriptions s
    where s.user_id = uid and s.plan_id in ('pro','max')
      and s.status in ('active','trialing','past_due')
      and (s.current_period_end is null or s.current_period_end > now())
  ), 'free');
$$;

create or replace function public.is_admin(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = uid);
$$;

-- Cota da IA do usuário logado (somente leitura).
create or replace function public.ai_quota() returns table (plan text, used integer, msg_limit integer, remaining integer)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text; lim integer; u integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  p := public.current_plan(uid);
  select ai_message_limit into lim from public.subscription_plans where id = p;
  select coalesce((select messages_used from public.ai_usage where user_id = uid), 0) into u;
  return query select p, u, lim, case when lim is null then null else greatest(lim - u, 0) end;
end $$;

-- Consome 1 mensagem de forma atômica. Retorna allowed=false quando a cota do plano acabou.
-- Usa auth.uid(): ninguém consome nem lê a cota de outra conta. O bloqueio de linha evita corrida entre abas/sessões.
create or replace function public.ai_try_consume() returns table (allowed boolean, plan text, used integer, msg_limit integer, remaining integer)
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text; lim integer; u integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.ai_usage (user_id) values (uid) on conflict (user_id) do nothing;
  select messages_used into u from public.ai_usage where user_id = uid for update;
  p := public.current_plan(uid);
  select ai_message_limit into lim from public.subscription_plans where id = p;
  if lim is not null and u >= lim then
    return query select false, p, u, lim, 0; return;
  end if;
  update public.ai_usage set messages_used = messages_used + 1, last_message_at = now(), updated_at = now() where user_id = uid returning messages_used into u;
  return query select true, p, u, lim, case when lim is null then null else greatest(lim - u, 0) end;
end $$;

revoke execute on function public.current_plan(uuid), public.is_admin(uuid) from public, anon, authenticated;
revoke execute on function public.ai_quota(), public.ai_try_consume() from public, anon;
grant execute on function public.ai_quota(), public.ai_try_consume() to authenticated;

-- Toda conta nova nasce no FREE (linha de assinatura 'none').
create or replace function public.create_free_subscription() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing; return new; end $$;
revoke execute on function public.create_free_subscription() from public, anon, authenticated;
create trigger on_auth_user_subscription after insert on auth.users for each row execute function public.create_free_subscription();
insert into public.subscriptions (user_id) select id from auth.users on conflict (user_id) do nothing;
