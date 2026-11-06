-- Rastreio, trocas e devoluções em até 7 dias e crédito na loja.

alter table public.orders
  add column tracking_code text,
  add column shipped_at timestamptz,
  add column delivered_at timestamptz,
  add column credit_cents integer not null default 0 check (credit_cents >= 0);

-- Um pedido pago inteiro com crédito fica com total zero.
alter table public.orders drop constraint orders_total_cents_check;
alter table public.orders add constraint orders_total_cents_check check (total_cents >= 0);

create table public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('devolucao', 'troca')),
  items text not null,
  reason text not null,
  status text not null default 'aberto' check (status in ('aberto', 'aprovado', 'recusado', 'concluido')),
  admin_note text,
  credit_cents integer not null default 0 check (credit_cents >= 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index order_requests_um_ativo on public.order_requests (order_id) where status in ('aberto', 'aprovado');
create index order_requests_user_idx on public.order_requests (user_id);
alter table public.order_requests enable row level security;
create policy "Cliente vê os próprios pedidos de troca" on public.order_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Administrador vê os pedidos de troca" on public.order_requests
  for select to authenticated using ((select private.is_admin()));
revoke all on public.order_requests from anon, authenticated;
grant select on public.order_requests to authenticated;

create table public.store_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount_cents integer not null check (amount_cents <> 0),
  reason text not null,
  order_id uuid references public.orders (id) on delete set null,
  request_id uuid references public.order_requests (id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index store_credits_user_idx on public.store_credits (user_id);
alter table public.store_credits enable row level security;
create policy "Cliente vê o próprio crédito" on public.store_credits
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Administrador vê os créditos" on public.store_credits
  for select to authenticated using ((select private.is_admin()));
revoke all on public.store_credits from anon, authenticated;
grant select on public.store_credits to authenticated;

-- As datas seguem o status, e cancelar devolve o crédito usado.
create function private.orders_ao_mudar_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status is not distinct from old.status then return new; end if;
  new.delivered_at := case when new.status = 'entregue' then now() end;
  new.shipped_at := case when new.status in ('enviado', 'entregue') then coalesce(old.shipped_at, now()) end;
  if new.status = 'cancelado' and old.credit_cents > 0 then
    insert into public.store_credits (user_id, amount_cents, reason, order_id)
    values (old.user_id, old.credit_cents, 'Devolvido do pedido cancelado #' || old.number, old.id);
    new.total_cents := new.total_cents + old.credit_cents;
    new.credit_cents := 0;
  end if;
  return new;
end;
$function$;
create trigger orders_ao_mudar_status before update on public.orders
  for each row execute function private.orders_ao_mudar_status();

drop function public.create_order(jsonb, text, text, text, uuid, text, text);
create function public.create_order(
  p_items jsonb, p_name text, p_phone text, p_payment text, p_quote uuid,
  p_address text default null, p_note text default null, p_use_credit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_quote public.shipping_quotes;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_size text;
  v_color text;
  v_available integer;
  v_card integer;
  v_pix integer;
  v_price integer;
  v_total integer := 0;
  v_pieces integer := 0;
  v_credit integer := 0;
begin
  if v_user is null then raise exception 'Entre na sua conta para fechar o pedido.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Sacola inválida.';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Informe seu nome.'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 10 and 13 then raise exception 'Informe um telefone com DDD.'; end if;
  if coalesce(p_payment, '') not in ('pix', 'cartao') then raise exception 'Escolha como quer pagar.'; end if;
  select * into v_quote from public.shipping_quotes q where q.id = p_quote and q.expires_at > now();
  if not found then raise exception 'Calcule o frete novamente para fechar o pedido.'; end if;
  if v_quote.kind <> 'retirada' and length(trim(coalesce(p_address, ''))) not between 10 and 300 then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'A observação está longa demais.'; end if;
  if (select count(*) from public.orders o where o.user_id = v_user and o.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Muitos pedidos em pouco tempo. Tente novamente em alguns minutos.';
  end if;

  insert into public.orders (user_id, customer_name, phone, delivery, payment_choice, address, note, total_cents,
                             shipping_cents, shipping_service, shipping_days, cep)
  values (v_user, trim(p_name), trim(p_phone), v_quote.kind, p_payment,
          case when v_quote.kind <> 'retirada' then trim(p_address) end, nullif(trim(coalesce(p_note, '')), ''), 1,
          v_quote.price_cents, v_quote.service, v_quote.days, v_quote.cep)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products p
      where p.id = (v_item->>'product_id')::uuid and p.active;
    if not found then raise exception 'Um produto da sacola não está mais disponível.'; end if;
    v_size := v_item->>'size';
    v_color := v_item->>'color';
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 10 then raise exception 'Quantidade inválida para %.', v_product.name; end if;
    v_available := coalesce((v_product.stock #>> array[v_color, v_size])::integer, 0);
    if v_available < v_qty then
      raise exception 'Estoque insuficiente para % (%, %). Disponível: %.', v_product.name, v_color, v_size, v_available;
    end if;
    v_card := coalesce(v_product.promo_price_cents, v_product.price_cents);
    v_pix := least(coalesce(v_product.promo_pix_price_cents, v_product.pix_price_cents, v_card), v_card);
    v_price := case when p_payment = 'pix' then v_pix else v_card end;
    insert into public.order_items (order_id, product_id, product_name, color, size, quantity, unit_price_cents, card_price_cents, pix_price_cents)
    values (v_order.id, v_product.id, v_product.name, v_color, v_size, v_qty, v_price, v_card, v_pix);
    v_total := v_total + v_qty * v_price;
    v_pieces := v_pieces + v_qty;
  end loop;

  if v_pieces <> v_quote.pieces then raise exception 'A sacola mudou. Calcule o frete novamente.'; end if;

  v_total := v_total + v_quote.price_cents;
  if p_use_credit then
    perform pg_advisory_xact_lock(hashtext(v_user::text));
    select least(greatest(coalesce(sum(c.amount_cents), 0), 0), v_total) into v_credit
      from public.store_credits c where c.user_id = v_user;
    if v_credit > 0 then
      insert into public.store_credits (user_id, amount_cents, reason, order_id)
      values (v_user, -v_credit, 'Usado no pedido #' || v_order.number, v_order.id);
    end if;
  end if;

  update public.orders set total_cents = v_total - v_credit, credit_cents = v_credit where id = v_order.id;
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total_cents', v_total - v_credit,
    'shipping_cents', v_quote.price_cents, 'credit_cents', v_credit);
end;
$function$;

revoke all on function public.create_order(jsonb, text, text, text, uuid, text, text, boolean) from public, anon;
grant execute on function public.create_order(jsonb, text, text, text, uuid, text, text, boolean) to authenticated, service_role;

-- O crédito usado continua descontado ao finalizar ou reabrir o pedido.
do $migration$
declare
  v_alvo text;
  v_antes text;
  v_depois text;
begin
  foreach v_alvo in array array[
    'public.admin_finalize_order(uuid, text, text, text)',
    'public.admin_set_order_status(uuid, text)'
  ] loop
    v_antes := pg_get_functiondef(v_alvo::regprocedure);
    v_depois := replace(v_antes,
      'total_cents = shipping_cents + (select sum(quantity * unit_price_cents) from public.order_items where order_id = p_order)',
      'total_cents = greatest(0, shipping_cents - credit_cents + (select sum(quantity * unit_price_cents) from public.order_items where order_id = p_order))');
    if v_depois = v_antes then raise exception 'Trecho do total não encontrado em %', v_alvo; end if;
    execute v_depois;
  end loop;
end;
$migration$;

create function public.admin_set_tracking(p_order uuid, p_code text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '');
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not v_order.stock_deducted then raise exception 'Finalize o pedido antes de informar o rastreio.'; end if;
  if v_order.status in ('cancelado', 'entregue') then raise exception 'Este pedido não aceita mais rastreio.'; end if;
  if v_code is not null and length(v_code) not between 5 and 40 then raise exception 'Código de rastreio inválido.'; end if;
  update public.orders
    set tracking_code = v_code, status = case when v_code is not null and status = 'pago' then 'enviado' else status end
    where id = p_order;
end;
$function$;

create function public.create_return_request(p_order uuid, p_kind text, p_items text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_id uuid;
begin
  if v_user is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if coalesce(p_kind, '') not in ('devolucao', 'troca') then raise exception 'Escolha entre troca e devolução.'; end if;
  if length(trim(coalesce(p_items, ''))) not between 2 and 1000 then raise exception 'Escolha as peças.'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then raise exception 'Conte o motivo.'; end if;
  select * into v_order from public.orders where id = p_order and user_id = v_user for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.status <> 'entregue' or v_order.delivered_at is null then raise exception 'O pedido ainda não foi entregue.'; end if;
  if now() > v_order.delivered_at + interval '7 days' then raise exception 'O prazo de 7 dias depois do recebimento terminou.'; end if;
  if exists (select 1 from public.order_requests r where r.order_id = p_order and r.status <> 'recusado') then
    raise exception 'Este pedido já tem uma solicitação de troca ou devolução.';
  end if;
  insert into public.order_requests (order_id, user_id, kind, items, reason)
  values (p_order, v_user, p_kind, trim(p_items), trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$function$;

create function public.admin_resolve_request(p_request uuid, p_status text, p_note text default null, p_credit_cents integer default 0)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request public.order_requests;
  v_order public.orders;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if coalesce(p_status, '') not in ('aprovado', 'recusado', 'concluido') then raise exception 'Situação inválida.'; end if;
  select * into v_request from public.order_requests where id = p_request for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_request.status in ('recusado', 'concluido') then raise exception 'Esta solicitação já foi encerrada.'; end if;
  if coalesce(p_credit_cents, 0) < 0 then raise exception 'Crédito inválido.'; end if;
  if coalesce(p_credit_cents, 0) > 0 and p_status <> 'concluido' then raise exception 'O crédito é lançado ao concluir.'; end if;
  select * into v_order from public.orders where id = v_request.order_id;
  if coalesce(p_credit_cents, 0) > v_order.total_cents + v_order.credit_cents then
    raise exception 'O crédito não pode passar do valor do pedido.';
  end if;
  if coalesce(p_credit_cents, 0) > 0 then
    insert into public.store_credits (user_id, amount_cents, reason, order_id, request_id, created_by)
    values (v_request.user_id, p_credit_cents, 'Crédito da troca do pedido #' || v_order.number, v_order.id, p_request, auth.uid());
  end if;
  update public.order_requests
    set status = p_status, admin_note = nullif(trim(coalesce(p_note, '')), ''), credit_cents = coalesce(p_credit_cents, 0),
        resolved_at = case when p_status in ('recusado', 'concluido') then now() end
    where id = p_request;
end;
$function$;

revoke all on function public.admin_set_tracking(uuid, text) from public, anon;
revoke all on function public.create_return_request(uuid, text, text, text) from public, anon;
revoke all on function public.admin_resolve_request(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_set_tracking(uuid, text) to authenticated, service_role;
grant execute on function public.create_return_request(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.admin_resolve_request(uuid, text, text, integer) to authenticated, service_role;

-- As contas ficam em auth.users, fora do alcance do site.
create function public.admin_list_customers()
returns table (
  customer_id uuid, customer_name text, customer_email text, customer_phone text,
  signed_up_at timestamptz, last_order_at timestamptz, order_count integer, spent_cents bigint, credit_cents bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  return query
  select u.id,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), ''), o.ultimo_nome),
    u.email::text, o.ultimo_telefone, u.created_at, o.ultimo_pedido,
    coalesce(o.pedidos, 0)::integer, coalesce(o.comprado, 0)::bigint, coalesce(c.saldo, 0)::bigint
  from auth.users u
  left join lateral (
    select count(*) as pedidos,
      sum(p.total_cents) filter (where p.stock_deducted and p.status <> 'cancelado') as comprado,
      max(p.created_at) as ultimo_pedido,
      (array_agg(p.customer_name order by p.created_at desc))[1] as ultimo_nome,
      (array_agg(p.phone order by p.created_at desc))[1] as ultimo_telefone
    from public.orders p where p.user_id = u.id
  ) o on true
  left join lateral (select sum(s.amount_cents) as saldo from public.store_credits s where s.user_id = u.id) c on true
  order by u.created_at desc;
end;
$function$;

revoke all on function public.admin_list_customers() from public, anon;
grant execute on function public.admin_list_customers() to authenticated, service_role;

-- Ajuste manual do crédito. O saldo nunca fica negativo, e o motivo aparece para o cliente.
create function public.admin_adjust_credit(p_user uuid, p_amount_cents integer, p_reason text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_balance bigint;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if coalesce(p_amount_cents, 0) = 0 then raise exception 'Informe o valor do ajuste.'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 200 then raise exception 'Informe o motivo do ajuste.'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'Cliente não encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select coalesce(sum(c.amount_cents), 0) into v_balance from public.store_credits c where c.user_id = p_user;
  if v_balance + p_amount_cents < 0 then raise exception 'O ajuste deixaria o saldo negativo.'; end if;
  insert into public.store_credits (user_id, amount_cents, reason, created_by)
  values (p_user, p_amount_cents, trim(p_reason), auth.uid());
  return v_balance + p_amount_cents;
end;
$function$;

revoke all on function public.admin_adjust_credit(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_credit(uuid, integer, text) to authenticated, service_role;
