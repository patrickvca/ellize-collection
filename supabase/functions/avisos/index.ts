// E-mail para a loja quando um pedido é pago. O banco chama esta função pelo gatilho avisar_pedido_pago.
// Só envia uma vez por pedido (store_notified_at), então chamadas repetidas não geram e-mails a mais.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const SITE = 'https://ellizecollection.com.br';
const PAGAMENTOS: Record<string, string> = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', boleto: 'Boleto', dinheiro: 'Dinheiro', cartao: 'Cartão' };

function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function esc(texto: unknown) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método inválido.', { status: 405 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return Response.json({ enviado: false });

  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) { console.error('RESEND_API_KEY não configurada.'); return Response.json({ enviado: false }); }

  const { data: pedido } = await admin.from('orders')
    .update({ store_notified_at: new Date().toISOString() })
    .eq('id', order_id).eq('status', 'pago').is('store_notified_at', null)
    .select('*').maybeSingle();
  if (!pedido) return Response.json({ enviado: false });

  const { data: itens } = await admin.from('order_items').select('product_name,color,size,quantity,unit_price_cents').eq('order_id', pedido.id);
  const entrega = pedido.delivery === 'retirada' ? 'Retirar na loja'
    : (pedido.shipping_service || 'Entrega') + ' · ' + (pedido.address || '') + (pedido.cep ? ' · CEP ' + pedido.cep : '');
  const linhas = (itens || []).map((i: any) =>
    '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + esc([i.color, i.size].filter(Boolean).join(', ')) + ') · ' + reais(i.unit_price_cents) + '</li>').join('');

  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#2c070a;line-height:1.5">' +
    '<h2 style="margin:0 0 8px">Novo pedido pago: #' + pedido.number + '</h2>' +
    '<p style="margin:0 0 12px"><strong>' + reais(pedido.total_cents) + '</strong> · ' + esc(PAGAMENTOS[pedido.payment_method] || pedido.payment_method || '') + '</p>' +
    '<p style="margin:0"><strong>Cliente:</strong> ' + esc(pedido.customer_name) + ' · ' + esc(pedido.phone) + '</p>' +
    '<p style="margin:0"><strong>Entrega:</strong> ' + esc(entrega) + '</p>' +
    (pedido.note ? '<p style="margin:0"><strong>Observação:</strong> ' + esc(pedido.note) + '</p>' : '') +
    '<ul>' + linhas + '</ul>' +
    '<p><a href="' + SITE + '/administrator/" style="color:#7a1424">Abrir o painel da loja</a></p></div>';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('AVISO_REMETENTE') || 'Ellize Collection <onboarding@resend.dev>',
      to: [Deno.env.get('AVISO_EMAIL') || 'ellizecollection@gmail.com'],
      subject: 'Novo pedido pago #' + pedido.number + ' · ' + reais(pedido.total_cents),
      html,
    }),
  });
  if (!r.ok) {
    console.error('Resend respondeu', r.status, await r.text());
    await admin.from('orders').update({ store_notified_at: null }).eq('id', pedido.id);
    return Response.json({ enviado: false });
  }
  return Response.json({ enviado: true });
});
