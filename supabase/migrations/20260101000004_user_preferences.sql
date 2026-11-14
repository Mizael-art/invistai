-- Preferências do usuário (categorias de notícias; categorias de notificações serão usadas em etapa futura).
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  news_categories text[] not null default '{}' check (news_categories <@ array['crypto','stocks','economy','forex']),
  notification_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy "prefs_select_own" on public.user_preferences for select using (auth.uid() = user_id);
create policy "prefs_insert_own" on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "prefs_update_own" on public.user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
