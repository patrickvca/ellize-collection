// E-mails para a loja.
// - { order_id }: pedido pago. O banco chama pelo gatilho avisar_pedido_pago; envia uma vez por pedido (store_notified_at).
// - { acao: 'pendentes' }: pedidos há mais de 2 dias sem pagamento. O pg_cron chama todo dia;
//   cada pedido entra em um único aviso (pending_notified_at).
// Chamadas repetidas não geram e-mails a mais, então a função pode ficar pública.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const SITE = 'https://ellizecollection.com.br';
const PAGAMENTOS: Record<string, string> = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', boleto: 'Boleto', dinheiro: 'Dinheiro', cartao: 'Cartão' };
const PRAZO_DIAS = 2;

function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function esc(texto: unknown) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function itensHTML(itens: any[]) {
  return (itens || []).map((i: any) =>
    '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + esc([i.color, i.size].filter(Boolean).join(', ')) + ') · ' + reais(i.unit_price_cents) + '</li>').join('');
}
function caixa(conteudo: string) {
  return '<div style="font-family:Arial,sans-serif;font-size:15px;color:#2c070a;line-height:1.5">' + conteudo +
    '<p><a href="' + SITE + '/administrator/" style="color:#7a1424">Abrir o painel da loja</a></p></div>';
}

async function enviar(assunto: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + Deno.env.get('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('AVISO_REMETENTE') || 'Ellize Collection <onboarding@resend.dev>',
      to: [Deno.env.get('AVISO_EMAIL') || 'ellizecollection@gmail.com'],
      subject: assunto,
      html,
    }),
  });
  if (!r.ok) console.error('Resend respondeu', r.status, await r.text());
  return r.ok;
}

async function pedidoPago(admin: any, orderId: string) {
  const { data: pedido } = await admin.from('orders')
    .update({ store_notified_at: new Date().toISOString() })
    .eq('id', orderId).eq('status', 'pago').is('store_notified_at', null)
    .select('*').maybeSingle();
  if (!pedido) return false;

  const { data: itens } = await admin.from('order_items').select('product_name,color,size,quantity,unit_price_cents').eq('order_id', pedido.id);
  const entrega = pedido.delivery === 'retirada' ? 'Retirar na loja'
    : (pedido.shipping_service || 'Entrega') + ' · ' + (pedido.address || '') + (pedido.cep ? ' · CEP ' + pedido.cep : '');
  const html = caixa(
    '<h2 style="margin:0 0 8px">Novo pedido pago: #' + pedido.number + '</h2>' +
    '<p style="margin:0 0 12px"><strong>' + reais(pedido.total_cents) + '</strong> · ' + esc(PAGAMENTOS[pedido.payment_method] || pedido.payment_method || '') + '</p>' +
    '<p style="margin:0"><strong>Cliente:</strong> ' + esc(pedido.customer_name) + ' · ' + esc(pedido.phone) + '</p>' +
    '<p style="margin:0"><strong>Entrega:</strong> ' + esc(entrega) + '</p>' +
    (pedido.note ? '<p style="margin:0"><strong>Observação:</strong> ' + esc(pedido.note) + '</p>' : '') +
    '<ul>' + itensHTML(itens) + '</ul>');

  const ok = await enviar('Novo pedido pago #' + pedido.number + ' · ' + reais(pedido.total_cents), html);
  if (!ok) await admin.from('orders').update({ store_notified_at: null }).eq('id', pedido.id);
  return ok;
}

async function pendentes(admin: any) {
  const limite = new Date(Date.now() - PRAZO_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const agora = new Date().toISOString();
  const { data: pedidos } = await admin.from('orders')
    .update({ pending_notified_at: agora })
    .eq('status', 'novo').eq('stock_deducted', false).is('pending_notified_at', null).lt('created_at', limite)
    .select('id,number,customer_name,phone,total_cents,payment_choice,delivery,created_at,order_items(product_name,color,size,quantity,unit_price_cents)');
  if (!pedidos || !pedidos.length) return 0;
  pedidos.sort((a: any, b: any) => a.number - b.number);

  const blocos = pedidos.map((p: any) => {
    const dias = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
    const numeros = String(p.phone || '').replace(/\D/g, '');
    const whatsapp = 'https://wa.me/' + (numeros.startsWith('55') && numeros.length > 11 ? numeros : '55' + numeros);
    return '<div style="margin:0 0 16px;padding:12px;border:1px solid #e5ddd3;border-radius:8px">' +
      '<p style="margin:0"><strong>Pedido #' + p.number + '</strong> · ' + reais(p.total_cents) + ' · há ' + dias + ' dias</p>' +
      '<p style="margin:0">' + esc(p.customer_name) + ' · <a href="' + whatsapp + '" style="color:#7a1424">' + esc(p.phone) + '</a>' +
      ' · escolheu ' + esc(PAGAMENTOS[p.payment_choice] || p.payment_choice || '') + '</p>' +
      '<ul style="margin:6px 0 0">' + itensHTML(p.order_items) + '</ul></div>';
  }).join('');
  const total = pedidos.length;
  const html = caixa(
    '<h2 style="margin:0 0 8px">' + (total === 1 ? '1 pedido está' : total + ' pedidos estão') + ' sem pagamento há mais de ' + PRAZO_DIAS + ' dias</h2>' +
    '<p style="margin:0 0 12px">Vale chamar o cliente no WhatsApp. Se ele desistiu, cancele o pedido no painel para liberar o pedido da lista.</p>' + blocos);

  const ok = await enviar((total === 1 ? 'Pedido #' + pedidos[0].number + ' sem pagamento' : total + ' pedidos sem pagamento') + ' há mais de ' + PRAZO_DIAS + ' dias', html);
  if (!ok) await admin.from('orders').update({ pending_notified_at: null }).in('id', pedidos.map((p: any) => p.id));
  return ok ? total : 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método inválido.', { status: 405 });
  if (!Deno.env.get('RESEND_API_KEY')) { console.error('RESEND_API_KEY não configurada.'); return Response.json({ enviado: false }); }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const corpo = await req.json().catch(() => ({}));
  try {
    if (corpo.acao === 'pendentes') return Response.json({ avisados: await pendentes(admin) });
    if (corpo.order_id) return Response.json({ enviado: await pedidoPago(admin, String(corpo.order_id)) });
    return Response.json({ enviado: false });
  } catch (erro) {
    console.error(erro);
    return Response.json({ enviado: false }, { status: 500 });
  }
});
