-- =====================================================================
-- Plano concedido por administrador (cortesia/parceria/teste). NÃO é pagamento:
--  * fica numa tabela própria (plan_grants), separada de subscriptions/payments — o histórico de cobrança não é tocado;
--  * só um administrador concede/remove (admin_set_plan), sempre auditado em admin_audit_logs;
--  * o plano efetivo passa a ser o MAIOR entre a assinatura paga válida e a concessão vigente;
--  * remover a concessão não cancela assinatura paga.
-- =====================================================================
create table if not exists public.plan_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('pro','max')),
  expires_at timestamptz,
  note text check (char_length(note) <= 200),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.plan_grants enable row level security;
create policy "plan_grants_select_own" on public.plan_grants for select using (auth.uid() = user_id);
revoke all on public.plan_grants from anon, authenticated;
grant select (user_id, plan_id, expires_at, granted_at) on public.plan_grants to authenticated;

create or replace function public.current_plan(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select p from (
      select s.plan_id p from public.subscriptions s
      where s.user_id = uid and s.plan_id in ('pro','max') and s.status in ('active','trialing','past_due')
        and (s.current_period_end is null or s.current_period_end > now())
      union all
      select g.plan_id from public.plan_grants g where g.user_id = uid and (g.expires_at is null or g.expires_at > now())
    ) x order by case p when 'max' then 2 when 'pro' then 1 else 0 end desc limit 1
  ), 'free');
$$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days integer default null, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); prev text;
begin
  if p_plan not in ('free','pro','max') then raise exception 'invalid_plan' using errcode = '22023'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'invalid_days' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  select plan_id into prev from public.plan_grants where user_id = p_user;
  if p_plan = 'free' then
    delete from public.plan_grants where user_id = p_user;
  else
    insert into public.plan_grants (user_id, plan_id, expires_at, note, granted_by)
    values (p_user, p_plan, case when p_days is null then null else now() + make_interval(days => p_days) end, left(p_note, 200), uid)
    on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at, note = excluded.note, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform public._audit(uid, case when p_plan = 'free' then 'plan.revoke' else 'plan.grant' end, 'user', p_user::text,
    jsonb_build_object('plan', p_plan, 'previous', prev, 'days', p_days, 'note', left(p_note, 200)));
end $$;

drop function if exists public.admin_list_users(text, integer, integer);
create function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, name text, created_at timestamptz, plan text, sub_status text, period_end timestamptz, ai_used integer, is_admin boolean,
  sub_plan text, grant_plan text, grant_expires timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  return query
  select u.id, u.email::text, pr.name, u.created_at, public.current_plan(u.id), s.status, s.current_period_end, coalesce(au.messages_used, 0),
    exists (select 1 from public.app_admins a where a.user_id = u.id), s.plan_id, g.plan_id, g.expires_at
  from auth.users u left join public.profiles pr on pr.id = u.id left join public.subscriptions s on s.user_id = u.id
    left join public.ai_usage au on au.user_id = u.id left join public.plan_grants g on g.user_id = u.id and (g.expires_at is null or g.expires_at > now())
  where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or pr.name ilike '%' || p_search || '%'
  order by u.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

revoke execute on function public.admin_set_plan(uuid, text, integer, text), public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, integer, text), public.admin_list_users(text, integer, integer) to authenticated;
