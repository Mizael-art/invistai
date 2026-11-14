-- Cadastro: grava também o telefone (E.164) enviado em user_metadata no cadastro. Valor inválido é ignorado (nunca bloqueia o cadastro).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone) values (
    new.id,
    nullif(left(new.raw_user_meta_data->>'name', 120), ''),
    case when (new.raw_user_meta_data->>'phone') ~ '^\+[1-9][0-9]{6,14}$' then new.raw_user_meta_data->>'phone' else null end
  ) on conflict (id) do nothing;
  return new;
end $$;
