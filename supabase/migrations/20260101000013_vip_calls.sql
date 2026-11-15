-- =====================================================================
-- Etapa 3 (ecossistema) — CALLS VIP + funções administrativas.
--  * Leitura: assinantes PRO/MAX veem calls publicadas (não rascunhos); administradores veem tudo.
--  * Escrita: SOMENTE por funções administrativas (security definer) que validam o administrador (auth.uid()),
--    validam os níveis (LONG: stop < entrada < TP1 < TP2 < TP3 < TP4; SHORT: o inverso), registram o histórico
--    da call e a auditoria administrativa. O cliente não tem INSERT/UPDATE/DELETE nas tabelas.
--  * Resultados: calculados no banco a partir dos preços REGISTRADOS (entrada e saída), da alavancagem e do
--    custo informado (ida+volta, % do nocional). Bruto e líquido separados; líquido só existe se o custo for informado.
-- =====================================================================

-- Funções de contexto do próprio usuário (seguras para expor: só respondem sobre quem chama).
create or replace function public.am_admin() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_admin(auth.uid());
$$;
create or replace function public.my_plan() returns text language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'free' else public.current_plan(auth.uid()) end;
$$;
revoke execute on function public.am_admin(), public.my_plan() from public, anon;
grant execute on function public.am_admin(), public.my_plan() to authenticated;

create table if not exists public.vip_calls (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('crypto_spot','crypto_futures','forex','stocks_br','stocks_intl')),
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,12}(/[A-Z0-9]{1,12})?$'),
  direction text not null check (direction in ('long','short')),
  entry numeric not null check (entry > 0),
  stop numeric not null check (stop > 0),
  tp1 numeric not null check (tp1 > 0),
  tp2 numeric check (tp2 > 0), tp3 numeric check (tp3 > 0), tp4 numeric check (tp4 > 0),
  leverage numeric check (leverage is null or (leverage >= 1 and leverage <= 125)),
  notes text check (char_length(notes) <= 2000),
  analyst text check (char_length(analyst) <= 120),                -- responsável técnico pela call (exibido ao assinante)
  status text not null default 'draft' check (status in ('draft','active','closed','canceled')),
  targets_hit smallint not null default 0 check (targets_hit between 0 and 4),
  stop_hit boolean not null default false,
  exit_price numeric check (exit_price is null or exit_price > 0),
  close_reason text check (close_reason in ('stop','targets','manual')),
  fees_pct numeric check (fees_pct is null or (fees_pct >= 0 and fees_pct <= 10)),
  gross_result_pct numeric, net_result_pct numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz, closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint vip_calls_levels check (
    case direction
      when 'long' then stop < entry and entry < tp1 and (tp2 is null or tp2 > tp1) and (tp3 is null or (tp2 is not null and tp3 > tp2)) and (tp4 is null or (tp3 is not null and tp4 > tp3))
      else stop > entry and entry > tp1 and (tp2 is null or tp2 < tp1) and (tp3 is null or (tp2 is not null and tp3 < tp2)) and (tp4 is null or (tp3 is not null and tp4 < tp3))
    end),
  constraint vip_calls_leverage_market check (leverage is null or market in ('crypto_futures','forex')),
  constraint vip_calls_closed check ((status = 'closed') = (exit_price is not null and close_reason is not null and closed_at is not null))
);
create index if not exists vip_calls_status_idx on public.vip_calls (status, published_at desc);
create index if not exists vip_calls_symbol_idx on public.vip_calls (symbol, published_at desc);
alter table public.vip_calls enable row level security;
create policy "vip_calls_read" on public.vip_calls for select using (public.am_admin() or (status <> 'draft' and public.my_plan() in ('pro','max')));

