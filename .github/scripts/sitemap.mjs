// Gera o sitemap.xml com as páginas fixas, as categorias com peças e cada produto ativo.
// Roda no GitHub Actions todo dia (sitemap.yml) e pode rodar à mão: node .github/scripts/sitemap.mjs
// Usa só a chave pública do Supabase, que já está no site.
import { writeFileSync } from 'node:fs';

const SITE = 'https://ellizecollection.com.br';
const SUPABASE = 'https://ukvivmgyxnuijmglidwm.supabase.co';
const CHAVE = 'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj';

async function ler(caminho) {
  const r = await fetch(SUPABASE + '/rest/v1/' + caminho, { headers: { apikey: CHAVE } });
  if (!r.ok) throw new Error(caminho + ' respondeu ' + r.status + ': ' + await r.text());
  return r.json();
}
function esc(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function dia(data) { return new Date(data).toISOString().slice(0, 10); }

const produtos = await ler('products?select=slug,tags,created_at&active=eq.true&order=created_at.desc');
const categorias = await ler('categories?select=slug&order=position');
if (!Array.isArray(produtos) || !Array.isArray(categorias)) throw new Error('Resposta inesperada do Supabase.');

const comPecas = categorias.map((c) => c.slug).filter((slug) => produtos.some((p) => (p.tags || []).includes(slug)));
const ultima = produtos.length ? dia(produtos[0].created_at) : null;

const urls = [
  { loc: SITE + '/', prioridade: '1.0', lastmod: ultima },
  { loc: SITE + '/loja.html', prioridade: '0.9', lastmod: ultima },
  ...comPecas.map((slug) => ({ loc: SITE + '/loja.html?c=' + encodeURIComponent(slug), prioridade: '0.8' })),
  ...produtos.map((p) => ({ loc: SITE + '/produto.html?p=' + encodeURIComponent(p.slug), prioridade: '0.7', lastmod: dia(p.created_at) })),
  { loc: SITE + '/politicas.html', prioridade: '0.3' },
  { loc: SITE + '/privacidade.html', prioridade: '0.3' },
];

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') +
    '<priority>' + u.prioridade + '</priority></url>').join('\n') + '\n</urlset>\n';

writeFileSync(new URL('../../sitemap.xml', import.meta.url), xml);
console.log('sitemap.xml: ' + urls.length + ' endereços (' + produtos.length + ' produtos, ' + comPecas.length + ' categorias).');
