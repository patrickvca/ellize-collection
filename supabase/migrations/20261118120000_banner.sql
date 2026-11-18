-- Configurações do site editáveis pelo painel. Começa com o banner da página inicial:
-- value = { "foto1": url ou null, "foto2": url ou null }. Sem url, o site usa as fotos padrão.

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

create policy "Configurações do site são públicas" on public.site_settings
  for select to anon, authenticated using (true);
create policy "Administrador altera as configurações do site" on public.site_settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

insert into public.site_settings (key, value) values ('banner', '{}'::jsonb);
