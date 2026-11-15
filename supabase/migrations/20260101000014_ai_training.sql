-- =====================================================================
-- "Treinar" a TRADEON AI sem fine-tuning: instruções extras, base de conhecimento (busca em texto completo, português)
-- e exemplos de pergunta/resposta. Tudo editável pelo painel admin.
--  * Nenhuma tabela é acessível ao cliente. Escrita: funções admin_* (verificam o administrador e auditam).
--  * Leitura pelo servidor da IA: funções protegidas pelo segredo de servidor (o conteúdo da base é da plataforma e não
--    pode ser baixado por usuários via API).
-- =====================================================================
create table if not exists public.ai_settings (
  key text primary key check (key in ('instructions')),
  value text not null default '' check (char_length(value) <= 12000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  source text check (char_length(source) <= 200),
  active boolean not null default true,
  chars integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_knowledge_chunks (
  id bigint generated always as identity primary key,
  doc_id uuid not null references public.ai_knowledge(id) on delete cascade,
  idx integer not null,
  content text not null check (char_length(content) between 1 and 4000),
  tsv tsvector generated always as (to_tsvector('portuguese', content)) stored,
  unique (doc_id, idx)
);
create index if not exists ai_knowledge_chunks_tsv_idx on public.ai_knowledge_chunks using gin (tsv);
create table if not exists public.ai_examples (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null check (char_length(answer) between 1 and 8000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
alter table public.ai_knowledge enable row level security;
alter table public.ai_knowledge_chunks enable row level security;
alter table public.ai_examples enable row level security;
revoke all on public.ai_settings, public.ai_knowledge, public.ai_knowledge_chunks, public.ai_examples from anon, authenticated;

-- Consulta "ou" (qualquer termo relevante) a partir do texto livre do usuário.
create or replace function public._kb_query(q text) returns tsquery language sql immutable set search_path = public as $$
  select nullif(replace(plainto_tsquery('portuguese', coalesce(q, ''))::text, ' & ', ' | '), '')::tsquery;
$$;

-- ----- Leitura pelo servidor da IA (segredo) -----
create or replace function public.ai_kb_search(secret text, q text, k integer default 4)
returns table (title text, source text, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare tq tsquery := public._kb_query(q);
begin
  perform public._billing_auth(secret);
  if tq is null then return; end if;
  return query select d.title, d.source, c.content, ts_rank(c.tsv, tq) r
    from public.ai_knowledge_chunks c join public.ai_knowledge d on d.id = c.doc_id
    where d.active and c.tsv @@ tq order by r desc, c.id limit least(greatest(k, 1), 8);
end $$;

create or replace function public.ai_training_config(secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._billing_auth(secret);
  return jsonb_build_object(
    'instructions', coalesce((select value from public.ai_settings where key = 'instructions'), ''),
    'examples', coalesce((select jsonb_agg(jsonb_build_object('q', question, 'a', answer) order by created_at) from (select * from public.ai_examples where active order by created_at limit 8) e), '[]'::jsonb),
    'docs', (select count(*) from public.ai_knowledge where active));
end $$;
revoke execute on function public.ai_kb_search(text, text, integer), public.ai_training_config(text) from public, anon;
grant execute on function public.ai_kb_search(text, text, integer), public.ai_training_config(text) to authenticated;

-- ----- Administração -----
create or replace function public.admin_ai_training() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'instructions', coalesce((select value from public.ai_settings where key = 'instructions'), ''),
    'instructions_updated_at', (select updated_at from public.ai_settings where key = 'instructions'),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'source', d.source, 'active', d.active, 'chars', d.chars,
              'chunks', (select count(*) from public.ai_knowledge_chunks c where c.doc_id = d.id), 'created_at', d.created_at) order by d.created_at desc) from public.ai_knowledge d), '[]'::jsonb),
    'examples', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'question', e.question, 'answer', e.answer, 'active', e.active, 'created_at', e.created_at) order by e.created_at) from public.ai_examples e), '[]'::jsonb));
