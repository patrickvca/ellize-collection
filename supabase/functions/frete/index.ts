import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const IBGE_CONQUISTA = '2933307';
const ENTREGA_LOCAL_CENTAVOS = 1000;
const CEP_LOJA = '45026445';
const SERVICOS_CORREIOS = '1,2'; // PAC e SEDEX no Melhor Envio
const PESO_PECA_KG = 0.3;
const CAIXA = { largura: 25, comprimento: 30, alturaBase: 5, alturaPeca: 3 };
const LIMITE_COTACOES = 60; // linhas por cliente em 10 minutos

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Item = { product_id: string; quantity: number };
type Opcao = { kind: string; service: string; price_cents: number; days: number | null };

function responder(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function resumoCliente(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const bytes = new TextEncoder().encode(ip + Deno.env.get('SUPABASE_URL'));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function cotarCorreios(cep: string, pecas: number, valorCentavos: number): Promise<Opcao[] | null> {
  const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
  if (!token) return null;
  const base = Deno.env.get('MELHOR_ENVIO_URL') || 'https://melhorenvio.com.br';
  const resposta = await fetch(base + '/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      'User-Agent': Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'Ellize Collection',
    },
    body: JSON.stringify({
      from: { postal_code: CEP_LOJA },
      to: { postal_code: cep },
      products: [{
        id: 'pedido',
        width: CAIXA.largura,
        length: CAIXA.comprimento,
        height: CAIXA.alturaBase + CAIXA.alturaPeca * pecas,
        weight: Math.round(PESO_PECA_KG * pecas * 100) / 100,
        insurance_value: valorCentavos / 100,
        quantity: 1,
      }],
      options: { receipt: false, own_hand: false },
      services: SERVICOS_CORREIOS,
    }),
  });
  if (!resposta.ok) {
    console.error('Melhor Envio respondeu', resposta.status, await resposta.text());
    return [];
  }
  const servicos = await resposta.json();
  return servicos
    .filter((s: Record<string, unknown>) => !s.error && s.custom_price)
    .map((s: Record<string, unknown>) => ({
      kind: 'correios',
      service: String(s.name),
      price_cents: Math.round(Number(s.custom_price) * 100),
      days: Number(s.custom_delivery_time) || null,
    }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método inválido.' });

  try {
    const corpo = await req.json();
    const cep = String(corpo.cep || '').replace(/\D/g, '');
    const itens: Item[] = Array.isArray(corpo.items) ? corpo.items : [];
    if (cep.length !== 8) return responder({ error: 'Informe um CEP com 8 números.' });
    const itensValidos = itens.length >= 1 && itens.length <= 30 &&
      itens.every((i) => Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 10);
    if (!itensValidos) return responder({ error: 'Sacola inválida.' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const cliente = await resumoCliente(req);
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from('shipping_quotes').select('id', { count: 'exact', head: true })
      .eq('client_hash', cliente).gte('created_at', desde);
    if ((count || 0) >= LIMITE_COTACOES) {
      return responder({ error: 'Muitas consultas em pouco tempo. Tente novamente em alguns minutos.' });
    }

    const { data: produtos, error: erroProdutos } = await admin.from('products')
      .select('id,price_cents,promo_price_cents').in('id', itens.map((i) => i.product_id));
    if (erroProdutos) throw erroProdutos;
    const precos = new Map((produtos || []).map((p) => [p.id, p.promo_price_cents ?? p.price_cents]));
    if (itens.some((i) => !precos.has(i.product_id))) return responder({ error: 'Um produto da sacola não está mais disponível.' });
    const pecas = itens.reduce((soma, i) => soma + i.quantity, 0);
    const valor = itens.reduce((soma, i) => soma + i.quantity * precos.get(i.product_id), 0);

    const consulta = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    if (!consulta.ok) return responder({ error: 'Não foi possível consultar o CEP. Tente novamente.' });
    const endereco = await consulta.json();
    if (endereco.erro) return responder({ error: 'CEP não encontrado. Confira os números.' });

    const local = endereco.ibge === IBGE_CONQUISTA;
    let opcoes: Opcao[] | null;
    if (local) {
      opcoes = [
        { kind: 'retirada', service: 'Retirar na loja', price_cents: 0, days: null },
        { kind: 'local', service: 'Entrega em domicílio', price_cents: ENTREGA_LOCAL_CENTAVOS, days: null },
      ];
    } else {
      opcoes = await cotarCorreios(cep, pecas, valor);
      if (!opcoes) return responder({ error: 'O frete para sua cidade é combinado com a loja. Fale com a gente pelo WhatsApp.', contato: true });
      if (!opcoes.length) return responder({ error: 'Não foi possível calcular o frete agora. Tente novamente ou fale com a loja.', contato: true });
    }

    await admin.from('shipping_quotes').delete().lt('expires_at', new Date().toISOString());
    const { data: salvas, error: erroSalvar } = await admin.from('shipping_quotes')
      .insert(opcoes.map((o) => ({ ...o, cep, pieces: pecas, client_hash: cliente })))
      .select('id,kind,service,price_cents,days');
    if (erroSalvar) throw erroSalvar;

    return responder({
      cep, city: endereco.localidade, state: endereco.uf, street: endereco.logradouro, district: endereco.bairro, local, options: salvas,
    });
  } catch (erro) {
    console.error(erro);
    return responder({ error: 'Não foi possível calcular o frete agora. Tente novamente.' });
  }
});
