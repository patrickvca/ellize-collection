-- Boleto vira uma forma de pagamento própria (antes caía em "outro" nos relatórios).

alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (
  payment_method is null or payment_method in ('pix', 'boleto', 'dinheiro', 'debito', 'credito', 'transferencia', 'outro'));

-- A finalização manual no painel também aceita boleto.
do $migracao$
declare
  v_def text := pg_get_functiondef('public.admin_finalize_order(uuid,text,text,text)'::regprocedure);
  v_meio text := replace(v_def, $$not in ('pix','dinheiro','debito','credito','transferencia','outro')$$,
                                $$not in ('pix','boleto','dinheiro','debito','credito','transferencia','outro')$$);
  -- Boleto usa o preço do Pix, como na tela de pagamento.
  v_novo text := replace(v_meio, $$p_payment in ('pix', 'dinheiro', 'transferencia')$$,
                                 $$p_payment in ('pix', 'boleto', 'dinheiro', 'transferencia')$$);
begin
  if v_meio = v_def or v_novo = v_meio then raise exception 'Trecho esperado não encontrado em admin_finalize_order.'; end if;
  execute v_novo;
end;
$migracao$;