create table if not exists public.vip_call_events (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.vip_calls(id) on delete cascade,
  type text not null check (type in ('created','published','edited','tp_hit','stop_hit','closed','canceled','note')),
  tp_index smallint check (tp_index between 1 and 4),
  price numeric check (price is null or price > 0),
  note text check (char_length(note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vip_call_events_call_idx on public.vip_call_events (call_id, created_at);
alter table public.vip_call_events enable row level security;
create policy "vip_call_events_read" on public.vip_call_events for select using (
  public.am_admin() or (type <> 'created' and exists (select 1 from public.vip_calls c where c.id = call_id and c.status <> 'draft' and public.my_plan() in ('pro','max'))));

revoke all on public.vip_calls, public.vip_call_events from anon;
revoke insert, update, delete, truncate on public.vip_calls, public.vip_call_events from authenticated;

-- ----- Funções administrativas -----
create or replace function public._require_admin() returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin(uid) then raise exception 'admin_required' using errcode = '42501'; end if;
  return uid;
end $$;
revoke execute on function public._require_admin() from public, anon, authenticated;

create or replace function public._audit(p_admin uuid, p_action text, p_type text, p_id text, p_details jsonb) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details) values (p_admin, p_action, p_type, p_id, p_details);
$$;
revoke execute on function public._audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Resultado percentual sobre a margem: direção × (saída − entrada) / entrada × alavancagem; líquido desconta o custo × alavancagem.
create or replace function public.vip_call_result(p_dir text, p_entry numeric, p_exit numeric, p_lev numeric, p_fees numeric, out gross numeric, out net numeric)
language sql immutable set search_path = public as $$
  select round(((case when p_dir = 'long' then 1 else -1 end) * (p_exit - p_entry) / p_entry * 100 * coalesce(p_lev, 1))::numeric, 4),
         case when p_fees is null then null else round((((case when p_dir = 'long' then 1 else -1 end) * (p_exit - p_entry) / p_entry * 100 - p_fees) * coalesce(p_lev, 1))::numeric, 4) end;
$$;

-- Cria uma call (rascunho ou já publicada). p: {market, symbol, direction, entry, stop, tp1..tp4, leverage, notes, analyst}
create or replace function public.admin_create_call(p jsonb, p_publish boolean default false) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); cid uuid;
begin
  insert into public.vip_calls (market, symbol, direction, entry, stop, tp1, tp2, tp3, tp4, leverage, notes, analyst, created_by)
  values (p->>'market', upper(p->>'symbol'), p->>'direction', (p->>'entry')::numeric, (p->>'stop')::numeric, (p->>'tp1')::numeric,
    nullif(p->>'tp2','')::numeric, nullif(p->>'tp3','')::numeric, nullif(p->>'tp4','')::numeric, nullif(p->>'leverage','')::numeric,
    nullif(p->>'notes',''), nullif(p->>'analyst',''), uid)
  returning id into cid;
  insert into public.vip_call_events (call_id, type, created_by) values (cid, 'created', uid);
  perform public._audit(uid, 'vip_call.create', 'vip_call', cid::text, p);
  if p_publish then perform public.admin_publish_call(cid); end if;
  return cid;
end $$;

create or replace function public.admin_update_call(p_id uuid, p jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); st text;
begin
  select status into st from public.vip_calls where id = p_id for update;
  if st is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st not in ('draft','active') then raise exception 'call_finished' using errcode = '22023'; end if;
  update public.vip_calls set market = p->>'market', symbol = upper(p->>'symbol'), direction = p->>'direction', entry = (p->>'entry')::numeric, stop = (p->>'stop')::numeric,
    tp1 = (p->>'tp1')::numeric, tp2 = nullif(p->>'tp2','')::numeric, tp3 = nullif(p->>'tp3','')::numeric, tp4 = nullif(p->>'tp4','')::numeric,
    leverage = nullif(p->>'leverage','')::numeric, notes = nullif(p->>'notes',''), analyst = nullif(p->>'analyst',''), updated_at = now()
  where id = p_id;
  if st = 'active' then insert into public.vip_call_events (call_id, type, note, created_by) values (p_id, 'edited', left(nullif(p->>'edit_note',''), 1000), uid); end if;
  perform public._audit(uid, 'vip_call.update', 'vip_call', p_id::text, p);
end $$;

create or replace function public.admin_publish_call(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); c public.vip_calls;
begin
  select * into c from public.vip_calls where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  update public.vip_calls set status = 'active', published_at = now(), updated_at = now() where id = p_id;
  insert into public.vip_call_events (call_id, type, price, created_by) values (p_id, 'published', c.entry, uid);
  -- Notifica os assinantes com plano PRO/MAX vigente (mesma regra de current_plan).
  insert into public.notifications (user_id, kind, category, title, message, target)
  select s.user_id, 'vip_call', 'market', left(format('Nova call: %s %s', upper(c.direction), c.symbol), 200),
    left(format('Entrada %s · Stop %s · TP1 %s', c.entry, c.stop, c.tp1), 1000), '/calls/' || p_id
  from public.subscriptions s where public.current_plan(s.user_id) in ('pro','max');
  perform public._audit(uid, 'vip_call.publish', 'vip_call', p_id::text, null);
end $$;

create or replace function public.admin_hit_target(p_id uuid, p_tp smallint, p_price numeric default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); c public.vip_calls; lvl numeric;
begin
  select * into c from public.vip_calls where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  lvl := case p_tp when 1 then c.tp1 when 2 then c.tp2 when 3 then c.tp3 when 4 then c.tp4 end;
  if lvl is null then raise exception 'invalid_target' using errcode = '22023'; end if;
  if p_tp <> c.targets_hit + 1 then raise exception 'target_out_of_order' using errcode = '22023'; end if;
  update public.vip_calls set targets_hit = p_tp, updated_at = now() where id = p_id;
  insert into public.vip_call_events (call_id, type, tp_index, price, created_by) values (p_id, 'tp_hit', p_tp, coalesce(p_price, lvl), uid);
  perform public._audit(uid, 'vip_call.tp_hit', 'vip_call', p_id::text, jsonb_build_object('tp', p_tp, 'price', coalesce(p_price, lvl)));
end $$;

-- Encerra: 'stop' (saída padrão = stop), 'targets' (saída padrão = último alvo atingido) ou 'manual' (saída obrigatória).
create or replace function public.admin_close_call(p_id uuid, p_reason text, p_exit numeric default null, p_fees numeric default null, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); c public.vip_calls; ex numeric; r record;
begin
  select * into c from public.vip_calls where id = p_id for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'active' then raise exception 'not_active' using errcode = '22023'; end if;
  if p_reason not in ('stop','targets','manual') then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if p_reason = 'targets' and c.targets_hit = 0 then raise exception 'no_targets_hit' using errcode = '22023'; end if;
  ex := coalesce(p_exit, case p_reason when 'stop' then c.stop when 'targets' then
          case c.targets_hit when 1 then c.tp1 when 2 then c.tp2 when 3 then c.tp3 when 4 then c.tp4 end end);
  if ex is null or ex <= 0 then raise exception 'exit_required' using errcode = '22023'; end if;
  select * into r from public.vip_call_result(c.direction, c.entry, ex, c.leverage, p_fees);
  update public.vip_calls set status = 'closed', exit_price = ex, close_reason = p_reason, fees_pct = p_fees, stop_hit = (p_reason = 'stop'),
    gross_result_pct = r.gross, net_result_pct = r.net, closed_at = now(), updated_at = now() where id = p_id;
  if p_reason = 'stop' then insert into public.vip_call_events (call_id, type, price, created_by) values (p_id, 'stop_hit', ex, uid); end if;
  insert into public.vip_call_events (call_id, type, price, note, created_by) values (p_id, 'closed', ex, left(p_note, 1000), uid);
  perform public._audit(uid, 'vip_call.close', 'vip_call', p_id::text, jsonb_build_object('reason', p_reason, 'exit', ex, 'fees', p_fees, 'gross', r.gross, 'net', r.net));
end $$;

create or replace function public.admin_cancel_call(p_id uuid, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); st text;
begin
  select status into st from public.vip_calls where id = p_id for update;
  if st is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st not in ('draft','active') then raise exception 'call_finished' using errcode = '22023'; end if;
  update public.vip_calls set status = 'canceled', updated_at = now() where id = p_id;
  insert into public.vip_call_events (call_id, type, note, created_by) values (p_id, 'canceled', left(p_note, 1000), uid);
  perform public._audit(uid, 'vip_call.cancel', 'vip_call', p_id::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_add_call_note(p_id uuid, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  if not exists (select 1 from public.vip_calls where id = p_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.vip_call_events (call_id, type, note, created_by) values (p_id, 'note', left(p_note, 1000), uid);
  perform public._audit(uid, 'vip_call.note', 'vip_call', p_id::text, jsonb_build_object('note', p_note));
end $$;

-- ----- Painel administrativo geral (somente leitura agregada + gestão de administradores) -----
create or replace function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'plans', (select jsonb_object_agg(p, n) from (select public.current_plan(u.id) p, count(*) n from auth.users u group by 1) x),
    'subscriptions', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.subscriptions group by status) x),
    'mrr_cents', (select coalesce(sum(sp.price_cents), 0) from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                   where s.status in ('active','trialing','past_due') and s.plan_id in ('pro','max') and (s.current_period_end is null or s.current_period_end > now())),
    'canceled_30d', (select count(*) from public.subscription_events where to_status = 'canceled' and created_at > now() - interval '30 days'),
    'payments_30d', (select jsonb_object_agg(status, jsonb_build_object('n', n, 'cents', cents)) from (select status, count(*) n, sum(amount_cents) cents from public.subscription_payments where created_at > now() - interval '30 days' group by status) x),
    'ai_30d', (select jsonb_build_object('requests', count(*), 'errors', count(*) filter (where status = 'error'), 'blocked', count(*) filter (where status = 'blocked'),
                'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0), 'avg_latency_ms', round(avg(latency_ms) filter (where status = 'ok')))
               from public.ai_requests where created_at > now() - interval '30 days'),
    'calls', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.vip_calls group by status) x),
    'generated_at', now());
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, name text, created_at timestamptz, plan text, sub_status text, period_end timestamptz, ai_used integer, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  return query
  select u.id, u.email::text, pr.name, u.created_at, public.current_plan(u.id), s.status, s.current_period_end, coalesce(au.messages_used, 0), exists (select 1 from public.app_admins a where a.user_id = u.id)
  from auth.users u left join public.profiles pr on pr.id = u.id left join public.subscriptions s on s.user_id = u.id left join public.ai_usage au on au.user_id = u.id
  where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or pr.name ilike '%' || p_search || '%'
  order by u.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  if p_user = uid and not p_admin then raise exception 'cannot_remove_self' using errcode = '22023'; end if;
  if p_admin then insert into public.app_admins (user_id, granted_by) values (p_user, uid) on conflict (user_id) do nothing;
  else delete from public.app_admins where user_id = p_user; end if;
  perform public._audit(uid, case when p_admin then 'admin.grant' else 'admin.revoke' end, 'user', p_user::text, null);
