-- Reserva de estoque: a peça sai do estoque quando o pedido é fechado (stock_reserved)
-- e volta sozinha se o pedido não for pago em 1 hora (5 dias no boleto, que demora a compensar). No pagamento, a reserva vira baixa definitiva
-- (stock_deducted). Assim duas pessoas não pagam pela mesma última peça.

alter table public.orders add column stock_reserved boolean not null default false;

-- Devolve ao estoque as peças reservadas de um pedido.
create function private.devolver_reserva(p_order uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item public.order_items;
  v_available integer;
begin
  for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop
    select coalesce((stock #>> array[v_item.color, v_item.size])::integer, 0) into v_available
      from public.products where id = v_item.product_id for update;
    if not found then continue; end if;
    update public.products
      set stock = jsonb_set(
        case when stock ? v_item.color then stock else stock || jsonb_build_object(v_item.color, '{}'::jsonb) end,
        array[v_item.color, v_item.size], to_jsonb(v_available + v_item.quantity), true)
      where id = v_item.product_id;
  end loop;
  update public.orders set stock_reserved = false where id = p_order;
end;
$function$;

-- Libera as reservas de pedidos sem pagamento há mais de 1 hora (boleto: 5 dias).
-- Pedidos pagos todo com crédito (total 0) ficam reservados até a loja finalizar.
create function private.liberar_reservas()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_total integer := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'novo' and stock_reserved and not stock_deducted and total_cents > 0
      and created_at < now() - case when payment_choice = 'boleto' then interval '5 days' else interval '1 hour' end
    for update skip locked
  loop
    perform private.devolver_reserva(v_id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

revoke all on function private.devolver_reserva(uuid) from public;
revoke all on function private.liberar_reservas() from public;

do $migracao$
declare
  v_def text;
  v_novo text;
  procedure_troca constant text := 'trecho esperado não encontrado';
begin
  -- create_order: trava o produto, baixa a quantidade na hora e marca o pedido como reservado.
  v_def := pg_get_functiondef('public.create_order(jsonb,text,text,text,uuid,text,text,boolean,jsonb)'::regprocedure);
  v_novo := replace(v_def,
    $$where p.id = (v_item->>'product_id')::uuid and p.active;$$,
    $$where p.id = (v_item->>'product_id')::uuid and p.active for update;$$);
  v_novo := replace(v_novo,
    $$    v_card := coalesce(v_product.promo_price_cents, v_product.price_cents);$$,
    $$    update public.products
      set stock = jsonb_set(stock, array[v_color, v_size], to_jsonb(v_available - v_qty), true)
      where id = v_product.id;
    v_card := coalesce(v_product.promo_price_cents, v_product.price_cents);$$);
  v_novo := replace(v_novo,
    $$update public.orders set total_cents = v_total - v_credit, credit_cents = v_credit where id = v_order.id;$$,
    $$update public.orders set total_cents = v_total - v_credit, credit_cents = v_credit, stock_reserved = true where id = v_order.id;$$);
  if v_novo = v_def or (length(v_novo) - length(v_def)) < 150 then raise exception 'create_order: %', procedure_troca; end if;
  execute v_novo;

  -- mp_register_payment: com reserva, não baixa de novo; só confirma.
  v_def := pg_get_functiondef('public.mp_register_payment(uuid,text,text,text,integer,text,text)'::regprocedure);
  v_novo := replace(v_def,
    E'  begin\n    for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop',
    E'  if not v_order.stock_reserved then\n  begin\n    for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop');
  v_novo := replace(v_novo,
    E'    return;\n  end;\n\n  update public.orders\n    set status = ''pago'', stock_deducted = true,',
    E'    return;\n  end;\n  end if;\n\n  update public.orders\n    set status = ''pago'', stock_deducted = true, stock_reserved = false,');
  if (length(v_novo) - length(v_def)) <> length(E'  if not v_order.stock_reserved then\n') + length(E'  end if;\n') + length(' stock_reserved = false,') then
    raise exception 'mp_register_payment: %', procedure_troca;
  end if;
  execute v_novo;

  -- admin_finalize_order: com reserva, não baixa de novo.
  v_def := pg_get_functiondef('public.admin_finalize_order(uuid,text,text,text)'::regprocedure);
  v_novo := replace(v_def,
    E'  for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop',
    E'  if not v_order.stock_reserved then\n  for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop');
  v_novo := replace(v_novo,
    E'  end loop;\n\n  update public.order_items',
    E'  end loop;\n  end if;\n\n  update public.order_items');
  v_novo := replace(v_novo,
    $$set status = 'pago', stock_deducted = true, payment_method = p_payment,$$,
    $$set status = 'pago', stock_deducted = true, stock_reserved = false, payment_method = p_payment,$$);
  if (length(v_novo) - length(v_def)) <> length(E'  if not v_order.stock_reserved then\n') + length(E'  end if;\n') + length(' stock_reserved = false,') then
    raise exception 'admin_finalize_order: %', procedure_troca;
  end if;
  execute v_novo;

  -- admin_set_order_status: cancelar um pedido reservado devolve as peças.
  v_def := pg_get_functiondef('public.admin_set_order_status(uuid,text)'::regprocedure);
  v_novo := replace(v_def,
    E'  update public.orders set status = p_status where id = p_order;\nend;',
    E'  if p_status in (''novo'', ''cancelado'') and v_order.stock_reserved and not v_order.stock_deducted then\n    perform private.devolver_reserva(p_order);\n  end if;\n  update public.orders set status = p_status where id = p_order;\nend;');
  if v_novo = v_def then raise exception 'admin_set_order_status: %', procedure_troca; end if;
  execute v_novo;
end;
$migracao$;

-- A cada 10 minutos, libera as reservas vencidas.
select cron.schedule('liberar-reservas', '*/10 * * * *', $cron$ select private.liberar_reservas(); $cron$);
