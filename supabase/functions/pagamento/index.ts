import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const SITE_PADRAO = 'https://patrickvca.github.io/ellize-collection';
const SO_PIX = ['credit_card', 'debit_card', 'prepaid_card', 'ticket', 'atm'];
const SO_CARTAO = ['bank_transfer', 'ticket', 'atm'];
const SO_BOLETO = ['credit_card', 'debit_card', 'prepaid_card', 'bank_transfer', 'atm'];
const VALIDADE_MS = 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método inválido.' });

  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) return responder({ disponivel: false });

  try {
    const corpo = await req.json();
    if (corpo.check) return responder({ disponivel: true, publicKey: Deno.env.get('MERCADO_PAGO_PUBLIC_KEY') || null });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: sessao, error: erroSessao } = await admin.auth.getUser(jwt);
    if (erroSessao || !sessao.user) return responder({ error: 'Entre na sua conta para pagar.' });

    const { data: pedido } = await admin.from('orders')
      .select('id,number,user_id,total_cents,status,stock_deducted,payment_choice')
      .eq('id', String(corpo.order_id || '')).maybeSingle();
    if (!pedido || pedido.user_id !== sessao.user.id) return responder({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'novo' || pedido.stock_deducted) return responder({ error: 'Este pedido não está aguardando pagamento.' });
    if (pedido.total_cents <= 0) return responder({ error: 'Este pedido não tem valor a pagar.' });

    const site = (Deno.env.get('SITE_URL') || SITE_PADRAO).replace(/\/$/, '');
    const excluidos = pedido.payment_choice === 'pix' ? SO_PIX : pedido.payment_choice === 'boleto' ? SO_BOLETO : SO_CARTAO;
    const resposta = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        items: [{
          id: String(pedido.number),
          title: 'Pedido #' + pedido.number + ' - Ellize Collection',
          quantity: 1,
          unit_price: pedido.total_cents / 100,
          currency_id: 'BRL',
        }],
        payer: { email: sessao.user.email },
        external_reference: pedido.id,
        notification_url: Deno.env.get('SUPABASE_URL') + '/functions/v1/pagamento-aviso',
        back_urls: {
          success: site + '/conta.html?pagamento=aprovado',
          pending: site + '/conta.html?pagamento=pendente',
          failure: site + '/conta.html?pagamento=recusado',
        },
        auto_return: 'approved',
        payment_methods: { excluded_payment_types: excluidos.map((id) => ({ id })) },
        statement_descriptor: 'ELLIZE',
        expires: true,
        expiration_date_to: new Date(Date.now() + VALIDADE_MS).toISOString(),
      }),
    });
    if (!resposta.ok) {
      console.error('Mercado Pago respondeu', resposta.status, await resposta.text());
      return responder({ disponivel: true, error: 'Não foi possível abrir o pagamento. Tente novamente.' });
    }
    const preferencia = await resposta.json();
    return responder({ disponivel: true, url: preferencia.init_point });
  } catch (erro) {
    console.error(erro);
    return responder({ disponivel: true, error: 'Não foi possível abrir o pagamento. Tente novamente.' });
  }
});
