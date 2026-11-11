import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

// Pagamento feito na própria página com o Payment Brick, pela API de Orders do Mercado Pago.
// O valor cobrado é sempre o total salvo no pedido, nunca o que vem do navegador.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CARTOES = ['credit_card', 'debit_card', 'prepaid_card'];
// Status da order traduzidos para os status usados pela loja.
const STATUS = {
  processed: 'approved', failed: 'rejected', action_required: 'pending', processing: 'in_process',
  created: 'pending', canceled: 'cancelled', refunded: 'refunded', charged_back: 'charged_back',
} as Record<string, string>;

function responder(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function formaEsperada(selecionada: string) {
  if (selecionada === 'bank_transfer') return 'pix';
  if (selecionada === 'ticket') return 'boleto';
  if (CARTOES.includes(selecionada)) return 'cartao';
  return null;
}

function formaPagamento(tipo: string) {
  if (tipo === 'bank_transfer') return 'pix';
  if (tipo === 'credit_card') return 'credito';
  if (tipo === 'debit_card' || tipo === 'prepaid_card') return 'debito';
  return 'outro';
}

async function buscarCep(cep: string | null) {
  if (!cep) return null;
  try {
    const consulta = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: AbortSignal.timeout(4000) });
    const endereco = await consulta.json();
    return endereco.erro ? null : endereco;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
function pagamentoDaOrder(order: any) { return order?.transactions?.payments?.[0] || {}; }

// deno-lint-ignore no-explicit-any
function resumo(order: any) {
  const pagamento = pagamentoDaOrder(order);
  const metodo = pagamento.payment_method || {};
  return {
    id: String(order.id),
    status: STATUS[order.status] || order.status,
    status_detail: pagamento.status_detail || order.status_detail,
    qr_code: metodo.type === 'bank_transfer' ? metodo.qr_code || null : null,
    qr_code_base64: metodo.type === 'bank_transfer' ? metodo.qr_code_base64 || null : null,
    boleto_url: metodo.type === 'ticket' ? metodo.ticket_url || null : null,
    linha_digitavel: metodo.type === 'ticket' ? metodo.digitable_line || null : null,
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
      .select('id,number,user_id,total_cents,status,stock_deducted,payment_choice,cep,address')
      .eq('id', String(corpo.order_id || '')).maybeSingle();
    if (!pedido || pedido.user_id !== sessao.user.id) return responder({ error: 'Pedido não encontrado.' });

    // deno-lint-ignore no-explicit-any
    async function registrar(order: any) {
      if (order.external_reference !== pedido.id) return;
      const pagamento = pagamentoDaOrder(order);
      const status = STATUS[order.status] || String(order.status);
      const aprovado = status === 'approved';
      const endereco = aprovado ? await buscarCep(pedido.cep) : null;
      const pago = Number(order.total_paid_amount || pagamento.paid_amount || pagamento.amount || 0);
      const { error } = await admin.rpc('mp_register_payment', {
        p_order: pedido.id,
        p_payment_id: String(order.id),
        p_status: status,
        p_method: formaPagamento(String(pagamento.payment_method?.type || '')),
        p_amount_cents: Math.round(pago * 100),
        p_city: endereco?.localidade || null,
        p_state: endereco?.uf || null,
      });
      if (error) console.error(error);
    }

    // Consulta de uma order já criada, usada pela página enquanto espera o Pix.
    if (corpo.consultar) {
      const consulta = await fetch('https://api.mercadopago.com/v1/orders/' + encodeURIComponent(String(corpo.payment_id || '')), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!consulta.ok) return responder({ error: 'Não foi possível consultar o pagamento.' });
      const order = await consulta.json();
      if (order.external_reference !== pedido.id) return responder({ error: 'Pagamento não encontrado.' });
      await registrar(order);
      return responder(resumo(order));
    }

    if (pedido.status !== 'novo' || pedido.stock_deducted) return responder({ error: 'Este pedido não está aguardando pagamento.' });
    if (pedido.total_cents <= 0) return responder({ error: 'Este pedido não tem valor a pagar.' });

    const selecionada = String(corpo.selectedPaymentMethod || '');
    const forma = formaEsperada(selecionada);
    if (!forma || forma !== pedido.payment_choice) {
      return responder({ error: 'A forma de pagamento mudou. Recarregue a página e tente de novo.' });
    }

    const dados = corpo.formData || {};
    const pagador = dados.payer || {};
    const valor = (pedido.total_cents / 100).toFixed(2);
    // deno-lint-ignore no-explicit-any
    const payer: Record<string, any> = { email: pagador.email || sessao.user.email };
    if (pagador.identification?.number) payer.identification = pagador.identification;
    if (pagador.first_name) payer.first_name = pagador.first_name;
    if (pagador.last_name) payer.last_name = pagador.last_name;

    // deno-lint-ignore no-explicit-any
    let metodo: Record<string, any>;
    if (forma === 'cartao') {
      metodo = {
        id: String(dados.payment_method_id || ''),
        type: selecionada === 'prepaid_card' ? 'debit_card' : selecionada,
        token: String(dados.token || ''),
        installments: Number(dados.installments) || 1,
      };
    } else if (forma === 'pix') {
      metodo = { id: 'pix', type: 'bank_transfer' };
    } else {
      metodo = { id: 'boleto', type: 'ticket' };
      // O boleto exige CPF e endereço. Sem endereço no formulário, usa o CEP do pedido.
      const doFormulario = pagador.address || {};
      const viaCep = await buscarCep(pedido.cep);
      payer.address = {
        zip_code: String(doFormulario.zip_code || pedido.cep || '').replace(/\D/g, ''),
        street_name: doFormulario.street_name || viaCep?.logradouro || 'Não informado',
        street_number: doFormulario.street_number || 'S/N',
        neighborhood: doFormulario.neighborhood || viaCep?.bairro || 'Não informado',
        city: doFormulario.city || viaCep?.localidade || '',
        state: doFormulario.federal_unit || doFormulario.state || viaCep?.uf || '',
      };
    }

    const resposta = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'automatic',
        total_amount: valor,
        external_reference: pedido.id,
        description: 'Pedido #' + pedido.number + ' - Ellize Collection',
        payer,
        transactions: { payments: [{ amount: valor, payment_method: metodo }] },
      }),
    });
    const order = await resposta.json();
    if (!resposta.ok) {
      console.error('Mercado Pago respondeu', resposta.status, JSON.stringify(order));
      // Cartão recusado pode vir como erro com a order dentro; nesse caso devolve o motivo.
      const recusada = order?.data || (order?.transactions ? order : null);
      if (recusada?.transactions) return responder(resumo(recusada));
      return responder({ error: 'Não foi possível concluir o pagamento. Confira os dados e tente de novo.' });
    }
    await registrar(order);
    return responder(resumo(order));
  } catch (erro) {
    console.error(erro);
    return responder({ error: 'Não foi possível concluir o pagamento. Tente novamente.' });
  }
});
