-- A forma de pagamento é escolhida na tela de pagamento, depois de fechar o pedido.
-- Pix e boleto usam o valor do Pix; cartão usa o valor cheio.

alter table public.orders drop constraint orders_payment_choice_check;
alter table public.orders add constraint orders_payment_choice_check
  check (payment_choice = any (array['pix', 'cartao', 'boleto']));

create function public.set_order_payment(p_order uuid, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_bruto integer;
  v_credito integer;
begin
  if v_user is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if coalesce(p_choice, '') not in ('pix', 'cartao', 'boleto') then raise exception 'Escolha a forma de pagamento.'; end if;
  select * into v_order from public.orders where id = p_order and user_id = v_user for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.status <> 'novo' or v_order.stock_deducted or v_order.mp_status = 'approved' then
    raise exception 'Este pedido não está aguardando pagamento.';
  end if;

  update public.order_items
    set unit_price_cents = case when p_choice in ('pix', 'boleto') then pix_price_cents else card_price_cents end
    where order_id = p_order;
  select coalesce(sum(quantity * unit_price_cents), 0) + v_order.shipping_cents into v_bruto
    from public.order_items where order_id = p_order;

  -- Se o total ficar menor que o crédito usado, a sobra volta para a conta do cliente.
  v_credito := least(v_order.credit_cents, v_bruto);
  if v_order.credit_cents > v_credito then
    insert into public.store_credits (user_id, amount_cents, reason, order_id)
    values (v_user, v_order.credit_cents - v_credito, 'Sobra de crédito do pedido #' || v_order.number, v_order.id);
  end if;

  update public.orders
    set payment_choice = p_choice, credit_cents = v_credito, total_cents = v_bruto - v_credito
    where id = p_order;
  return jsonb_build_object('payment_choice', p_choice, 'total_cents', v_bruto - v_credito, 'credit_cents', v_credito);
end;
$function$;

revoke all on function public.set_order_payment(uuid, text) from public, anon;
grant execute on function public.set_order_payment(uuid, text) to authenticated, service_role;

-- Boleto tem o valor do Pix, então também não pode ser pago no cartão.
do $migration$
declare
  v_antes text := pg_get_functiondef('public.mp_register_payment(uuid, text, text, text, integer, text, text)'::regprocedure);
  v_depois text := replace(v_antes,
    'v_order.payment_choice = ''pix'' and p_method in (''credito'', ''debito'')',
    'v_order.payment_choice in (''pix'', ''boleto'') and p_method in (''credito'', ''debito'')');
begin
  if v_depois = v_antes then raise exception 'Regra do Pix não encontrada em mp_register_payment'; end if;
  execute v_depois;
end;
$migration$;

-- Endereços salvos por conta, com um padrão.
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  street text not null check (length(trim(street)) between 2 and 120),
  number text not null check (length(trim(number)) between 1 and 10),
  complement text check (complement is null or length(complement) <= 60),
  district text not null check (length(trim(district)) between 2 and 60),
  city text not null check (length(trim(city)) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses (user_id);
create unique index customer_addresses_um_padrao on public.customer_addresses (user_id) where is_default;
alter table public.customer_addresses enable row level security;
create policy "Cliente vê os próprios endereços" on public.customer_addresses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Cliente cria os próprios endereços" on public.customer_addresses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Cliente altera os próprios endereços" on public.customer_addresses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Cliente apaga os próprios endereços" on public.customer_addresses
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.customer_addresses from anon, authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

create function private.limitar_enderecos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select count(*) from public.customer_addresses a where a.user_id = new.user_id) >= 20 then
    raise exception 'Você pode salvar até 20 endereços.';
  end if;
  return new;
end;
$function$;
create trigger limitar_enderecos before insert on public.customer_addresses
  for each row execute function private.limitar_enderecos();

create function public.set_default_address(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if not exists (select 1 from public.customer_addresses a where a.id = p_id and a.user_id = v_user) then
    raise exception 'Endereço não encontrado.';
  end if;
  update public.customer_addresses set is_default = false where user_id = v_user and is_default and id <> p_id;
  update public.customer_addresses set is_default = true where id = p_id;
end;
$function$;

revoke all on function public.set_default_address(uuid) from public, anon;
grant execute on function public.set_default_address(uuid) to authenticated, service_role;
