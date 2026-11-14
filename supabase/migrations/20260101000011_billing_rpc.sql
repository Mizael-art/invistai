-- =====================================================================
-- Etapa 1 — escrita de cobrança SEM service_role no app.
-- O webhook do provedor (validado por assinatura no servidor) chama estas funções com um segredo de servidor
-- (BILLING_DB_SECRET). O banco guarda apenas o SHA-256 desse segredo em um esquema privado, fora da API.
-- Sem o segredo, nenhuma função altera plano/pagamento — nem o próprio usuário, nem visitantes.
-- Configuração (uma vez, pelo SQL Editor ou CLI):
--   insert into billing_private.settings (key, value) values ('secret_sha256', encode(sha256('<BILLING_DB_SECRET>'::bytea), 'hex'))
--   on conflict (key) do update set value = excluded.value;
-- =====================================================================
create schema if not exists billing_private;
revoke all on schema billing_private from public, anon, authenticated;
create table if not exists billing_private.settings (key text primary key, value text not null);
revoke all on billing_private.settings from public, anon, authenticated;

create or replace function public._billing_auth(secret text) returns void language plpgsql stable security definer set search_path = public, billing_private as $$
declare h text;
begin
  select value into h from billing_private.settings where key = 'secret_sha256';
  if h is null or secret is null or length(secret) < 32 or encode(sha256(convert_to(secret, 'UTF8')), 'hex') <> h then
    raise exception 'billing_forbidden' using errcode = '42501';
  end if;
end $$;

-- Idempotência: true se o evento ainda não tinha sido processado.
create or replace function public.billing_claim_event(secret text, p_event_id text, p_provider text, p_type text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  perform public._billing_auth(secret);
  insert into public.payment_webhook_events (id, provider, type) values (p_event_id, p_provider, left(p_type, 80)) on conflict (id) do nothing;
  get diagnostics n = row_count; return n = 1;
end $$;

-- Libera o evento para nova tentativa do provedor (quando o processamento falhou).
create or replace function public.billing_release_event(secret text, p_event_id text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin perform public._billing_auth(secret); delete from public.payment_webhook_events where id = p_event_id; end $$;

create or replace function public.billing_user_by_customer(secret text, p_customer text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid;
begin
  perform public._billing_auth(secret);
  select user_id into u from public.subscriptions where provider_customer_id = p_customer limit 1;
  return u;
end $$;

create or replace function public.billing_sync_subscription(secret text, p_user uuid, p_plan text, p_status text, p_provider text, p_customer text,
  p_subscription text, p_started timestamptz, p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean, p_canceled_at timestamptz, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare old record;
begin
  perform public._billing_auth(secret);
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'unknown_user' using errcode = '23503'; end if;
  select plan_id, status into old from public.subscriptions where user_id = p_user;
  insert into public.subscriptions as s (user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, started_at, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
  values (p_user, p_plan, p_status, p_provider, p_customer, p_subscription, p_started, p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false), p_canceled_at, now())
  on conflict (user_id) do update set plan_id = excluded.plan_id, status = excluded.status, provider = excluded.provider,
    provider_customer_id = coalesce(excluded.provider_customer_id, s.provider_customer_id), provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
    started_at = coalesce(s.started_at, excluded.started_at), current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at, updated_at = now();
  if old is null or old.plan_id is distinct from p_plan or old.status is distinct from p_status then
    insert into public.subscription_events (user_id, from_plan, to_plan, from_status, to_status, reason)
    values (p_user, old.plan_id, p_plan, old.status, p_status, left(coalesce(p_reason, 'sync'), 80));
  end if;
end $$;

-- Só vincula o cliente do provedor à conta (checkout concluído), sem mexer no plano.
create or replace function public.billing_link_customer(secret text, p_user uuid, p_provider text, p_customer text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  insert into public.subscriptions (user_id, provider, provider_customer_id) values (p_user, p_provider, p_customer)
  on conflict (user_id) do update set provider = excluded.provider, provider_customer_id = excluded.provider_customer_id, updated_at = now();
end $$;

create or replace function public.billing_record_payment(secret text, p_user uuid, p_provider text, p_invoice text, p_plan text, p_amount integer, p_currency text,
  p_status text, p_url text, p_period_start timestamptz, p_period_end timestamptz, p_paid_at timestamptz)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  insert into public.subscription_payments as p (user_id, provider, provider_invoice_id, plan_id, amount_cents, currency, status, invoice_url, period_start, period_end, paid_at)
  values (p_user, p_provider, p_invoice, p_plan, p_amount, lower(p_currency), p_status, case when p_url ~ '^https://' then p_url end, p_period_start, p_period_end, p_paid_at)
  on conflict (provider_invoice_id) do update set status = case when p.status in ('refunded','partially_refunded') then p.status else excluded.status end,
    amount_cents = excluded.amount_cents, invoice_url = coalesce(excluded.invoice_url, p.invoice_url), paid_at = coalesce(excluded.paid_at, p.paid_at),
    plan_id = coalesce(excluded.plan_id, p.plan_id);
end $$;

create or replace function public.billing_mark_refund(secret text, p_invoice text, p_full boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  update public.subscription_payments set status = case when p_full then 'refunded' else 'partially_refunded' end where provider_invoice_id = p_invoice;
end $$;

-- Chamadas pelo servidor com a chave pública (sem sessão); o segredo é a proteção. Não ficam visíveis a quem não o tem.
revoke execute on function public._billing_auth(text) from public, anon, authenticated;
grant execute on function public.billing_claim_event(text, text, text, text), public.billing_release_event(text, text), public.billing_user_by_customer(text, text),
  public.billing_sync_subscription(text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, text),
  public.billing_link_customer(text, uuid, text, text),
  public.billing_record_payment(text, uuid, text, text, text, integer, text, text, text, timestamptz, timestamptz, timestamptz),
  public.billing_mark_refund(text, text, boolean) to anon, authenticated;
