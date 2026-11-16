-- Todas as transportadoras ativas no Melhor Envio: a cotação e o pedido guardam o código do serviço
-- escolhido (shipping_service_id), que a função etiqueta usa para gerar a etiqueta certa.

alter table public.shipping_quotes add column service_id integer;
alter table public.orders add column shipping_service_id integer;

do $migracao$
declare
  v_def text := pg_get_functiondef('public.create_order(jsonb,text,text,text,uuid,text,text,boolean,jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    $$shipping_cents, shipping_service, shipping_days, cep, cpf, address_parts)$$,
    $$shipping_cents, shipping_service, shipping_days, cep, cpf, address_parts, shipping_service_id)$$);
  v_novo := replace(v_novo,
    $$case when v_quote.kind = 'correios' then v_cpf end, v_parts)$$,
    $$case when v_quote.kind = 'correios' then v_cpf end, v_parts, v_quote.service_id)$$);
  if (length(v_novo) - length(v_def)) <> length(', shipping_service_id') + length(', v_quote.service_id') then
    raise exception 'create_order: trecho esperado não encontrado';
  end if;
  execute v_novo;
end;
$migracao$;
