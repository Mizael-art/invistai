-- Etapa 15 — endurecimento (defesa em profundidade). A RLS já bloqueia, mas o papel do cliente não precisa destes privilégios:
-- notificações só são criadas/apagadas pelo sistema; TRUNCATE ignora RLS e nunca deve estar disponível ao cliente.
revoke insert, delete on public.notifications from anon, authenticated;
revoke truncate on public.profiles, public.favorites, public.user_preferences, public.notifications from anon, authenticated;
-- Visitantes (anon) não têm nada a fazer nas tabelas privadas.
revoke all on public.profiles, public.favorites, public.user_preferences, public.notifications from anon;
