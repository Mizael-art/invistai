-- Central de notificações INTERNAS. Somente o sistema cria notificações (triggers / service role); o usuário só lê e marca como lida.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),                 -- código do evento (texto traduzido pelo app)
  category text not null check (category in ('market','news','account')),       -- só categorias que existem no produto
  title text check (char_length(title) <= 200),                                 -- opcional: texto livre para tipos futuros
  message text check (char_length(message) <= 1000),
  target text check (target is null or (target ~ '^/[A-Za-z0-9/_?=&%.-]*$' and target !~ '^//' and char_length(target) <= 300)),  -- só caminhos internos
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Sem política de INSERT/DELETE para usuários. E o usuário só pode alterar a coluna read_at:
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Eventos reais da conta que geram notificação interna (nenhuma notificação financeira é criada aqui).
create or replace function public.notify_account_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, category, target) values (new.id, 'welcome', 'account', '/perfil');
  elsif tg_op = 'UPDATE' then
    if old.email_confirmed_at is null and new.email_confirmed_at is not null then
      insert into public.notifications (user_id, kind, category, target) values (new.id, 'email_confirmed', 'account', '/perfil');
    end if;
    if old.encrypted_password is distinct from new.encrypted_password and old.encrypted_password is not null then
      insert into public.notifications (user_id, kind, category, target) values (new.id, 'password_changed', 'account', '/perfil');
    end if;
  end if;
  return new;
end $$;
create trigger on_auth_user_notify_insert after insert on auth.users for each row execute function public.notify_account_events();
create trigger on_auth_user_notify_update after update on auth.users for each row execute function public.notify_account_events();
