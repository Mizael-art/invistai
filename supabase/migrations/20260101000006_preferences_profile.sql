-- Perfil: tema/idioma passam a ser opcionais (NULL = o usuário ainda não escolheu; assim o login não sobrescreve a escolha local com um padrão).
alter table public.profiles alter column lang drop not null, alter column lang drop default;
alter table public.profiles alter column theme drop not null, alter column theme drop default;
update public.profiles set lang = null, theme = null;
-- Preferências: categorias de notificação limitadas às que existem no produto atual.
alter table public.user_preferences add constraint user_preferences_notif_categories check (notification_categories <@ array['market','news','account']);
