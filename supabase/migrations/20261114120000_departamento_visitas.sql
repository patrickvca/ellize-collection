-- Departamento de cada categoria (Coleções do menu) e contagem de visitas (Destaques do menu).

alter table public.categories add column department text not null default 'ambos'
  check (department in ('feminino', 'masculino', 'ambos'));

-- Valor inicial pelas peças já marcadas e, sem peças, pelo nome da categoria.
update public.categories c set department = case
  when c.slug in ('feminino', 'masculino') then 'ambos'
  when exists (select 1 from public.products p where p.tags @> array[c.slug, 'feminino'])
   and not exists (select 1 from public.products p where p.tags @> array[c.slug, 'masculino']) then 'feminino'
  when exists (select 1 from public.products p where p.tags @> array[c.slug, 'masculino'])
   and not exists (select 1 from public.products p where p.tags @> array[c.slug, 'feminino']) then 'masculino'
  when c.name ilike '%feminin%' then 'feminino'
  when c.name ilike '%masculin%' then 'masculino'
  else 'ambos'
end;

create table public.category_visits (
  slug text not null references public.categories (slug) on update cascade on delete cascade,
  day date not null default current_date,
  visits integer not null default 0,
  primary key (slug, day)
);
alter table public.category_visits enable row level security;
revoke all on public.category_visits from anon, authenticated;

-- Soma uma visita por categoria. O site chama uma vez por sessão para cada categoria.
create function public.register_category_visit(p_slugs text[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_slugs is null or coalesce(array_length(p_slugs, 1), 0) not between 1 and 5 then return; end if;
  insert into public.category_visits (slug, day, visits)
  select c.slug, current_date, 1 from public.categories c
  where c.slug = any (p_slugs) and c.slug not in ('feminino', 'masculino')
  on conflict (slug, day) do update set visits = public.category_visits.visits + 1;
end;
$function$;

-- As categorias mais acessadas nos últimos 30 dias, sem os departamentos.
create function public.top_categories(p_limit integer default 3)
returns table (slug text)
language sql
stable
security definer
set search_path to ''
as $function$
  select v.slug from public.category_visits v
  where v.day >= current_date - 30
  group by v.slug
  order by sum(v.visits) desc, v.slug
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$function$;

revoke all on function public.register_category_visit(text[]) from public;
revoke all on function public.top_categories(integer) from public;
grant execute on function public.register_category_visit(text[]) to anon, authenticated, service_role;
grant execute on function public.top_categories(integer) to anon, authenticated, service_role;
