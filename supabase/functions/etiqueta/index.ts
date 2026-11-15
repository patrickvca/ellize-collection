// Etiquetas do Melhor Envio para os pedidos pelos Correios e rastreio automático.
// Ações do painel (só administrador): preparar, comprar, imprimir, descartar, rastrear com order_id.
// Ação pública: rastrear sem order_id (o agendamento chama de hora em hora; só consulta e atualiza status).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const ME = Deno.env.get('MELHOR_ENVIO_URL') || 'https://melhorenvio.com.br';
const SERVICOS: Record<string, number> = { PAC: 1, SEDEX: 2 };
const LOJA = {
  name: 'Ellize Collection',
  phone: '77988298955',
  email: 'ellizecollection@gmail.com',
  address: 'Rua Miguel Pinheiro',
  number: '968',
  complement: '',
  district: 'Boa Vista',
  city: 'Vitória da Conquista',
  state_abbr: 'BA',
  postal_code: '45026445',
  country_id: 'BR',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

class Aviso extends Error {}

async function melhorEnvio(caminho: string, corpo?: unknown, metodo = 'POST') {
  const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
  if (!token) throw new Aviso('O token do Melhor Envio não está configurado.');
  const r = await fetch(ME + caminho, {
    method: metodo,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      'User-Agent': Deno.env.get('MELHOR_ENVIO_USER_AGENT') || 'Ellize Collection',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let dados: any = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  if (!r.ok) {
    console.error('Melhor Envio', caminho, r.status, texto.slice(0, 800));
    if (r.status === 401 || r.status === 403) throw new Aviso('O token do Melhor Envio não tem permissão para isso. Confira as permissões do token.');
    const detalhes = dados && dados.errors ? Object.values(dados.errors).flat().join(' ') : '';
    throw new Aviso('Melhor Envio: ' + (detalhes || (dados && dados.message) || 'erro ' + r.status));
  }
  return dados;
}

function remetente() {
  const doc = (Deno.env.get('LOJA_DOCUMENTO') || '').replace(/\D/g, '');
  if (doc.length === 11) return { ...LOJA, document: doc };
  if (doc.length === 14) return { ...LOJA, company_document: doc, state_register: Deno.env.get('LOJA_IE') || 'isento' };
  throw new Aviso('Cadastre o CPF ou CNPJ da loja no segredo LOJA_DOCUMENTO do Supabase.');
}

function numero(valor: unknown, min: number, max: number, nome: string) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new Aviso('Confira ' + nome + ' do pacote.');
  return Math.round(n * 1000) / 1000;
}

async function souAdmin(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  const u = data?.user;
  if (!u || !u.email || !u.email_confirmed_at) return false;
  const { data: linha } = await admin.from('admins').select('email').eq('email', u.email.toLowerCase()).maybeSingle();
  return !!linha;
}

type Pedido = Record<string, any>;

async function preparar(admin: any, pedido: Pedido, pacote: any) {
  if (pedido.delivery !== 'correios') throw new Aviso('Este pedido não é pelos Correios.');
  if (!pedido.stock_deducted || pedido.status !== 'pago') throw new Aviso('A etiqueta só pode ser feita para pedidos pagos.');
  if (pedido.label_status && pedido.label_status !== 'cancelada') throw new Aviso('Este pedido já tem etiqueta.');
  const servico = SERVICOS[String(pedido.shipping_service || '').toUpperCase()];
  if (!servico) throw new Aviso('Serviço de frete desconhecido: ' + pedido.shipping_service + '.');
  const partes = pedido.address_parts;
  if (!partes || !partes.street || !partes.number || !partes.district) throw new Aviso('O pedido não tem o endereço separado. Faça esta etiqueta direto no Melhor Envio.');
  if (!pedido.cpf) throw new Aviso('O pedido não tem o CPF do cliente. Faça esta etiqueta direto no Melhor Envio.');

  const volume = {
    height: numero(pacote?.altura, 1, 100, 'a altura'),
    width: numero(pacote?.largura, 8, 100, 'a largura'),
    length: numero(pacote?.comprimento, 13, 100, 'o comprimento'),
    weight: numero(pacote?.peso, 0.01, 30, 'o peso'),
  };
  const { data: itens } = await admin.from('order_items').select('product_name,color,size,quantity,unit_price_cents').eq('order_id', pedido.id);
  const produtos = (itens || []).map((i: any) => ({
    name: (i.product_name + ' ' + [i.color, i.size].filter((x: string) => x && x !== 'Única' && x !== 'Único').join(' ')).trim().slice(0, 120),
    quantity: i.quantity,
    unitary_value: i.unit_price_cents / 100,
  }));
  const seguro = produtos.reduce((s: number, p: any) => s + p.quantity * p.unitary_value, 0);
  let email = '';
  if (pedido.user_id) {
    const { data } = await admin.auth.admin.getUserById(pedido.user_id);
    email = data?.user?.email || '';
  }

  const carrinho = await melhorEnvio('/api/v2/me/cart', {
    service: servico,
    from: remetente(),
    to: {
      name: pedido.customer_name,
      phone: String(pedido.phone || '').replace(/\D/g, ''),
      email,
      document: pedido.cpf,
      address: partes.street,
      complement: partes.complement || '',
      number: partes.number,
      district: partes.district,
      city: partes.city,
      state_abbr: partes.state,
      postal_code: pedido.cep,
      country_id: 'BR',
    },
    products: produtos,
    volumes: [volume],
    options: {
      insurance_value: Math.round(seguro * 100) / 100,
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true,
      platform: 'Ellize Collection',
      tags: [{ tag: 'Pedido #' + pedido.number, url: null }],
    },
  });
  const preco = Math.round(Number(carrinho.price) * 100) || null;
  await admin.from('orders').update({
    me_order_id: String(carrinho.id), label_status: 'carrinho', label_price_cents: preco,
    package: { altura: volume.height, largura: volume.width, comprimento: volume.length, peso: volume.weight },
  }).eq('id', pedido.id);
  return { price_cents: preco };
}

async function comprar(admin: any, pedido: Pedido) {
  if (!pedido.me_order_id || !['carrinho', 'comprada'].includes(pedido.label_status)) throw new Aviso('Prepare a etiqueta antes de comprar.');
  if (pedido.label_status === 'carrinho') {
    await melhorEnvio('/api/v2/me/shipment/checkout', { orders: [pedido.me_order_id] });
    await admin.from('orders').update({ label_status: 'comprada' }).eq('id', pedido.id);
  }
  await melhorEnvio('/api/v2/me/shipment/generate', { orders: [pedido.me_order_id] });
  await admin.from('orders').update({ label_status: 'gerada' }).eq('id', pedido.id);
  return { ok: true };
}

async function imprimir(pedido: Pedido) {
  if (pedido.label_status !== 'gerada') throw new Aviso('A etiqueta ainda não foi gerada.');
  const r = await melhorEnvio('/api/v2/me/shipment/print', { mode: 'public', orders: [pedido.me_order_id] });
  return { url: r.url };
}

async function descartar(admin: any, pedido: Pedido) {
  if (pedido.label_status === 'carrinho') {
    await melhorEnvio('/api/v2/me/cart/' + pedido.me_order_id, undefined, 'DELETE');
  } else if (pedido.label_status === 'comprada' || pedido.label_status === 'gerada') {
    if (pedido.status !== 'pago') throw new Aviso('O pacote já foi postado. Cancele direto no Melhor Envio, se ainda for possível.');
    await melhorEnvio('/api/v2/me/shipment/cancel', { order: { id: pedido.me_order_id, reason_id: '2', description: 'Cancelado pela loja' } });
  } else {
    throw new Aviso('Não há etiqueta para cancelar.');
  }
  await admin.from('orders').update({ label_status: 'cancelada', me_order_id: null, label_price_cents: null }).eq('id', pedido.id);
  return { ok: true };
}

async function rastrear(admin: any, pedidos: Pedido[]) {
  if (!pedidos.length) return { atualizados: 0 };
  const ids = pedidos.map((p) => p.me_order_id);
  const dados = await melhorEnvio('/api/v2/me/shipment/tracking', { orders: ids });
  let atualizados = 0;
  for (const p of pedidos) {
    const t = dados?.[p.me_order_id];
    const mudanca: Record<string, unknown> = { tracking_checked_at: new Date().toISOString() };
    if (t) {
      const codigo = t.tracking || t.melhorenvio_tracking || null;
      if (codigo && codigo !== p.tracking_code) mudanca.tracking_code = codigo;
      if (['posted', 'delivered'].includes(t.status) && p.status === 'pago') {
        mudanca.status = 'enviado';
        mudanca.shipped_at = t.posted_at || new Date().toISOString();
      }
      if (t.status === 'delivered' && p.status !== 'entregue') {
        mudanca.status = 'entregue';
        mudanca.delivered_at = t.delivered_at || new Date().toISOString();
      }
      if (t.status === 'canceled') { mudanca.label_status = 'cancelada'; mudanca.me_order_id = null; }
      if (Object.keys(mudanca).length > 1) atualizados++;
    }
    await admin.from('orders').update(mudanca).eq('id', p.id);
  }
  return { atualizados };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método inválido.' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao || '');

    if (acao === 'rastrear' && !corpo.order_id) {
      const limite = new Date(Date.now() - 50 * 60 * 1000).toISOString();
      const { data } = await admin.from('orders').select('id,me_order_id,status,tracking_code')
        .eq('label_status', 'gerada').in('status', ['pago', 'enviado'])
        .or('tracking_checked_at.is.null,tracking_checked_at.lt.' + limite).limit(50);
      return responder(await rastrear(admin, data || []));
    }

    if (!(await souAdmin(req, admin))) return responder({ error: 'Acesso negado.' }, 403);
    const { data: pedido } = await admin.from('orders').select('*').eq('id', corpo.order_id).maybeSingle();
    if (!pedido) return responder({ error: 'Pedido não encontrado.' }, 404);

    if (acao === 'preparar') return responder(await preparar(admin, pedido, corpo.pacote));
    if (acao === 'comprar') return responder(await comprar(admin, pedido));
    if (acao === 'imprimir') return responder(await imprimir(pedido));
    if (acao === 'descartar') return responder(await descartar(admin, pedido));
    if (acao === 'rastrear') {
      if (!pedido.me_order_id || pedido.label_status !== 'gerada') throw new Aviso('Este pedido não tem etiqueta gerada.');
      return responder(await rastrear(admin, [pedido]));
    }
    return responder({ error: 'Ação inválida.' }, 400);
  } catch (erro) {
    if (erro instanceof Aviso) return responder({ error: erro.message }, 400);
    console.error(erro);
    return responder({ error: 'Não foi possível falar com o Melhor Envio agora. Tente de novo.' }, 500);
  }
});
