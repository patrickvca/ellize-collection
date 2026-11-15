-- Etiquetas automáticas no Melhor Envio, rastreio automático e aviso por e-mail para a loja.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.orders
  add column cpf text,
  add column address_parts jsonb,
  add column me_order_id text,
  add column label_status text check (label_status in ('carrinho', 'comprada', 'gerada', 'cancelada')),
  add column label_price_cents integer,
  add column package jsonb,
  add column tracking_checked_at timestamptz,
  add column store_notified_at timestamptz;

create function private.cpf_valido(p text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s integer;
  r integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::integer * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::integer then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::integer * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::integer;
end;
$function$;

-- create_order ganha p_extra: { cpf, address: { street, number, complement, district, city, state } }.
drop function public.create_order(jsonb, text, text, text, uuid, text, text, boolean);

create function public.create_order(p_items jsonb, p_name text, p_phone text, p_payment text, p_quote uuid,
  p_address text default null, p_note text default null, p_use_credit boolean default false, p_extra jsonb default null)
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
  v_cpf text := nullif(regexp_replace(coalesce(p_extra->>'cpf', ''), '\D', '', 'g'), '');
  v_parts jsonb := p_extra->'address';
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
  if v_quote.kind = 'correios' and not private.cpf_valido(v_cpf) then
    raise exception 'Informe um CPF válido para a etiqueta dos Correios.';
  end if;
  if v_quote.kind = 'retirada' or jsonb_typeof(v_parts) is distinct from 'object' then
    v_parts := null;
  else
    v_parts := jsonb_build_object(
      'street', left(trim(coalesce(v_parts->>'street', '')), 120),
      'number', left(trim(coalesce(v_parts->>'number', '')), 10),
      'complement', left(trim(coalesce(v_parts->>'complement', '')), 60),
      'district', left(trim(coalesce(v_parts->>'district', '')), 60),
      'city', left(trim(coalesce(v_parts->>'city', '')), 80),
      'state', left(upper(trim(coalesce(v_parts->>'state', ''))), 2));
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'A observação está longa demais.'; end if;
  if (select count(*) from public.orders o where o.user_id = v_user and o.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Muitos pedidos em pouco tempo. Tente novamente em alguns minutos.';
  end if;

  insert into public.orders (user_id, customer_name, phone, delivery, payment_choice, address, note, total_cents,
                             shipping_cents, shipping_service, shipping_days, cep, cpf, address_parts)
  values (v_user, trim(p_name), trim(p_phone), v_quote.kind, p_payment,
          case when v_quote.kind <> 'retirada' then trim(p_address) end, nullif(trim(coalesce(p_note, '')), ''), 1,
          v_quote.price_cents, v_quote.service, v_quote.days, v_quote.cep,
          case when v_quote.kind = 'correios' then v_cpf end, v_parts)
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

revoke all on function public.create_order(jsonb, text, text, text, uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_order(jsonb, text, text, text, uuid, text, text, boolean, jsonb) to authenticated, service_role;

-- Quando um pedido vira pago, a função avisos manda o e-mail para a loja (uma vez por pedido).
create function private.avisar_pedido_pago()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'pago' and old.status is distinct from 'pago' and new.store_notified_at is null then
    perform net.http_post(
      url := 'https://ukvivmgyxnuijmglidwm.supabase.co/functions/v1/avisos',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
end;
$function$;

create trigger avisar_pedido_pago after update of status on public.orders
  for each row execute function private.avisar_pedido_pago();

-- De hora em hora, a função etiqueta consulta o rastreio das etiquetas geradas.
select cron.schedule('rastreio-melhor-envio', '17 * * * *', $cron$
  select net.http_post(
    url := 'https://ukvivmgyxnuijmglidwm.supabase.co/functions/v1/etiqueta',
    body := '{"acao": "rastrear"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb);
$cron$);
