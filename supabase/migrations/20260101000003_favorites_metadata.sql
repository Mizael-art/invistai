-- Metadados de notícia favoritada (título, fonte, data, URL). Visíveis só ao dono (RLS já existente).
alter table public.favorites add column if not exists metadata jsonb;
alter table public.favorites add constraint favorites_metadata_size check (metadata is null or pg_column_size(metadata) <= 4096);
