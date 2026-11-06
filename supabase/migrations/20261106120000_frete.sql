-- Frete no pedido: cotações feitas no servidor e valor somado ao total.

alter table public.orders
  add column shipping_cents integer not null default 0 check (shipping_cents >= 0),
  add column shipping_service text,
  add column shipping_days integer,
  add column cep text;

alter table public.orders drop constraint orders_delivery_check;
alter table public.orders add constraint orders_delivery_check
  check (delivery = any (array['retirada', 'envio', 'local', 'correios']));

-- Só a função frete escreve aqui. O cliente recebe o id e nunca informa o valor.
create table public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('retirada', 'local', 'correios')),
  service text not null,
  price_cents integer not null check (price_cents >= 0),
  days integer,
  cep text not null,
  pieces integer not null check (pieces > 0),
  client_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index shipping_quotes_expires_idx on public.shipping_quotes (expires_at);
create index shipping_quotes_client_idx on public.shipping_quotes (client_hash, created_at);
alter table public.shipping_quotes enable row level security;
revoke all on public.shipping_quotes from anon, authenticated;

create function public.create_order(
  p_items jsonb, p_name text, p_phone text, p_payment text, p_quote uuid,
  p_address text default null, p_note text default null
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
  update public.orders set total_cents = v_total where id = v_order.id;
  return jsonb_build_object('number', v_order.number, 'total_cents', v_total, 'shipping_cents', v_quote.price_cents);
end;
$function$;

revoke all on function public.create_order(jsonb, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.create_order(jsonb, text, text, text, uuid, text, text) to authenticated, service_role;

-- O frete continua no total quando o pedido é finalizado ou reaberto, e fica fora do faturamento.
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
      'total_cents = (select sum(quantity * unit_price_cents)',
      'total_cents = shipping_cents + (select sum(quantity * unit_price_cents)');
    if v_depois = v_antes then raise exception 'Trecho do total não encontrado em %', v_alvo; end if;
    execute v_depois;
  end loop;

  v_antes := pg_get_functiondef('public.admin_report(date, date)'::regprocedure);
  v_depois := replace(v_antes, 'sum(total_cents)', 'sum(total_cents - shipping_cents)');
  if v_depois = v_antes then raise exception 'Trecho do faturamento não encontrado'; end if;
  execute v_depois;
end;
$migration$;
