import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const STATUS_ORDER: Record<string, string> = {
  processed: 'approved', failed: 'rejected', action_required: 'pending', processing: 'in_process',
  created: 'pending', canceled: 'cancelled', refunded: 'refunded', charged_back: 'charged_back',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resposta(status: number) {
  return new Response(null, { status });
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function assinaturaValida(req: Request, dataId: string, segredo: string) {
  const partes = Object.fromEntries((req.headers.get('x-signature') || '').split(',').map((p) => {
    const [chave, ...valor] = p.split('=');
    return [chave.trim(), valor.join('=').trim()];
  }));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = 'id:' + dataId.toLowerCase() + ';request-id:' + (req.headers.get('x-request-id') || '') + ';ts:' + partes.ts + ';';
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return iguais(hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto))), partes.v1);
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405);
  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  const segredo = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');
  if (!token || !segredo) return resposta(503);

  try {
    const url = new URL(req.url);
    const corpo = await req.json().catch(() => ({}));
    const tipo = String(url.searchParams.get('type') || corpo.type || '');
    const dataId = url.searchParams.get('data.id') || String(corpo.data?.id || '');
    const ehOrder = tipo === 'order' || tipo === 'orders';
    if ((tipo !== 'payment' && !ehOrder) || !dataId) return resposta(200);
    if (!(await assinaturaValida(req, dataId, segredo))) {
      // O aviso só aponta o que consultar; os dados vêm sempre do Mercado Pago com a nossa chave.
      // Um aviso de payment sem assinatura válida é recusado. No de order, a regra da assinatura
      // não está documentada, então a consulta segue e o caso fica registrado.
      if (!ehOrder) return resposta(401);
      console.warn('Assinatura do aviso de order não conferiu', dataId);
    }

    // O aviso só diz o que olhar. Os dados valem pela consulta ao Mercado Pago.
    const consulta = await fetch('https://api.mercadopago.com/v1/' + (ehOrder ? 'orders/' : 'payments/') + encodeURIComponent(dataId), {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!consulta.ok) {
      console.error('Consulta respondeu', consulta.status);
      return resposta(500);
    }
    const dados = await consulta.json();
    if (!UUID.test(dados.external_reference || '')) return resposta(200);

    let status: string, metodo: string, pagoCentavos: number;
    if (ehOrder) {
      const pagamento = dados.transactions?.payments?.[0] || {};
      status = STATUS_ORDER[dados.status] || String(dados.status);
      metodo = formaPagamento(String(pagamento.payment_method?.type || ''), '');
      pagoCentavos = Math.round(Number(dados.total_paid_amount || pagamento.paid_amount || pagamento.amount || 0) * 100);
    } else {
      status = String(dados.status);
      metodo = formaPagamento(String(dados.payment_type_id), String(dados.payment_method_id));
      pagoCentavos = Math.round(Number(dados.transaction_amount) * 100);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: pedido } = await admin.from('orders').select('cep').eq('id', dados.external_reference).maybeSingle();
    if (!pedido) return resposta(200);

    const local = status === 'approved' ? await cidadeDoCep(pedido.cep) : { city: null, state: null };
    const { error } = await admin.rpc('mp_register_payment', {
      p_order: dados.external_reference,
      p_payment_id: String(dados.id),
      p_status: status,
      p_method: metodo,
      p_amount_cents: pagoCentavos,
      p_city: local.city,
      p_state: local.state,
    });
    if (error) {
      console.error(error);
      return resposta(500);
    }
    return resposta(200);
  } catch (erro) {
    console.error(erro);
    return resposta(500);
  }
});
