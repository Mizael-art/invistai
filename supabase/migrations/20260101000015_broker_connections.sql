-- =====================================================================
-- Conexões com corretoras (Bybit, Binance). Credenciais cifradas no servidor (AES-256-GCM, chave fora do banco).
--  * O cliente lê SÓ metadados das próprias conexões (corretora, rótulo, dica da chave, permissões, status) — as colunas
--    cifradas não são legíveis por nenhum papel de cliente.
--  * Criar/ler credenciais/atualizar status: funções protegidas pelo segredo de servidor + auth.uid() (só a própria conta).
--  * Desconectar = apagar a linha (o cliente pode apagar as próprias). Autorização para bots: coluna editável pelo dono.
-- =====================================================================
create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exchange text not null check (exchange in ('bybit','binance')),
  label text not null default '' check (char_length(label) <= 60),
  key_hint text not null check (char_length(key_hint) <= 20),
  key_enc text not null, secret_enc text not null,
  permissions jsonb not null default '{}'::jsonb,
  can_trade boolean not null default false,
  ip_restricted boolean not null default false,
  bots_allowed boolean not null default false,
  status text not null default 'active' check (status in ('active','invalid')),
  last_error text check (char_length(last_error) <= 80),
  last_checked_at timestamptz, created_at timestamptz not null default now(),
  unique (user_id, exchange, key_hint)
);
create index if not exists broker_connections_user_idx on public.broker_connections (user_id);
alter table public.broker_connections enable row level security;
create policy "broker_select_own" on public.broker_connections for select using (auth.uid() = user_id);
create policy "broker_delete_own" on public.broker_connections for delete using (auth.uid() = user_id);
create policy "broker_update_own" on public.broker_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.broker_connections from anon, authenticated;
grant select (id, user_id, exchange, label, key_hint, permissions, can_trade, ip_restricted, bots_allowed, status, last_error, last_checked_at, created_at) on public.broker_connections to authenticated;
grant delete on public.broker_connections to authenticated;
grant update (label, bots_allowed) on public.broker_connections to authenticated;

create or replace function public.broker_save(secret text, p_exchange text, p_label text, p_key_hint text, p_key_enc text, p_secret_enc text, p_permissions jsonb, p_can_trade boolean, p_ip_restricted boolean)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  perform public._billing_auth(secret);
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if (p_permissions->>'withdraw')::boolean is true then raise exception 'withdraw_enabled' using errcode = '22023'; end if;
  if (select count(*) from public.broker_connections where user_id = uid) >= 5 then raise exception 'too_many_connections' using errcode = '22023'; end if;
  insert into public.broker_connections (user_id, exchange, label, key_hint, key_enc, secret_enc, permissions, can_trade, ip_restricted, last_checked_at)
  values (uid, p_exchange, left(coalesce(p_label, ''), 60), p_key_hint, p_key_enc, p_secret_enc, coalesce(p_permissions, '{}'::jsonb), coalesce(p_can_trade, false), coalesce(p_ip_restricted, false), now())
  on conflict (user_id, exchange, key_hint) do update set key_enc = excluded.key_enc, secret_enc = excluded.secret_enc, permissions = excluded.permissions,
    can_trade = excluded.can_trade, ip_restricted = excluded.ip_restricted, status = 'active', last_error = null, last_checked_at = now(), label = excluded.label
  returning id into cid;
  return cid;
end $$;

create or replace function public.broker_credentials(secret text, p_id uuid) returns table (exchange text, key_enc text, secret_enc text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  return query select c.exchange, c.key_enc, c.secret_enc from public.broker_connections c where c.id = p_id and c.user_id = auth.uid();
end $$;

create or replace function public.broker_mark(secret text, p_id uuid, p_status text, p_permissions jsonb, p_error text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  update public.broker_connections set status = p_status, permissions = coalesce(p_permissions, permissions), last_error = left(p_error, 80), last_checked_at = now(),
    can_trade = coalesce((p_permissions->>'spotTrade')::boolean or (p_permissions->>'futuresTrade')::boolean, can_trade),
    bots_allowed = case when p_status = 'invalid' then false else bots_allowed end
  where id = p_id and user_id = auth.uid();
end $$;

revoke execute on function public.broker_save(text, text, text, text, text, text, jsonb, boolean, boolean), public.broker_credentials(text, uuid), public.broker_mark(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.broker_save(text, text, text, text, text, text, jsonb, boolean, boolean), public.broker_credentials(text, uuid), public.broker_mark(text, uuid, text, jsonb, text) to authenticated;
