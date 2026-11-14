-- Perfis: 1:1 com auth.users. RLS: cada usuário lê/edita apenas o próprio perfil.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text check (char_length(name) <= 120),
  phone text check (char_length(phone) <= 30),
  lang text not null default 'pt' check (lang in ('pt','en')),
  theme text not null default 'dark' check (theme in ('dark','light')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Cria o perfil automaticamente no cadastro (usa metadata.name quando enviada).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, nullif(left(new.raw_user_meta_data->>'name', 120), '')) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
