import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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
    const tipo = url.searchParams.get('type') || corpo.type;
    const dataId = url.searchParams.get('data.id') || String(corpo.data?.id || '');
    if (tipo !== 'payment' || !dataId) return resposta(200);
    if (!(await assinaturaValida(req, dataId, segredo))) return resposta(401);

    // O aviso só diz qual pagamento olhar. Os dados valem pela consulta ao Mercado Pago.
    const consulta = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(dataId), {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!consulta.ok) {
      console.error('Consulta do pagamento respondeu', consulta.status);
      return resposta(500);
    }
    const pagamento = await consulta.json();
    if (!UUID.test(pagamento.external_reference || '')) return resposta(200);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: pedido } = await admin.from('orders').select('cep').eq('id', pagamento.external_reference).maybeSingle();
    if (!pedido) return resposta(200);

    const local = pagamento.status === 'approved' ? await cidadeDoCep(pedido.cep) : { city: null, state: null };
    const { error } = await admin.rpc('mp_register_payment', {
      p_order: pagamento.external_reference,
      p_payment_id: String(pagamento.id),
      p_status: String(pagamento.status),
      p_method: formaPagamento(String(pagamento.payment_type_id), String(pagamento.payment_method_id)),
      p_amount_cents: Math.round(Number(pagamento.transaction_amount) * 100),
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
