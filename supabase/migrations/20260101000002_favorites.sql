-- Favoritos (ativos e notícias). Unicidade por usuário+tipo+item. RLS: somente o dono.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('asset','news')),
  item_id text not null check (char_length(item_id) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create index if not exists favorites_user_type_idx on public.favorites (user_id, item_type, created_at desc);
alter table public.favorites enable row level security;
create policy "favorites_select_own" on public.favorites for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on public.favorites for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.favorites for delete using (auth.uid() = user_id);
