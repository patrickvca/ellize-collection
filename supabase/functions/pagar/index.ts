import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

// Pagamento feito na própria página com o Payment Brick do Mercado Pago.
// O valor cobrado é sempre o total salvo no pedido, nunca o que vem do navegador.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CARTOES = ['credit_card', 'debit_card', 'prepaid_card'];

function responder(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function formaEsperada(selecionada: string) {
  if (selecionada === 'bank_transfer') return 'pix';
  if (selecionada === 'ticket') return 'boleto';
  if (CARTOES.includes(selecionada)) return 'cartao';
  return null;
}

function formaPagamento(tipo: string, metodo: string) {
  if (metodo === 'pix' || tipo === 'bank_transfer') return 'pix';
  if (tipo === 'credit_card') return 'credito';
  if (tipo === 'debit_card' || tipo === 'prepaid_card') return 'debito';
  return 'outro';
}

async function cidadeDoCep(cep: string | null) {
  if (!cep) return { city: null, state: null };
  try {
    const consulta = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: AbortSignal.timeout(4000) });
    const endereco = await consulta.json();
    return { city: endereco.localidade || null, state: endereco.uf || null };
  } catch {
    return { city: null, state: null };
  }
}

// deno-lint-ignore no-explicit-any
function resumo(p: any) {
  const dados = p.point_of_interaction?.transaction_data || {};
  return {
    id: String(p.id),
    status: p.status,
    status_detail: p.status_detail,
    qr_code: dados.qr_code || null,
    qr_code_base64: dados.qr_code_base64 || null,
    ticket_url: dados.ticket_url || null,
    boleto_url: p.transaction_details?.external_resource_url || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método inválido.' });

  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) return responder({ error: 'O pagamento pelo site ainda não está ativo.' });

  try {
    const corpo = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: sessao, error: erroSessao } = await admin.auth.getUser(jwt);
    if (erroSessao || !sessao.user) return responder({ error: 'Entre na sua conta para pagar.' });

    const { data: pedido } = await admin.from('orders')
      .select('id,number,user_id,total_cents,status,stock_deducted,payment_choice,cep')
      .eq('id', String(corpo.order_id || '')).maybeSingle();
    if (!pedido || pedido.user_id !== sessao.user.id) return responder({ error: 'Pedido não encontrado.' });

    // deno-lint-ignore no-explicit-any
    async function registrar(pagamento: any) {
      if (pagamento.external_reference !== pedido.id) return;
      const local = pagamento.status === 'approved' ? await cidadeDoCep(pedido.cep) : { city: null, state: null };
      const { error } = await admin.rpc('mp_register_payment', {
        p_order: pedido.id,
        p_payment_id: String(pagamento.id),
        p_status: String(pagamento.status),
        p_method: formaPagamento(String(pagamento.payment_type_id), String(pagamento.payment_method_id)),
        p_amount_cents: Math.round(Number(pagamento.transaction_amount) * 100),
        p_city: local.city,
        p_state: local.state,
      });
      if (error) console.error(error);
    }

    // Consulta de um pagamento já criado, usada pela página enquanto espera o Pix.
    if (corpo.consultar) {
      const consulta = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(String(corpo.payment_id || '')), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!consulta.ok) return responder({ error: 'Não foi possível consultar o pagamento.' });
      const pagamento = await consulta.json();
      if (pagamento.external_reference !== pedido.id) return responder({ error: 'Pagamento não encontrado.' });
      await registrar(pagamento);
      return responder(resumo(pagamento));
    }

    if (pedido.status !== 'novo' || pedido.stock_deducted) return responder({ error: 'Este pedido não está aguardando pagamento.' });
    if (pedido.total_cents <= 0) return responder({ error: 'Este pedido não tem valor a pagar.' });

    const forma = formaEsperada(String(corpo.selectedPaymentMethod || ''));
    if (!forma || forma !== pedido.payment_choice) {
      return responder({ error: 'A forma de pagamento mudou. Recarregue a página e tente de novo.' });
    }

    const dados = corpo.formData || {};
    const pagador = dados.payer || {};
    const corpoPagamento: Record<string, unknown> = {
      transaction_amount: pedido.total_cents / 100,
      description: 'Pedido #' + pedido.number + ' - Ellize Collection',
      payment_method_id: String(dados.payment_method_id || ''),
      external_reference: pedido.id,
      notification_url: Deno.env.get('SUPABASE_URL') + '/functions/v1/pagamento-aviso',
      statement_descriptor: 'ELLIZE',
      payer: {
        email: pagador.email || sessao.user.email,
        identification: pagador.identification,
        first_name: pagador.first_name,
        last_name: pagador.last_name,
        address: pagador.address,
      },
    };
    if (forma === 'cartao') {
      corpoPagamento.token = String(dados.token || '');
      corpoPagamento.installments = Number(dados.installments) || 1;
      if (dados.issuer_id) corpoPagamento.issuer_id = /^\d+$/.test(String(dados.issuer_id)) ? Number(dados.issuer_id) : dados.issuer_id;
    }

    const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(corpoPagamento),
    });
    const pagamento = await resposta.json();
    if (!resposta.ok) {
      console.error('Mercado Pago respondeu', resposta.status, JSON.stringify(pagamento));
      return responder({ error: 'Não foi possível concluir o pagamento. Confira os dados e tente de novo.' });
    }
    await registrar(pagamento);
    return responder(resumo(pagamento));
  } catch (erro) {
    console.error(erro);
    return responder({ error: 'Não foi possível concluir o pagamento. Tente novamente.' });
  }
});