end $$;

create or replace function public.admin_audit(p_limit integer default 50) returns setof public.admin_audit_logs
language plpgsql stable security definer set search_path = public as $$
begin perform public._require_admin(); return query select * from public.admin_audit_logs order by created_at desc limit least(greatest(p_limit, 1), 200); end $$;

revoke execute on function public.admin_create_call(jsonb, boolean), public.admin_update_call(uuid, jsonb), public.admin_publish_call(uuid), public.admin_hit_target(uuid, smallint, numeric),
  public.admin_close_call(uuid, text, numeric, numeric, text), public.admin_cancel_call(uuid, text), public.admin_add_call_note(uuid, text),
  public.admin_overview(), public.admin_list_users(text, integer, integer), public.admin_set_admin(uuid, boolean), public.admin_audit(integer) from public, anon;
grant execute on function public.admin_create_call(jsonb, boolean), public.admin_update_call(uuid, jsonb), public.admin_publish_call(uuid), public.admin_hit_target(uuid, smallint, numeric),
  public.admin_close_call(uuid, text, numeric, numeric, text), public.admin_cancel_call(uuid, text), public.admin_add_call_note(uuid, text),
  public.admin_overview(), public.admin_list_users(text, integer, integer), public.admin_set_admin(uuid, boolean), public.admin_audit(integer) to authenticated;
