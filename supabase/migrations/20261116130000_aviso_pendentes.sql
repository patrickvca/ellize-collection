-- Aviso diário por e-mail para a loja dos pedidos que estão há mais de 2 dias sem pagamento.
-- Cada pedido entra em um único aviso (pending_notified_at).

alter table public.orders add column pending_notified_at timestamptz;

-- Todo dia às 9h de Vitória da Conquista (12h UTC).
select cron.schedule('aviso-pedidos-pendentes', '0 12 * * *', $cron$
  select net.http_post(
    url := 'https://ukvivmgyxnuijmglidwm.supabase.co/functions/v1/avisos',
    body := '{"acao": "pendentes"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb);
$cron$);
