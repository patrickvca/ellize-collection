-- Pagamento pelo Mercado Pago: a confirmação vem do servidor e baixa o estoque.

alter table public.orders
  add column mp_payment_id text,
  add column mp_status text,
  add column payment_issue text;

-- O site precisa do id do pedido para pedir a cobrança.
do $migration$
declare
  v_antes text := pg_get_functiondef('public.create_order(jsonb, text, text, text, uuid, text, text)'::regprocedure);
  v_depois text := replace(v_antes, 'jsonb_build_object(''number'', v_order.number,', 'jsonb_build_object(''id'', v_order.id, ''number'', v_order.number,');
begin
  if v_depois = v_antes then raise exception 'Retorno do create_order não encontrado'; end if;
  execute v_depois;
end;
$migration$;

create function public.mp_register_payment(
  p_order uuid, p_payment_id text, p_status text, p_method text, p_amount_cents integer,
  p_city text default null, p_state text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_item public.order_items;
  v_available integer;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then return; end if;

  if p_status in ('refunded', 'charged_back') then
    if v_order.mp_payment_id = p_payment_id then
      update public.orders set mp_status = p_status,
        payment_issue = 'Pagamento devolvido ou contestado no Mercado Pago. Confira o pedido.'
        where id = p_order;
    end if;
    return;
  end if;

  if v_order.stock_deducted then
    if p_status = 'approved' and v_order.mp_payment_id is distinct from p_payment_id then
      update public.orders set payment_issue = 'Pagamento extra aprovado no Mercado Pago (' || p_payment_id || '). Faça a devolução.'
        where id = p_order;
    end if;
    return;
  end if;

  update public.orders set mp_payment_id = p_payment_id, mp_status = p_status where id = p_order;
  if p_status <> 'approved' then return; end if;

  if v_order.status = 'cancelado' then
    update public.orders set payment_issue = 'Pagamento aprovado em pedido cancelado. Faça a devolução no Mercado Pago.' where id = p_order;
    return;
  end if;
  if p_amount_cents < v_order.total_cents then
    update public.orders set payment_issue = 'O valor pago é menor que o total do pedido. Confira no Mercado Pago.' where id = p_order;
    return;
  end if;
  if v_order.payment_choice = 'pix' and p_method in ('credito', 'debito') then
    update public.orders set payment_issue = 'Pedido com valor do Pix pago no cartão. Confira no Mercado Pago.' where id = p_order;
    return;
  end if;

  begin
    for v_item in select * from public.order_items where order_id = p_order and product_id is not null loop
      select coalesce((stock #>> array[v_item.color, v_item.size])::integer, 0) into v_available
        from public.products where id = v_item.product_id for update;
      if not found then continue; end if;
      if v_available < v_item.quantity then
        raise exception using errcode = 'EL001', message = v_item.product_name || ' (' || v_item.color || ', ' || v_item.size || ')';
      end if;
      update public.products
        set stock = jsonb_set(stock, array[v_item.color, v_item.size], to_jsonb(v_available - v_item.quantity), true)
        where id = v_item.product_id;
    end loop;
  exception when sqlstate 'EL001' then
    update public.orders set payment_issue = 'Pagamento aprovado, mas sem estoque de ' || sqlerrm || '. Troque a peça ou faça a devolução.' where id = p_order;
    return;
  end;

  update public.orders
    set status = 'pago', stock_deducted = true, payment_method = coalesce(p_method, 'outro'), paid_at = now(),
        city = nullif(trim(coalesce(p_city, '')), ''), state = nullif(p_state, ''), payment_issue = null
    where id = p_order;
end;
$function$;

revoke all on function public.mp_register_payment(uuid, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.mp_register_payment(uuid, text, text, text, integer, text, text) to service_role;