end $$;

create or replace function public.admin_ai_set_instructions(p_text text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  insert into public.ai_settings (key, value, updated_by, updated_at) values ('instructions', coalesce(p_text, ''), uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = uid, updated_at = now();
  perform public._audit(uid, 'ai.instructions', 'ai', 'instructions', jsonb_build_object('chars', char_length(coalesce(p_text, ''))));
end $$;

create or replace function public.admin_ai_add_doc(p_title text, p_source text, p_chunks text[]) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); did uuid; i integer;
begin
  if p_chunks is null or array_length(p_chunks, 1) is null then raise exception 'empty_document' using errcode = '22023'; end if;
  if array_length(p_chunks, 1) > 400 then raise exception 'document_too_large' using errcode = '22023'; end if;
  insert into public.ai_knowledge (title, source, chars, created_by) values (p_title, nullif(p_source, ''), (select sum(char_length(x)) from unnest(p_chunks) x), uid) returning id into did;
  for i in 1 .. array_length(p_chunks, 1) loop insert into public.ai_knowledge_chunks (doc_id, idx, content) values (did, i, p_chunks[i]); end loop;
  perform public._audit(uid, 'ai.doc.add', 'ai_knowledge', did::text, jsonb_build_object('title', p_title, 'chunks', array_length(p_chunks, 1)));
  return did;
end $$;

create or replace function public.admin_ai_doc_set(p_id uuid, p_active boolean default null, p_delete boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  if not exists (select 1 from public.ai_knowledge where id = p_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_delete then delete from public.ai_knowledge where id = p_id; perform public._audit(uid, 'ai.doc.delete', 'ai_knowledge', p_id::text, null);
  else update public.ai_knowledge set active = coalesce(p_active, active), updated_at = now() where id = p_id; perform public._audit(uid, 'ai.doc.toggle', 'ai_knowledge', p_id::text, jsonb_build_object('active', p_active)); end if;
end $$;

create or replace function public.admin_ai_add_example(p_q text, p_a text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin(); eid uuid;
begin
  insert into public.ai_examples (question, answer, created_by) values (p_q, p_a, uid) returning id into eid;
  perform public._audit(uid, 'ai.example.add', 'ai_example', eid::text, null); return eid;
end $$;

create or replace function public.admin_ai_example_set(p_id uuid, p_active boolean default null, p_delete boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := public._require_admin();
begin
  if not exists (select 1 from public.ai_examples where id = p_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_delete then delete from public.ai_examples where id = p_id; else update public.ai_examples set active = coalesce(p_active, active) where id = p_id; end if;
  perform public._audit(uid, case when p_delete then 'ai.example.delete' else 'ai.example.toggle' end, 'ai_example', p_id::text, null);
end $$;

-- Prévia da busca (admin): mostra quais trechos a IA receberia para uma pergunta.
create or replace function public.admin_ai_kb_preview(q text) returns table (title text, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare tq tsquery := public._kb_query(q);
begin
  perform public._require_admin(); if tq is null then return; end if;
  return query select d.title, c.content, ts_rank(c.tsv, tq) r from public.ai_knowledge_chunks c join public.ai_knowledge d on d.id = c.doc_id
    where d.active and c.tsv @@ tq order by r desc, c.id limit 4;
end $$;

revoke execute on function public.admin_ai_training(), public.admin_ai_set_instructions(text), public.admin_ai_add_doc(text, text, text[]), public.admin_ai_doc_set(uuid, boolean, boolean),
  public.admin_ai_add_example(text, text), public.admin_ai_example_set(uuid, boolean, boolean), public.admin_ai_kb_preview(text) from public, anon;
grant execute on function public.admin_ai_training(), public.admin_ai_set_instructions(text), public.admin_ai_add_doc(text, text, text[]), public.admin_ai_doc_set(uuid, boolean, boolean),
  public.admin_ai_add_example(text, text), public.admin_ai_example_set(uuid, boolean, boolean), public.admin_ai_kb_preview(text) to authenticated;
