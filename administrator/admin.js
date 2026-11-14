(function () {
  var sb = window.supabase.createClient(
    'https://ukvivmgyxnuijmglidwm.supabase.co',
    'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj',
    { auth: { storageKey: 'ellize-admin', persistSession: true, detectSessionInUrl: false } }
  );
  var categorias = [];
  var CATEGORIAS_FIXAS = ['feminino', 'masculino'];
  var ATALHOS = ['PP', 'P', 'M', 'G', 'GG', 'Único'];
  var PAGAMENTOS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', transferencia: 'Transferência', outro: 'Outro', nao_informado: 'Não informado' };
  var STATUS_FINALIZADO = [['pago', 'Pago'], ['enviado', 'Enviado'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado']];
  var BUCKET = 'produtos';
  var FOTO_PADRAO = 'assets/img/cetim-marfim.webp';
  var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var produtos = [];
  var pedidos = [];
  var editando = null;
  var fotoNova = null;
  var FOTO_LARGURA = 1200;
  var FOTO_PROPORCAO = 4 / 5;
  var FOTO_FOCO_Y = 0.35;
  var FOTO_MAX_BYTES = 20 * 1024 * 1024;
  var VIDEO_MAX_BYTES = 50 * 1024 * 1024;
  var VIDEO_TIPOS = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  var VIDEOS_MAX = 3;
  var videos = [];
  var fotosGerais = [];
  var modoFotos = 'geral';
  var tempoAviso;

  function $(seletor) { return document.querySelector(seletor); }
  function dinheiro(centavos) { return moeda.format(centavos / 100); }
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fotoSrc(caminho) { return /^https?:/.test(caminho) ? caminho : '../' + caminho; }
  function emPromocao(p) { return !!(p.promo_price_cents || p.promo_pix_price_cents); }
  var STATUS_MP = {
    approved: 'aprovado', pending: 'pendente', in_process: 'em análise', authorized: 'autorizado', in_mediation: 'em disputa',
    rejected: 'recusado', cancelled: 'cancelado', refunded: 'devolvido', charged_back: 'contestado'
  };
  function valorPedido(o, pix) {
    return Math.max(0, (o.shipping_cents || 0) - (o.credit_cents || 0) + o.order_items.reduce(function (soma, i) {
      return soma + i.quantity * (pix ? i.pix_price_cents : i.card_price_cents);
    }, 0));
  }
  function qtd(p, cor, tamanho) { return Number((p.stock[cor] || {})[tamanho]) || 0; }
  function total(p) {
    return p.colors.reduce(function (soma, c) {
      return soma + p.sizes.reduce(function (s, t) { return s + qtd(p, c.name, t); }, 0);
    }, 0);
  }
  function variacaoItem(i) { return (i.color && i.color !== 'Única' ? esc(i.color) + ', ' : '') + esc(i.size); }
  function avisar(texto) {
    var caixa = $('#aviso');
    caixa.textContent = texto;
    caixa.hidden = false;
    clearTimeout(tempoAviso);
    tempoAviso = setTimeout(function () { caixa.hidden = true; }, 4000);
  }
  function ocupado(botao, ativo, texto) {
    if (ativo) { botao.dataset.texto = botao.textContent; botao.textContent = texto; }
    else if (botao.dataset.texto) botao.textContent = botao.dataset.texto;
    botao.disabled = ativo;
  }
  function paraCentavos(texto) {
    var limpo = String(texto).trim().replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
    return Math.round(parseFloat(limpo) * 100);
  }
  function paraTexto(centavos) { return (centavos / 100).toFixed(2).replace('.', ','); }
  function criarSlug(nome) {
    var base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return (base || 'produto') + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* Acesso */
  function mostrarLogin(mensagem) {
    $('#tela-painel').hidden = true;
    $('#tela-login').hidden = false;
    var erro = $('#erro-login');
    erro.textContent = mensagem || '';
    erro.hidden = !mensagem;
  }
  function entrarNoPainel() {
    return sb.from('admins').select('email').limit(1).then(function (r) {
      if (r.error || !r.data.length) {
        return sb.auth.signOut().then(function () { mostrarLogin('Esta conta não tem acesso ao painel.'); });
      }
      $('#tela-login').hidden = true;
      $('#tela-painel').hidden = false;
      carregarCategorias();
      carregarProdutos();
      carregarPedidos();
    });
  }
  $('#form-login').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var form = evento.target;
    var botao = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    $('#erro-login').hidden = true;
    ocupado(botao, true, 'Entrando…');
    sb.auth.signInWithPassword({ email: form.email.value, password: form.senha.value }).then(function (r) {
      if (r.error) {
        ocupado(botao, false);
        mostrarLogin(/rate|too many/i.test(r.error.message) ? 'Muitas tentativas. Aguarde alguns minutos.' : 'E-mail ou senha incorretos.');
        return;
      }
      return entrarNoPainel().then(function () { ocupado(botao, false); form.senha.value = ''; });
    }, function () {
      ocupado(botao, false);
      mostrarLogin('Sem conexão. Verifique sua internet.');
    });
  });
  $('#sair').addEventListener('click', function () {
    sb.auth.signOut().then(function () { mostrarLogin(); });
  });

  /* Abas */
  document.querySelectorAll('[data-aba]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      document.querySelectorAll('[data-aba]').forEach(function (b) { b.removeAttribute('aria-current'); });
      botao.setAttribute('aria-current', 'page');
      ['produtos', 'pedidos', 'trocas', 'clientes', 'categorias', 'relatorios'].forEach(function (aba) {
        $('#aba-' + aba).hidden = botao.dataset.aba !== aba;
      });
      if (botao.dataset.aba === 'relatorios') carregarRelatorio();
      if (botao.dataset.aba === 'trocas') carregarTrocas();
      if (botao.dataset.aba === 'clientes') carregarClientes();
    });
  });

  /* Produtos */
  function carregarProdutos() {
    return sb.from('products').select('*').order('created_at', { ascending: false }).then(function (r) {
      var caixa = $('#lista-produtos');
      caixa.setAttribute('aria-busy', 'false');
      if (r.error) { caixa.innerHTML = '<p class="estado">Não foi possível carregar os produtos.</p>'; return; }
      produtos = r.data;
      desenharProdutos();
    });
  }
  function desenharProdutos() {
    desenharCategorias();
    var termo = $('#busca').value.trim().toLowerCase();
    var filtro = $('#filtro').value;
    var promo = produtos.filter(emPromocao).length;
    var esgotados = produtos.filter(function (p) { return total(p) === 0; }).length;
    var ativos = produtos.filter(function (p) { return p.active; }).length;
    $('#resumo').innerHTML = [['Produtos', produtos.length], ['Visíveis', ativos], ['Em promoção', promo], ['Esgotados', esgotados]].map(function (i) {
      return '<div><strong>' + i[1] + '</strong><span>' + i[0] + '</span></div>';
    }).join('');
    var lista = produtos.filter(function (p) {
      if (termo && p.name.toLowerCase().indexOf(termo) === -1) return false;
      if (filtro === 'ativos') return p.active;
      if (filtro === 'ocultos') return !p.active;
      if (filtro === 'promocao') return emPromocao(p);
      if (filtro === 'esgotados') return total(p) === 0;
      return true;
    });
    var caixa = $('#lista-produtos');
    if (!lista.length) {
      caixa.innerHTML = '<p class="estado">' + (produtos.length ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.') + '</p>';
      return;
    }
    caixa.innerHTML = '<ul class="itens">' + lista.map(function (p) {
      var preco = p.promo_price_cents
        ? '<s>' + dinheiro(p.price_cents) + '</s> <strong>' + dinheiro(p.promo_price_cents) + '</strong>'
        : '<strong>' + dinheiro(p.price_cents) + '</strong>';
      var cartaoFinal = p.promo_price_cents || p.price_cents;
      var pixFinal = Math.min(p.promo_pix_price_cents || p.pix_price_cents || cartaoFinal, cartaoFinal);
      if (pixFinal < cartaoFinal) preco += ' no cartão<br><strong>' + dinheiro(pixFinal) + '</strong> no Pix';
      var estoque = p.colors.map(function (c) {
        return '<div class="estoque-cor">' + (c.name !== 'Única' ? '<span class="cor-rotulo"><i style="background:' + (/^#[0-9a-f]{6}$/i.test(c.hex || '') ? c.hex : '#d6d1c6') + '"></i>' + esc(c.name) + '</span>' : '') +
          p.sizes.map(function (t) {
            var q = qtd(p, c.name, t);
            return '<span class="chip' + (q === 0 ? ' chip-zero' : q <= 2 ? ' chip-baixo' : '') + '">' + esc(t) + ': ' + q + '</span>';
          }).join('') + '</div>';
      }).join('');
      return '<li class="item"><img src="' + esc(fotoSrc(p.image)) + '" alt="" width="64" height="80" loading="lazy">' +
        '<div class="item-info"><h3>' + esc(p.name) + '</h3><p class="item-preco">' + preco + '</p></div>' +
        '<div class="item-estoque">' + estoque + '</div>' +
        '<div class="item-selos">' + (p.active ? '<span class="selo selo-ok">Visível</span>' : '<span class="selo">Oculto</span>') +
        (emPromocao(p) ? '<span class="selo selo-promo">Promoção</span>' : '') +
        (total(p) === 0 ? '<span class="selo selo-zero">Esgotado</span>' : '') + '</div>' +
        '<div class="item-acoes"><button class="botao-texto" type="button" data-editar="' + esc(p.id) + '">Editar</button>' +
        '<button class="botao-texto botao-perigo" type="button" data-remover="' + esc(p.id) + '">Remover</button></div></li>';
    }).join('') + '</ul>';
  }
  $('#busca').addEventListener('input', desenharProdutos);
  $('#filtro').addEventListener('change', desenharProdutos);
  $('#lista-produtos').addEventListener('click', function (evento) {
    var editar = evento.target.closest('[data-editar]');
    var remover = evento.target.closest('[data-remover]');
    if (editar) abrirEditor(produtos.find(function (p) { return p.id === editar.dataset.editar; }));
    if (remover) removerProduto(produtos.find(function (p) { return p.id === remover.dataset.remover; }));
  });
  function nomeDaFoto(url) {
    var marca = '/object/public/' + BUCKET + '/';
    var i = url.indexOf(marca);
    return i === -1 ? null : url.slice(i + marca.length);
  }
  function removerFoto(url) {
    var nome = nomeDaFoto(url);
    return nome ? sb.storage.from(BUCKET).remove([nome]) : Promise.resolve();
  }
  function fotosDaCor(c) { return c.images && c.images.length ? c.images : (c.image ? [c.image] : []); }
  function arquivosDoProduto(p) {
    var lista = [p.image].concat(p.videos || [], p.images || []);
    (p.colors || []).forEach(function (c) { lista = lista.concat(fotosDaCor(c)); });
    return lista.filter(function (u, i) { return u && lista.indexOf(u) === i; });
  }
  function removerProduto(p) {
    if (!window.confirm('Remover "' + p.name + '" da loja? Os pedidos antigos continuam guardados.')) return;
    sb.from('products').delete().eq('id', p.id).then(function (r) {
      if (r.error) { avisar('Não foi possível remover o produto.'); return; }
      arquivosDoProduto(p).forEach(function (arquivo) { removerFoto(arquivo); });
      avisar('Produto removido.');
      carregarProdutos();
    });
  }

  /* Categorias */
  function slugCategoria(nome) {
    var base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
    if (base.length < 2) base = 'categoria';
    var slug = base;
    var n = 2;
    function slugEmUso(s) { return s === 'promocao' || categorias.some(function (c) { return c.slug === s; }); }
    while (slugEmUso(slug)) { slug = base + '-' + n; n += 1; }
    return slug;
  }
  function carregarCategorias() {
    return sb.from('categories').select('*').order('position').then(function (r) {
      if (r.error) { $('#lista-categorias').innerHTML = '<li class="estado">Não foi possível carregar as categorias.</li>'; return; }
      var ordemSalva = r.data.map(function (c) { return c.slug; }).join();
      categorias = r.data.filter(categoriaFixa).sort(function (a, b) {
        return CATEGORIAS_FIXAS.indexOf(a.slug) - CATEGORIAS_FIXAS.indexOf(b.slug);
      }).concat(r.data.filter(function (c) { return !categoriaFixa(c); }));
      desenharCategorias();
      if (categorias.map(function (c) { return c.slug; }).join() !== ordemSalva) salvarOrdem();
    });
  }
  function categoriaFixa(c) { return CATEGORIAS_FIXAS.indexOf(c.slug) !== -1; }
  function totalFixas() { return categorias.filter(categoriaFixa).length; }
  function desenharCategorias() {
    var caixa = $('#lista-categorias');
    if (!categorias.length) { caixa.innerHTML = '<li class="estado">Nenhuma categoria cadastrada.</li>'; return; }
    caixa.innerHTML = categorias.map(function (c, i) {
      var total = produtos.filter(function (p) { return p.tags.indexOf(c.slug) !== -1; }).length;
      var capaHTML = '<label class="categoria-capa' + (c.image ? ' tem-capa' : '') + '" title="Escolher a foto de capa de ' + esc(c.name) + '">' +
        (c.image ? '<img src="' + esc(c.image) + '" alt="" width="48" height="60">' : '<span>Capa</span>') +
        '<input type="file" accept="image/*" data-capa="' + esc(c.slug) + '" aria-label="Escolher a foto de capa de ' + esc(c.name) + '"></label>';
      var tirarCapaHTML = c.image ? '<button class="botao-texto" type="button" data-tirar-capa="' + esc(c.slug) + '">Tirar capa</button>' : '';
      if (categoriaFixa(c)) {
        return '<li class="categoria categoria-fixa" data-slug="' + esc(c.slug) + '" data-fixa><span class="categoria-trava">Fixa</span>' + capaHTML +
          '<strong class="categoria-nome">' + esc(c.name) + '</strong>' +
          '<span class="categoria-total">' + total + (total === 1 ? ' produto' : ' produtos') + '</span>' + tirarCapaHTML + '</li>';
      }
      return '<li class="categoria" data-slug="' + esc(c.slug) + '"><span class="categoria-alca" data-arrastar title="Arraste para mudar a ordem" aria-hidden="true">⠿</span><div class="categoria-ordem">' +
        '<button class="fechar" type="button" data-subir="' + esc(c.slug) + '" aria-label="Mover ' + esc(c.name) + ' para cima"' + (i === totalFixas() ? ' disabled' : '') + '>↑</button>' +
        '<button class="fechar" type="button" data-descer="' + esc(c.slug) + '" aria-label="Mover ' + esc(c.name) + ' para baixo"' + (i === categorias.length - 1 ? ' disabled' : '') + '>↓</button></div>' +
        capaHTML +
        '<input data-nome="' + esc(c.slug) + '" value="' + esc(c.name) + '" maxlength="40" aria-label="Nome da categoria">' +
        '<select class="categoria-departamento" data-departamento="' + esc(c.slug) + '" aria-label="Departamento de ' + esc(c.name) + '">' +
        [['ambos', 'Feminino e masculino'], ['feminino', 'Feminino'], ['masculino', 'Masculino']].map(function (d) {
          return '<option value="' + d[0] + '"' + ((c.department || 'ambos') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
        }).join('') + '</select>' +
        '<span class="categoria-total">' + total + (total === 1 ? ' produto' : ' produtos') + '</span>' +
        tirarCapaHTML +
        '<button class="botao-texto botao-perigo" type="button" data-tirar-categoria="' + esc(c.slug) + '">Remover</button></li>';
    }).join('');
  }
  function salvarCapa(categoria, imagem) {
    var antiga = categoria.image;
    return sb.from('categories').update({ image: imagem }).eq('slug', categoria.slug).select().then(function (r) {
      if (r.error || !r.data.length) throw new Error('capa');
      categoria.image = imagem;
      if (antiga) removerFoto(antiga);
      desenharCategorias();
    });
  }
  function desenharMarcas(marcadas) {
    $('#categorias').innerHTML = categorias.map(function (c) {
      return '<label class="marca-linha"><input type="checkbox" name="categoria" value="' + esc(c.slug) + '"' + (marcadas.indexOf(c.slug) !== -1 ? ' checked' : '') + '> ' + esc(c.name) + '</label>';
    }).join('');
  }
  function criarCategoria(nome) {
    var limpo = nome.trim().replace(/\s+/g, ' ');
    if (limpo.length < 2) return Promise.reject(new Error('Informe o nome da categoria.'));
    var repetida = categorias.some(function (c) { return c.name.toLowerCase() === limpo.toLowerCase(); });
    if (repetida) return Promise.reject(new Error('Essa categoria já existe.'));
    var nova = {
      slug: slugCategoria(limpo),
      name: limpo,
      position: categorias.reduce(function (maior, c) { return Math.max(maior, c.position); }, 0) + 1
    };
    return sb.from('categories').insert(nova).select().then(function (r) {
      if (r.error || !r.data.length) throw new Error('Não foi possível criar a categoria.');
      return carregarCategorias().then(function () { return nova.slug; });
    });
  }
  function moverCategoria(slug, sentido) {
    var i = categorias.findIndex(function (c) { return c.slug === slug; });
    var alvo = i + sentido;
    if (alvo < totalFixas() || alvo >= categorias.length) return;
    var movida = categorias.splice(i, 1)[0];
    categorias.splice(alvo, 0, movida);
    var antes = posicoesDasLinhas();
    desenharCategorias();
    deslizarLinhas(antes);
    var seletor = sentido < 0 ? '[data-subir="' : '[data-descer="';
    var botao = $(seletor + slug + '"]');
    if (botao) {
      botao.classList.add(sentido < 0 ? 'seta-saltou-cima' : 'seta-saltou-baixo');
      if (!botao.disabled) botao.focus();
    }
    salvarOrdem();
  }
  /* A lista é redesenhada; cada linha parte da posição antiga e desliza até a nova. */
  function posicoesDasLinhas() {
    var posicoes = {};
    document.querySelectorAll('#lista-categorias .categoria').forEach(function (linha) {
      posicoes[linha.dataset.slug] = linha.getBoundingClientRect().top;
    });
    return posicoes;
  }
  function deslizarLinhas(antes, ignorar) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('#lista-categorias .categoria').forEach(function (linha) {
      if (linha === ignorar) return;
      var distancia = antes[linha.dataset.slug] - linha.getBoundingClientRect().top;
      if (!distancia) return;
      linha.animate([{ transform: 'translateY(' + distancia + 'px)' }, { transform: 'translateY(0)' }],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    });
  }
  function salvarOrdem() {
    sb.rpc('admin_reorder_categories', { p_slugs: categorias.map(function (c) { return c.slug; }) }).then(function (r) {
      if (r.error) { avisar('Não foi possível salvar a ordem.'); carregarCategorias(); }
    });
  }
  /* A linha segue o ponteiro; as vizinhas trocam de lugar na lista e deslizam para abrir espaço. */
  var arrasto = null;
  $('#lista-categorias').addEventListener('pointerdown', function (evento) {
    var alca = evento.target.closest('[data-arrastar]');
    if (!alca) return;
    evento.preventDefault();
    var linha = alca.closest('.categoria');
    arrasto = { linha: linha, inicioY: evento.pageY, topoInicial: linha.offsetTop };
    try { alca.setPointerCapture(evento.pointerId); } catch (e) {}
    linha.classList.add('arrastando');
    document.body.classList.add('arrastando-categoria');
  });
  document.addEventListener('pointermove', function (evento) {
    if (!arrasto) return;
    var linha = arrasto.linha;
    var caixa = linha.parentNode;
    var topo = arrasto.topoInicial + evento.pageY - arrasto.inicioY;
    var centro = topo + linha.offsetHeight / 2;
    var posicoes = posicoesDasLinhas();
    var trocou = false;
    var antes = linha.previousElementSibling;
    var depois = linha.nextElementSibling;
    while (antes && !antes.hasAttribute('data-fixa') && centro < antes.offsetTop + antes.offsetHeight / 2) {
      caixa.insertBefore(antes, linha.nextElementSibling);
      antes = linha.previousElementSibling;
      trocou = true;
    }
    while (depois && centro > depois.offsetTop + depois.offsetHeight / 2) {
      caixa.insertBefore(depois, linha);
      depois = linha.nextElementSibling;
      trocou = true;
    }
    var primeiraLivre = caixa.querySelector('.categoria:not([data-fixa])');
    var ultima = caixa.lastElementChild;
    topo = Math.max(primeiraLivre.offsetTop, Math.min(topo, ultima.offsetTop + ultima.offsetHeight - linha.offsetHeight));
    linha.style.transform = 'translateY(' + (topo - linha.offsetTop) + 'px)';
    if (trocou) deslizarLinhas(posicoes, linha);
    if (evento.clientY < 70) window.scrollBy(0, -12);
    else if (evento.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
  });
  function soltarCategoria(evento) {
    if (!arrasto) return;
    var linha = arrasto.linha;
    arrasto = null;
    document.body.classList.remove('arrastando-categoria');
    var ordem = [].map.call(linha.parentNode.children, function (l) { return l.dataset.slug; });
    var mudou = ordem.some(function (slug, i) { return slug !== categorias[i].slug; });
    var posicoes = posicoesDasLinhas();
    if (evento.type === 'pointerup' && mudou) {
      categorias.sort(function (a, b) { return ordem.indexOf(a.slug) - ordem.indexOf(b.slug); });
      salvarOrdem();
    }
    desenharCategorias();
    deslizarLinhas(posicoes);
  }
  document.addEventListener('pointerup', soltarCategoria);
  document.addEventListener('pointercancel', soltarCategoria);
  $('#form-categoria').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var campo = $('#nova-categoria');
    criarCategoria(campo.value).then(function () {
      campo.value = '';
      avisar('Categoria criada.');
    }, function (falha) { avisar(falha.message); });
  });
  $('#lista-categorias').addEventListener('click', function (evento) {
    var tirarCapa = evento.target.closest('[data-tirar-capa]');
    if (tirarCapa) {
      var semCapa = categorias.filter(function (c) { return c.slug === tirarCapa.dataset.tirarCapa; })[0];
      salvarCapa(semCapa, null).then(function () { avisar('Capa removida.'); }, function () { avisar('Não foi possível remover a capa.'); });
      return;
    }
    var subir = evento.target.closest('[data-subir]');
    var descer = evento.target.closest('[data-descer]');
    var tirar = evento.target.closest('[data-tirar-categoria]');
    if (subir) moverCategoria(subir.dataset.subir, -1);
    if (descer) moverCategoria(descer.dataset.descer, 1);
    if (!tirar) return;
    var slug = tirar.dataset.tirarCategoria;
    var categoria = categorias.filter(function (c) { return c.slug === slug; })[0];
    if (!window.confirm('Remover a categoria "' + categoria.name + '"? Os produtos continuam na loja, só deixam de estar nela.')) return;
    sb.rpc('admin_delete_category', { p_slug: slug }).then(function (r) {
      avisar(r.error ? 'Não foi possível remover a categoria.' : 'Categoria removida.');
      carregarCategorias().then(carregarProdutos);
    });
  });
  $('#lista-categorias').addEventListener('change', function (evento) {
    if (evento.target.matches('[data-departamento]')) {
      var campoDep = evento.target;
      var categoriaDep = categorias.filter(function (c) { return c.slug === campoDep.dataset.departamento; })[0];
      sb.from('categories').update({ department: campoDep.value }).eq('slug', categoriaDep.slug).select().then(function (r) {
        if (r.error || !r.data.length) {
          campoDep.value = categoriaDep.department || 'ambos';
          avisar('Não foi possível salvar o departamento.');
          return;
        }
        categoriaDep.department = campoDep.value;
        avisar('Departamento salvo.');
      });
      return;
    }
    if (evento.target.matches('[data-capa]')) {
      var alvoCapa = categorias.filter(function (c) { return c.slug === evento.target.dataset.capa; })[0];
      var arquivoCapa = evento.target.files[0];
      if (!arquivoCapa) return;
      avisar('Enviando a capa…');
      enviarFoto(arquivoCapa).then(function (url) {
        return salvarCapa(alvoCapa, url).catch(function (erro) { removerFoto(url); throw erro; });
      }).then(function () { avisar('Capa salva.'); }, function () {
        avisar('Não foi possível salvar a capa.');
        desenharCategorias();
      });
      return;
    }
    var campo = evento.target.closest('[data-nome]');
    if (!campo) return;
    var categoria = categorias.filter(function (c) { return c.slug === campo.dataset.nome; })[0];
    var nome = campo.value.trim().replace(/\s+/g, ' ');
    var repetida = categorias.some(function (c) { return c !== categoria && c.name.toLowerCase() === nome.toLowerCase(); });
    if (nome.length < 2 || repetida) {
      campo.value = categoria.name;
      avisar(repetida ? 'Essa categoria já existe.' : 'Informe o nome da categoria.');
      return;
    }
    sb.from('categories').update({ name: nome }).eq('slug', categoria.slug).select().then(function (r) {
      if (r.error || !r.data.length) { campo.value = categoria.name; avisar('Não foi possível renomear.'); return; }
      categoria.name = nome;
      avisar('Categoria renomeada.');
    });
  });
  function adicionarCategoriaNoProduto() {
    var campo = $('#nova-categoria-produto');
    var erro = $('#erro-produto');
    var marcadas = [].map.call(form.querySelectorAll('[name="categoria"]:checked'), function (c) { return c.value; });
    erro.hidden = true;
    criarCategoria(campo.value).then(function (slug) {
      campo.value = '';
      desenharMarcas(marcadas.concat(slug));
    }, function (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    });
  }
  $('#criar-categoria').addEventListener('click', adicionarCategoriaNoProduto);
  $('#nova-categoria-produto').addEventListener('keydown', function (evento) {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    adicionarCategoriaNoProduto();
  });

  /* Editor */
  var editor = $('#editor');
  var form = $('#form-produto');
  $('#atalhos').innerHTML = ATALHOS.map(function (t) {
    return '<button class="botao-texto" type="button" data-atalho="' + t + '">+ ' + t + '</button>';
  }).join('') + '<button class="botao-texto" type="button" data-atalho="">+ Outro tamanho</button><button class="botao-texto" type="button" data-nova-cor>+ Cor</button>';

  var COR_PADRAO = '#d6d1c6';
  var PALETA = [['Preto', '#111111'], ['Branco', '#ffffff'], ['Off-white', '#f3eee3'], ['Cinza', '#8c8c8c'], ['Bege', '#d9c2a3'], ['Nude', '#e3bfa6'],
    ['Caramelo', '#b5722f'], ['Marrom', '#5e3a22'], ['Vinho', '#6e1423'], ['Vermelho', '#c8102e'], ['Laranja', '#e8741e'], ['Mostarda', '#c8960c'],
    ['Amarelo', '#f4cf2e'], ['Verde claro', '#9ccc8a'], ['Verde', '#2f7d4f'], ['Verde militar', '#4b5320'], ['Azul claro', '#8cc0e8'], ['Azul', '#1f5fbf'],
    ['Azul marinho', '#14264f'], ['Lilás', '#c3a6e0'], ['Roxo', '#5f2c91'], ['Rosa claro', '#f4c2d0'], ['Rosa', '#e0709a'], ['Pink', '#e0218a'],
    ['Dourado', '#c9a227'], ['Prateado', '#c0c0c8'], ['Estampado', '#b9a89a']];
  var corEscolhendo = -1;
  var grade = { cores: [], tamanhos: [], q: [] };

  function lerGrade() {
    document.querySelectorAll('#grade .c-nome').forEach(function (campo, i) { grade.cores[i].name = campo.value; });
    document.querySelectorAll('#grade .t-nome').forEach(function (campo, i) { grade.tamanhos[i] = campo.value; });
    document.querySelectorAll('#grade .q').forEach(function (campo) {
      grade.q[+campo.dataset.c][+campo.dataset.t] = campo.value === '' ? 0 : Number(campo.value);
    });
  }
  function desenharGrade() {
    $('#grade').innerHTML = '<table class="grade"><thead><tr><th>Cor</th>' + grade.tamanhos.map(function (t, ti) {
      return '<th><button class="grade-tirar" type="button" data-tirar-tamanho="' + ti + '" aria-label="Remover tamanho ' + esc(t) + '">remover</button>' +
        '<input class="t-nome" maxlength="12" value="' + esc(t) + '" aria-label="Nome do tamanho"></th>';
    }).join('') + '<th></th></tr></thead><tbody>' + grade.cores.map(function (c, ci) {
      var primeira = c.fotos[0];
      var previa = primeira ? (primeira.previa || fotoSrc(primeira.url)) : '';
      return '<tr><td><div class="grade-cor">' + (modoFotos === 'cor' ? '<label class="c-foto" title="Adicionar fotos desta cor">' +
        (previa ? '<img src="' + esc(previa) + '" alt="" width="42" height="42">' : '<span>Foto</span>') +
        (c.fotos.length > 1 ? '<em>' + c.fotos.length + '</em>' : '') +
        '<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-foto-cor="' + ci + '" aria-label="Adicionar fotos da cor ' + esc(c.name) + '"></label>' : '') +
        '<button class="c-amostra" type="button" data-paleta="' + ci + '" style="background:' + (/^#[0-9a-f]{6}$/i.test(c.hex || '') ? c.hex : COR_PADRAO) + '" aria-label="Escolher cor">' +
        '</button>' +
        '<input class="c-nome" maxlength="30" value="' + esc(c.name) + '" placeholder="Nome da cor" aria-label="Nome da cor"></div></td>' +
        grade.tamanhos.map(function (t, ti) {
          return '<td><input class="q" type="number" min="0" max="9999" step="1" value="' + esc(grade.q[ci][ti]) + '" data-c="' + ci + '" data-t="' + ti + '" aria-label="Estoque da cor ' + esc(c.name) + ', tamanho ' + esc(t) + '"></td>';
        }).join('') +
        '<td><button class="fechar" type="button" data-tirar-cor="' + ci + '" aria-label="Remover cor ' + esc(c.name) + '">×</button></td></tr>';
    }).join('') + '</tbody></table>';
    desenharFotosCores();
  }
  /* Fotos da galeria: as mesmas para todas as cores (fotosGerais) ou uma lista por cor */
  function listaDeFotos(chave) { return chave === 'g' ? fotosGerais : grade.cores[+chave].fotos; }
  function blocoFotos(titulo, fotos, chave, nomeCor) {
    return '<div class="fotos-cor"><strong>' + titulo + '</strong><div class="fotos-lista">' +
      fotos.map(function (f, fi) {
        return '<figure class="foto-item"><img src="' + esc(f.previa || fotoSrc(f.url)) + '" alt="" width="64" height="80">' +
          '<button class="foto-tirar" type="button" data-tirar-foto="' + chave + ':' + fi + '" aria-label="Remover foto ' + (fi + 1) + nomeCor + '">×</button>' +
          (fi === 0 ? '<span class="foto-principal">Primeira</span>'
            : '<button class="foto-tornar" type="button" data-principal="' + chave + ':' + fi + '">Tornar primeira</button>') + '</figure>';
      }).join('') +
      '<label class="fotos-mais" title="Adicionar fotos"><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-foto-cor="' + chave + '" aria-label="Adicionar fotos' + nomeCor + '"><span>+ Fotos</span></label>' +
      '</div></div>';
  }
  function desenharFotosCores() {
    form.modoFotos.value = modoFotos;
    $('#fotos-cores').innerHTML = modoFotos === 'geral'
      ? blocoFotos('Fotos do produto, para todas as cores', fotosGerais, 'g', ' do produto')
      : grade.cores.map(function (c, ci) {
        return blocoFotos('Fotos da cor ' + esc(c.name || 'sem nome'), c.fotos, ci, ' da cor ' + esc(c.name));
      }).join('');
  }
  function adicionarFotosCor(chave, arquivos) {
    var validos = [].filter.call(arquivos, fotoValida);
    if (!validos.length) return;
    lerGrade();
    validos.forEach(function (arquivo) {
      listaDeFotos(String(chave)).push({ arquivo: arquivo, previa: URL.createObjectURL(arquivo) });
    });
    desenharGrade();
  }
  $('#fotos-cores').addEventListener('change', function (evento) {
    var campo = evento.target.closest('[data-foto-cor]');
    if (campo) adicionarFotosCor(campo.dataset.fotoCor, campo.files);
  });
  $('#fotos-cores').addEventListener('click', function (evento) {
    var tirar = evento.target.closest('[data-tirar-foto]');
    var principal = evento.target.closest('[data-principal]');
    if (!tirar && !principal) return;
    lerGrade();
    var partes = (tirar || principal).dataset[tirar ? 'tirarFoto' : 'principal'].split(':');
    var fotos = listaDeFotos(partes[0]);
    var foto = fotos.splice(+partes[1], 1)[0];
    if (principal) fotos.unshift(foto);
    desenharGrade();
  });
  form.addEventListener('change', function (evento) {
    if (evento.target.name !== 'modoFotos') return;
    lerGrade();
    modoFotos = evento.target.value;
    desenharGrade();
  });
  function desenharVideos() {
    $('#videos-lista').innerHTML = videos.map(function (v, i) {
      return '<div class="video-item"><video src="' + esc(v.previa || v.url) + '" muted playsinline preload="metadata"></video>' +
        '<button class="foto-tirar" type="button" data-tirar-video="' + i + '" aria-label="Remover vídeo ' + (i + 1) + '">×</button></div>';
    }).join('');
  }
  function videoValido(arquivo) {
    var ok = !!VIDEO_TIPOS[arquivo.type] && arquivo.size <= VIDEO_MAX_BYTES;
    var erro = $('#foto-erro');
    erro.textContent = 'Use um vídeo MP4 ou WebM de até 50 MB.';
    erro.hidden = ok;
    return ok;
  }
  $('#video').addEventListener('change', function () {
    var arquivos = [].filter.call(this.files, videoValido);
    this.value = '';
    var espaco = VIDEOS_MAX - videos.length;
    if (arquivos.length > espaco) {
      $('#foto-erro').textContent = 'O produto pode ter até ' + VIDEOS_MAX + ' vídeos.';
      $('#foto-erro').hidden = false;
      arquivos = arquivos.slice(0, Math.max(espaco, 0));
    }
    arquivos.forEach(function (arquivo) { videos.push({ arquivo: arquivo, previa: URL.createObjectURL(arquivo) }); });
    desenharVideos();
  });
  $('#videos-lista').addEventListener('click', function (evento) {
    var tirar = evento.target.closest('[data-tirar-video]');
    if (!tirar) return;
    videos.splice(+tirar.dataset.tirarVideo, 1);
    desenharVideos();
  });
  function enviarVideo(arquivo) {
    var nome = crypto.randomUUID() + '.' + VIDEO_TIPOS[arquivo.type];
    return sb.storage.from(BUCKET).upload(nome, arquivo, { contentType: arquivo.type }).then(function (r) {
      if (r.error) throw r.error;
      return sb.storage.from(BUCKET).getPublicUrl(nome).data.publicUrl;
    });
  }
  $('#paleta-opcoes').innerHTML = PALETA.map(function (c, i) {
    return '<button type="button" data-cor-paleta="' + i + '"><i style="background:' + c[1] + '"></i>' + c[0] + '</button>';
  }).join('');
  function abrirPaleta(indice) {
    corEscolhendo = indice;
    $('#paleta').hidden = false;
    $('#paleta').scrollIntoView({ block: 'nearest' });
  }
  function fecharPaleta() {
    corEscolhendo = -1;
    $('#paleta').hidden = true;
  }
  $('#paleta').addEventListener('click', function (evento) {
    var opcao = evento.target.closest('[data-cor-paleta]');
    if (evento.target.closest('[data-fechar-paleta]')) { fecharPaleta(); return; }
    if (!opcao || corEscolhendo < 0) return;
    lerGrade();
    var escolhida = PALETA[+opcao.dataset.corPaleta];
    grade.cores[corEscolhendo].name = escolhida[0];
    grade.cores[corEscolhendo].hex = escolhida[1];
    desenharGrade();
    fecharPaleta();
  });
  $('#grade').addEventListener('input', function (evento) {
    if (!evento.target.classList.contains('c-nome')) return;
    var nome = evento.target.value.trim().toLowerCase();
    var achada = PALETA.filter(function (c) { return c[0].toLowerCase() === nome; })[0];
    var linha = [].indexOf.call(document.querySelectorAll('#grade .c-nome'), evento.target);
    if (!achada) return;
    grade.cores[linha].hex = achada[1];
    document.querySelectorAll('#grade .c-amostra')[linha].style.background = achada[1];
  });
  function adicionarTamanho(nome) {
    lerGrade();
    if (nome && grade.tamanhos.indexOf(nome) !== -1) return;
    grade.tamanhos.push(nome);
    grade.q.forEach(function (linha) { linha.push(0); });
    desenharGrade();
  }
  $('#grade').addEventListener('change', function (evento) {
    var campo = evento.target.closest('[data-foto-cor]');
    if (campo) adicionarFotosCor(+campo.dataset.fotoCor, campo.files);
  });
  $('#grade').addEventListener('click', function (evento) {
    var amostra = evento.target.closest('[data-paleta]');
    if (amostra) { abrirPaleta(+amostra.dataset.paleta); return; }
    var cor = evento.target.closest('[data-tirar-cor]');
    var tamanho = evento.target.closest('[data-tirar-tamanho]');
    if (!cor && !tamanho) return;
    fecharPaleta();
    lerGrade();
    if (cor) {
      grade.cores.splice(+cor.dataset.tirarCor, 1);
      grade.q.splice(+cor.dataset.tirarCor, 1);
    } else {
      var indice = +tamanho.dataset.tirarTamanho;
      grade.tamanhos.splice(indice, 1);
      grade.q.forEach(function (linha) { linha.splice(indice, 1); });
    }
    desenharGrade();
  });
  $('#atalhos').addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-atalho]');
    if (botao) { adicionarTamanho(botao.dataset.atalho); return; }
    if (evento.target.closest('[data-nova-cor]')) {
      lerGrade();
      grade.cores.push({ name: '', hex: COR_PADRAO, fotos: [] });
      grade.q.push(grade.tamanhos.map(function () { return 0; }));
      desenharGrade();
      abrirPaleta(grade.cores.length - 1);
    }
  });
  function abrirEditor(p) {
    editando = p || null;
    fotoNova = null;
    form.reset();
    $('#foto').value = '';
    $('#foto-erro').hidden = true;
    $('#nova-categoria-produto').value = '';
    desenharMarcas(p ? p.tags : []);
    $('#foto-texto').textContent = 'Arraste a foto para cá ou use o botão.';
    $('#foto-botao-texto').textContent = p ? 'Trocar foto' : 'Escolher foto';
    $('#erro-produto').hidden = true;
    $('#editor-titulo').textContent = p ? 'Editar produto' : 'Novo produto';
    $('#foto-previa').src = fotoSrc(p ? p.image : FOTO_PADRAO);
    if (p) {
      form.nome.value = p.name;
      form.descricao.value = p.description;
      form.preco.value = paraTexto(p.price_cents);
      form.promo.value = p.promo_price_cents ? paraTexto(p.promo_price_cents) : '';
      form.pix.value = p.pix_price_cents ? paraTexto(p.pix_price_cents) : '';
      form.promoPix.value = p.promo_pix_price_cents ? paraTexto(p.promo_pix_price_cents) : '';
      form.ativo.checked = p.active;
      grade = {
        cores: p.colors.map(function (c) {
          return { name: c.name, hex: c.hex || COR_PADRAO, fotos: fotosDaCor(c).map(function (url) { return { url: url }; }) };
        }),
        tamanhos: p.sizes.slice(),
        q: p.colors.map(function (c) { return p.sizes.map(function (t) { return qtd(p, c.name, t); }); })
      };
    } else {
      grade = { cores: [{ name: 'Única', hex: COR_PADRAO, fotos: [] }], tamanhos: ['P', 'M', 'G'], q: [[0, 0, 0]] };
    }
    videos = (p && p.videos ? p.videos : []).map(function (url) { return { url: url }; });
    fotosGerais = (p && p.images ? p.images : []).map(function (url) { return { url: url }; });
    modoFotos = !fotosGerais.length && grade.cores.some(function (c) { return c.fotos.length; }) ? 'cor' : 'geral';
    desenharVideos();
    desenharGrade();
    fecharPaleta();
    editor.showModal();
  }
  $('#novo').addEventListener('click', function () { abrirEditor(null); });
  editor.addEventListener('click', function (evento) {
    if (evento.target === editor || evento.target.closest('[data-fechar]')) editor.close();
  });
  function fotoValida(arquivo) {
    var ok = /^image\/(jpeg|png|webp)$/.test(arquivo.type) && arquivo.size <= FOTO_MAX_BYTES;
    var erro = $('#foto-erro');
    erro.textContent = 'Use uma foto JPG, PNG ou WebP de até 20 MB.';
    erro.hidden = ok;
    return ok;
  }
  function escolherFoto(arquivo) {
    if (!arquivo || !fotoValida(arquivo)) return;
    fotoNova = arquivo;
    $('#foto-previa').src = URL.createObjectURL(arquivo);
    $('#foto-texto').textContent = arquivo.name;
    $('#foto-botao-texto').textContent = 'Trocar foto';
  }
  $('#foto').addEventListener('change', function () {
    escolherFoto(this.files[0]);
    this.value = '';
  });
  ['dragover', 'drop'].forEach(function (nome) {
    editor.addEventListener(nome, function (evento) { evento.preventDefault(); });
  });
  var areaFoto = $('#foto-area');
  ['dragenter', 'dragover'].forEach(function (nome) {
    areaFoto.addEventListener(nome, function () { areaFoto.classList.add('arrastando'); });
  });
  ['dragleave', 'drop'].forEach(function (nome) {
    areaFoto.addEventListener(nome, function () { areaFoto.classList.remove('arrastando'); });
  });
  areaFoto.addEventListener('drop', function (evento) {
    escolherFoto(evento.dataTransfer.files[0]);
  });
  function gerarBlob(tela, tipo) {
    return new Promise(function (resolver, rejeitar) {
      tela.toBlob(function (blob) { blob ? resolver(blob) : rejeitar(new Error('foto')); }, tipo, 0.84);
    });
  }
  function padronizarFoto(arquivo) {
    return createImageBitmap(arquivo).then(function (imagem) {
      var corteL = Math.min(imagem.width, imagem.height * FOTO_PROPORCAO);
      var corteA = corteL / FOTO_PROPORCAO;
      var corteX = (imagem.width - corteL) / 2;
      var corteY = (imagem.height - corteA) * FOTO_FOCO_Y;
      var tela = document.createElement('canvas');
      tela.width = Math.round(Math.min(FOTO_LARGURA, corteL));
      tela.height = Math.round(tela.width / FOTO_PROPORCAO);
      var pincel = tela.getContext('2d');
      pincel.fillStyle = '#ffffff';
      pincel.fillRect(0, 0, tela.width, tela.height);
      pincel.imageSmoothingQuality = 'high';
      pincel.drawImage(imagem, corteX, corteY, corteL, corteA, 0, 0, tela.width, tela.height);
      return gerarBlob(tela, 'image/webp').then(function (blob) {
        return blob.type === 'image/webp' ? blob : gerarBlob(tela, 'image/jpeg');
      });
    });
  }
  function enviarFoto(arquivo) {
    if (!arquivo) return Promise.resolve(null);
    return padronizarFoto(arquivo).then(function (blob) {
      var nome = crypto.randomUUID() + (blob.type === 'image/webp' ? '.webp' : '.jpg');
      return sb.storage.from(BUCKET).upload(nome, blob, { contentType: blob.type }).then(function (r) {
        if (r.error) throw r.error;
        return sb.storage.from(BUCKET).getPublicUrl(nome).data.publicUrl;
      });
    });
  }
  function lerFormulario() {
    var nome = form.nome.value.trim();
    var preco = paraCentavos(form.preco.value);
    var textoPromo = form.promo.value.trim();
    var promo = textoPromo ? paraCentavos(textoPromo) : null;
    if (nome.length < 2) throw new Error('Informe o nome do produto.');
    if (!preco) throw new Error('Informe um preço válido, por exemplo 259,90.');
    if (textoPromo && !promo) throw new Error('Informe um preço promocional válido.');
    if (promo && promo >= preco) throw new Error('A promoção no cartão precisa ser menor que o valor no cartão.');
    var textoPix = form.pix.value.trim();
    var textoPromoPix = form.promoPix.value.trim();
    var pix = textoPix ? paraCentavos(textoPix) : null;
    var promoPix = textoPromoPix ? paraCentavos(textoPromoPix) : null;
    if (textoPix && !pix) throw new Error('Informe um valor no Pix válido.');
    if (textoPromoPix && !promoPix) throw new Error('Informe uma promoção no Pix válida.');
    if (pix && pix > preco) throw new Error('O valor no Pix não pode ser maior que o valor no cartão.');
    if (promoPix && promoPix >= (pix || preco)) throw new Error('A promoção no Pix precisa ser menor que o valor no Pix.');
    lerGrade();
    var nomesCor = grade.cores.map(function (c) { return c.name.trim(); });
    var tamanhos = grade.tamanhos.map(function (x) { return x.trim(); });
    if (!nomesCor.length) throw new Error('Adicione pelo menos uma cor.');
    if (!tamanhos.length) throw new Error('Adicione pelo menos um tamanho.');
    if (nomesCor.indexOf('') !== -1) throw new Error('Preencha o nome de todas as cores.');
    if (tamanhos.indexOf('') !== -1) throw new Error('Preencha o nome de todos os tamanhos.');
    if (new Set(nomesCor).size !== nomesCor.length) throw new Error('Há cores repetidas.');
    if (new Set(tamanhos).size !== tamanhos.length) throw new Error('Há tamanhos repetidos.');
    var estoque = {};
    nomesCor.forEach(function (cor, ci) {
      estoque[cor] = {};
      tamanhos.forEach(function (tam, ti) {
        var valor = grade.q[ci][ti];
        if (!Number.isInteger(valor) || valor < 0) throw new Error('O estoque de ' + cor + ', ' + tam + ' precisa ser um número inteiro.');
        estoque[cor][tam] = valor;
      });
    });
    return {
      name: nome,
      description: form.descricao.value.trim(),
      price_cents: preco,
      promo_price_cents: promo,
      pix_price_cents: pix,
      promo_pix_price_cents: promoPix,
      sizes: tamanhos,
      colors: grade.cores.map(function (c, i) { return { name: nomesCor[i], hex: c.hex }; }),
      stock: estoque,
      tags: [].map.call(form.querySelectorAll('[name="categoria"]:checked'), function (c) { return c.value; }),
      active: form.ativo.checked
    };
  }
  form.addEventListener('submit', function (evento) {
    evento.preventDefault();
    var erro = $('#erro-produto');
    var botao = form.querySelector('button[type="submit"]');
    var dados;
    erro.hidden = true;
    try { dados = lerFormulario(); } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
      return;
    }
    ocupado(botao, true, videos.some(function (v) { return v.arquivo; }) ? 'Enviando vídeos…' : 'Salvando…');
    var antigo = editando;
    function enviarLista(fotos) {
      return Promise.all(fotos.map(function (f) { return f.url ? Promise.resolve(f.url) : enviarFoto(f.arquivo); }));
    }
    var porCor = modoFotos === 'cor';
    var envioFotosCores = Promise.all(grade.cores.map(function (c) { return porCor ? enviarLista(c.fotos) : Promise.resolve([]); }));
    var envioFotosGerais = porCor ? Promise.resolve([]) : enviarLista(fotosGerais);
    var envioVideos = Promise.all(videos.map(function (v) { return v.url ? Promise.resolve(v.url) : enviarVideo(v.arquivo); }));
    Promise.all([enviarFoto(fotoNova), envioFotosCores, envioVideos, envioFotosGerais]).then(function (envios) {
      var url = envios[0];
      dados.colors.forEach(function (c, i) {
        c.images = envios[1][i];
        c.image = c.images[0] || null;
      });
      dados.videos = envios[2];
      dados.images = envios[3];
      var primeiraCor = dados.colors.filter(function (c) { return c.image; })[0];
      dados.image = url || (antigo ? antigo.image : (primeiraCor ? primeiraCor.image : FOTO_PADRAO));
      if (antigo) return sb.from('products').update(dados).eq('id', antigo.id).select().then(function (r) { return [r, url]; });
      dados.slug = criarSlug(dados.name);
      return sb.from('products').insert(dados).select().then(function (r) { return [r, url]; });
    }).then(function (resultado) {
      var r = resultado[0];
      ocupado(botao, false);
      if (r.error || !r.data.length) {
        erro.textContent = 'Não foi possível salvar. Entre novamente e tente de novo.';
        erro.hidden = false;
        return;
      }
      if (antigo) {
        var emUso = arquivosDoProduto(dados);
        arquivosDoProduto(antigo).forEach(function (arquivo) {
          if (emUso.indexOf(arquivo) === -1) removerFoto(arquivo);
        });
      }
      editor.close();
      avisar('Produto salvo.');
      carregarProdutos();
    }).catch(function () {
      ocupado(botao, false);
      erro.textContent = 'Não foi possível enviar as fotos ou os vídeos. Confira o formato e o tamanho e tente de novo.';
      erro.hidden = false;
    });
  });

  /* Pedidos */
  function carregarPedidos() {
    return sb.from('orders').select('*,order_items(*)').order('created_at', { ascending: false }).limit(200).then(function (r) {
      if (r.error) { $('#lista-pedidos').innerHTML = '<p class="estado">Não foi possível carregar os pedidos.</p>'; return; }
      pedidos = r.data;
      desenharPedidos();
    });
  }
  function desenharPedidos() {
    var filtro = $('#filtro-pedidos').value;
    var lista = pedidos.filter(function (o) { return !filtro || o.status === filtro; });
    var pendentes = pedidos.filter(function (o) { return o.status === 'novo'; }).length;
    var caixa = $('#lista-pedidos');
    $('[data-aba="pedidos"]').textContent = pendentes ? 'Pedidos (' + pendentes + ')' : 'Pedidos';
    if (!lista.length) { caixa.innerHTML = '<p class="estado">Nenhum pedido por aqui.</p>'; return; }
    caixa.innerHTML = '<ul class="pedidos">' + lista.map(function (o) {
      var numeros = o.phone.replace(/\D/g, '');
      var whatsapp = 'https://wa.me/' + (numeros.indexOf('55') === 0 && numeros.length > 11 ? numeros : '55' + numeros);
      var controle;
      if (o.status === 'cancelado') {
        controle = '<span class="selo selo-zero">Cancelado</span><button class="botao-texto" type="button" data-reabrir="' + esc(o.id) + '">Reabrir</button>';
      } else if (o.stock_deducted) {
        controle = '<label class="status">Status<select data-status="' + esc(o.id) + '">' + STATUS_FINALIZADO.map(function (s) {
          return '<option value="' + s[0] + '"' + (s[0] === o.status ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select></label>';
      } else {
        controle = '<span class="selo selo-espera">Aguardando pagamento</span>';
      }
      var acoes = !o.stock_deducted && o.status !== 'cancelado'
        ? '<div class="pedido-acoes"><button class="botao botao-vinho" type="button" data-finalizar="' + esc(o.id) + '" data-numero="' + esc(o.number) + '">Finalizar pedido</button>' +
          '<button class="botao-texto botao-perigo" type="button" data-cancelar="' + esc(o.id) + '" data-numero="' + esc(o.number) + '">Cancelar pedido</button></div>'
        : '';
      return '<li class="pedido"><div class="pedido-topo"><h3>Pedido #' + esc(o.number) + '</h3><div class="pedido-controle">' + controle + '</div></div>' +
        '<p>' + new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' · <strong>' + dinheiro(o.total_cents) + '</strong></p>' +
        '<p>' + esc(o.customer_name) + ' · <a href="' + esc(whatsapp) + '" target="_blank" rel="noopener">' + esc(o.phone) + '</a>' + (o.city ? ' · ' + esc(o.city) + ' - ' + esc(o.state) : '') + '</p>' +
        (!o.stock_deducted && o.status !== 'cancelado'
          ? '<p>Cliente escolheu: ' + ({ pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' }[o.payment_choice] || 'Cartão') + ' · ' + dinheiro(valorPedido(o, o.payment_choice !== 'cartao')) + '</p>' : '') +
        (o.payment_method ? '<p>Pagamento: ' + esc(PAGAMENTOS[o.payment_method] || o.payment_method) + '</p>' : '') +
        (o.mp_payment_id ? '<p>Mercado Pago: ' + esc(STATUS_MP[o.mp_status] || o.mp_status) + ' · nº ' + esc(o.mp_payment_id) + '. Devoluções são feitas no Mercado Pago.</p>' : '') +
        (o.payment_issue ? '<p class="pedido-alerta">' + esc(o.payment_issue) + '</p>' : '') +
        '<p>' + (o.delivery === 'retirada' ? 'Retirar na loja'
          : esc(o.shipping_service || 'Receber em casa') + (o.shipping_cents ? ' · frete ' + dinheiro(o.shipping_cents) : '') +
            (o.shipping_days ? ' · até ' + esc(o.shipping_days) + ' dias' : '') + ': ' + esc(o.address || '') + (o.cep ? ' · CEP ' + esc(o.cep) : '')) + '</p>' +
        (o.credit_cents ? '<p>Crédito usado: ' + dinheiro(o.credit_cents) + '</p>' : '') +
        (o.note ? '<p>Observação: ' + esc(o.note) + '</p>' : '') +
        (o.stock_deducted && (o.delivery === 'correios' || o.delivery === 'envio') && o.status !== 'cancelado' && o.status !== 'entregue'
          ? '<form class="rastreio-form" data-rastreio="' + esc(o.id) + '"><input name="codigo" value="' + esc(o.tracking_code || '') + '" maxlength="40" placeholder="Código de rastreio" aria-label="Código de rastreio do pedido ' + esc(o.number) + '">' +
            '<button class="botao-texto" type="submit">Salvar rastreio</button></form>'
          : (o.tracking_code ? '<p>Rastreio: ' + esc(o.tracking_code) + '</p>' : '')) +
        '<ul class="pedido-itens">' + o.order_items.map(function (i) {
          return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + variacaoItem(i) + ') · ' + dinheiro(i.unit_price_cents) + '</li>';
        }).join('') + '</ul>' + acoes + '</li>';
    }).join('') + '</ul>';
  }
  function concluirPedido(promessa, sucesso) {
    promessa.then(function (r) {
      if (r.error) avisar(r.error.code === 'P0001' ? r.error.message : 'Não foi possível atualizar o pedido.');
      else avisar(sucesso);
      carregarPedidos();
      carregarProdutos();
    });
  }
  function mudarStatus(id, status, sucesso) {
    concluirPedido(sb.rpc('admin_set_order_status', { p_order: id, p_status: status }), sucesso);
  }
  $('#filtro-pedidos').addEventListener('change', desenharPedidos);
  $('#lista-pedidos').addEventListener('change', function (evento) {
    var campo = evento.target.closest('[data-status]');
    if (!campo) return;
    if (campo.value === 'cancelado' && !window.confirm('Cancelar este pedido? As peças voltam para o estoque.')) {
      desenharPedidos();
      return;
    }
    campo.disabled = true;
    mudarStatus(campo.dataset.status, campo.value, 'Status atualizado.');
  });
  $('#lista-pedidos').addEventListener('submit', function (evento) {
    var form = evento.target.closest('[data-rastreio]');
    if (!form) return;
    evento.preventDefault();
    concluirPedido(sb.rpc('admin_set_tracking', { p_order: form.dataset.rastreio, p_code: form.codigo.value }), 'Rastreio salvo.');
  });
  var clientes = [];
  var clienteAberto = null;
  var NOME_STATUS = { novo: 'Aguardando pagamento', confirmado: 'Confirmado', pago: 'Pago', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado' };
  function carregarClientes() {
    return sb.rpc('admin_list_customers').then(function (r) {
      if (r.error) { $('#lista-clientes').innerHTML = '<p class="estado">Não foi possível carregar os clientes.</p>'; return; }
      clientes = r.data;
      desenharClientes();
    });
  }
  function desenharClientes() {
    var busca = $('#busca-clientes').value.trim().toLowerCase();
    var lista = clientes.filter(function (c) {
      return !busca || [c.customer_name, c.customer_email, c.customer_phone].some(function (v) { return (v || '').toLowerCase().indexOf(busca) !== -1; });
    });
    $('#total-clientes').textContent = lista.length + (lista.length === 1 ? ' cliente' : ' clientes') + (busca ? (lista.length === 1 ? ' encontrado' : ' encontrados') : (lista.length === 1 ? ' cadastrado' : ' cadastrados'));
    if (!lista.length) { $('#lista-clientes').innerHTML = '<p class="estado">Nenhum cliente por aqui.</p>'; return; }
    $('#lista-clientes').innerHTML = '<ul class="pedidos">' + lista.map(function (c) {
      var numeros = (c.customer_phone || '').replace(/\D/g, '');
      var whatsapp = 'https://wa.me/' + (numeros.indexOf('55') === 0 && numeros.length > 11 ? numeros : '55' + numeros);
      return '<li class="pedido"><div class="pedido-topo"><h3>' + esc(c.customer_name || 'Sem nome') + '</h3>' +
        '<strong>' + c.order_count + (c.order_count === 1 ? ' pedido' : ' pedidos') + '</strong></div>' +
        '<p><a href="mailto:' + esc(c.customer_email) + '">' + esc(c.customer_email) + '</a>' +
        (numeros ? ' · <a href="' + esc(whatsapp) + '" target="_blank" rel="noopener">' + esc(c.customer_phone) + '</a>' : '') + '</p>' +
        '<p>Cadastro em ' + new Date(c.signed_up_at).toLocaleDateString('pt-BR') +
        (c.last_order_at ? ' · Último pedido em ' + new Date(c.last_order_at).toLocaleDateString('pt-BR') : '') + '</p>' +
        '<p>Comprou ' + dinheiro(Number(c.spent_cents)) + ' · Crédito de ' + dinheiro(Number(c.credit_cents)) + '</p>' +
        '<div class="pedido-acoes"><button class="botao-texto" type="button" data-cliente="' + esc(c.customer_id) + '"' + (clienteAberto === c.customer_id ? ' aria-expanded="true"' : ' aria-expanded="false"') + '>' +
        (clienteAberto === c.customer_id ? 'Fechar detalhes' : 'Ver detalhes') + '</button></div>' +
        (clienteAberto === c.customer_id ? '<div class="cliente-detalhe" id="cliente-detalhe"><p class="estado">Carregando…</p></div>' : '') + '</li>';
    }).join('') + '</ul>';
    if (clienteAberto) carregarDetalheCliente();
  }
  function clientePorId(id) { return clientes.filter(function (c) { return c.customer_id === id; })[0]; }
  function carregarDetalheCliente() {
    var id = clienteAberto;
    Promise.all([
      sb.from('orders').select('number,total_cents,status,delivery,shipping_service,created_at,order_items(product_name,color,size,quantity)')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(10),
      sb.from('store_credits').select('amount_cents,reason,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(50)
    ]).then(function (r) {
      var caixa = $('#cliente-detalhe');
      if (!caixa || clienteAberto !== id) return;
      if (r[0].error || r[1].error) { caixa.innerHTML = '<p class="estado">Não foi possível carregar os detalhes.</p>'; return; }
      var c = clientePorId(id);
      var numeros = (c.customer_phone || '').replace(/\D/g, '');
      var whatsapp = 'https://wa.me/' + (numeros.indexOf('55') === 0 && numeros.length > 11 ? numeros : '55' + numeros);
      caixa.innerHTML = '<h4>Contato</h4><p>E-mail: <a href="mailto:' + esc(c.customer_email) + '">' + esc(c.customer_email) + '</a></p>' +
        '<p>Celular: ' + (numeros ? '<a href="' + esc(whatsapp) + '" target="_blank" rel="noopener">' + esc(c.customer_phone) + '</a>' : 'Ainda não informado. Ele vem do primeiro pedido.') + '</p>' +
        '<h4>Crédito na loja</h4><p class="cliente-saldo">Saldo: <strong>' + dinheiro(Number(c.credit_cents)) + '</strong></p>' +
        '<form class="credito-form" data-credito="' + esc(id) + '" novalidate>' +
        '<label class="campo">Ajuste<select name="tipo"><option value="1">Adicionar crédito</option><option value="-1">Remover crédito</option></select></label>' +
        '<label class="campo">Valor (R$)<input name="valor" inputmode="decimal" placeholder="0,00"></label>' +
        '<label class="campo credito-motivo">Motivo (aparece para o cliente)<input name="motivo" maxlength="200"></label>' +
        '<button class="botao botao-vinho" type="submit">Salvar ajuste</button></form>' +
        (r[1].data.length ? '<ul class="cliente-lista">' + r[1].data.map(function (m) {
          return '<li><span>' + new Date(m.created_at).toLocaleDateString('pt-BR') + ' · ' + esc(m.reason) + '</span>' +
            '<strong class="' + (m.amount_cents < 0 ? 'valor-menos' : 'valor-mais') + '">' + (m.amount_cents < 0 ? '− ' : '+ ') + dinheiro(Math.abs(m.amount_cents)) + '</strong></li>';
        }).join('') + '</ul>' : '<p class="dica">Nenhuma movimentação de crédito.</p>') +
        '<h4>Últimas compras</h4>' + (r[0].data.length ? '<ul class="cliente-lista">' + r[0].data.map(function (o) {
          return '<li><span>Pedido #' + esc(o.number) + ' · ' + new Date(o.created_at).toLocaleDateString('pt-BR') + ' · ' + esc(NOME_STATUS[o.status] || o.status) + '<br>' +
            o.order_items.map(function (i) { return i.quantity + 'x ' + esc(i.product_name); }).join(', ') + '</span><strong>' + dinheiro(o.total_cents) + '</strong></li>';
        }).join('') + '</ul>' : '<p class="dica">Nenhuma compra ainda.</p>');
    });
  }
  $('#lista-clientes').addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-cliente]');
    if (!botao) return;
    clienteAberto = clienteAberto === botao.dataset.cliente ? null : botao.dataset.cliente;
    desenharClientes();
  });
  $('#lista-clientes').addEventListener('submit', function (evento) {
    var ajuste = evento.target.closest('[data-credito]');
    if (!ajuste) return;
    evento.preventDefault();
    var centavos = paraCentavos(ajuste.valor.value);
    if (!(centavos > 0)) { avisar('Informe um valor válido, por exemplo 50,00.'); return; }
    if (ajuste.motivo.value.trim().length < 3) { avisar('Informe o motivo do ajuste.'); return; }
    var botao = ajuste.querySelector('button[type="submit"]');
    botao.disabled = true;
    sb.rpc('admin_adjust_credit', { p_user: ajuste.dataset.credito, p_amount_cents: centavos * Number(ajuste.tipo.value), p_reason: ajuste.motivo.value }).then(function (r) {
      if (r.error) {
        botao.disabled = false;
        avisar(r.error.code === 'P0001' ? r.error.message : 'Não foi possível salvar o ajuste.');
        return;
      }
      avisar('Crédito atualizado.');
      carregarClientes();
    });
  });
  $('#busca-clientes').addEventListener('input', desenharClientes);
  var trocas = [];
  var NOME_TROCA = { aberto: 'Em análise', aprovado: 'Aprovada', recusado: 'Recusada', concluido: 'Concluída' };
  function carregarTrocas() {
    return sb.from('order_requests').select('*,orders(number,customer_name,phone,total_cents,credit_cents)').order('created_at', { ascending: false }).limit(200).then(function (r) {
      if (r.error) { $('#lista-trocas').innerHTML = '<p class="estado">Não foi possível carregar as solicitações.</p>'; return; }
      trocas = r.data;
      desenharTrocas();
    });
  }
  function desenharTrocas() {
    var abertas = trocas.filter(function (t) { return t.status === 'aberto'; }).length;
    $('[data-aba="trocas"]').textContent = abertas ? 'Trocas (' + abertas + ')' : 'Trocas';
    if (!trocas.length) { $('#lista-trocas').innerHTML = '<p class="estado">Nenhuma solicitação por aqui.</p>'; return; }
    $('#lista-trocas').innerHTML = '<ul class="pedidos">' + trocas.map(function (t) {
      var ativa = t.status === 'aberto' || t.status === 'aprovado';
      return '<li class="pedido"><div class="pedido-topo"><h3>' + (t.kind === 'troca' ? 'Troca' : 'Devolução') + ' do pedido #' + esc(t.orders.number) + '</h3>' +
        '<span class="selo selo-espera">' + esc(NOME_TROCA[t.status] || t.status) + '</span></div>' +
        '<p>' + new Date(t.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + esc(t.orders.customer_name) + ' · ' + esc(t.orders.phone) + '</p>' +
        '<p>Peças: ' + esc(t.items) + '</p><p>Motivo: ' + esc(t.reason) + '</p>' +
        (t.credit_cents ? '<p>Crédito lançado: ' + dinheiro(t.credit_cents) + '</p>' : '') +
        (t.admin_note ? '<p>Resposta: ' + esc(t.admin_note) + '</p>' : '') +
        (ativa ? '<form class="troca-form" data-troca="' + esc(t.id) + '">' +
          '<label class="campo">Resposta para o cliente (opcional)<input name="nota" maxlength="300" value="' + esc(t.admin_note || '') + '"></label>' +
          (t.kind === 'troca' ? '<label class="campo">Crédito ao concluir (R$)<input name="credito" inputmode="decimal" placeholder="0,00"></label>' : '') +
          '<div class="pedido-acoes">' + (t.status === 'aberto' ? '<button class="botao-texto" type="submit" value="aprovado">Aprovar</button>' : '') +
          '<button class="botao botao-vinho" type="submit" value="concluido">Concluir</button>' +
          '<button class="botao-texto botao-perigo" type="submit" value="recusado">Recusar</button></div></form>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  $('#lista-trocas').addEventListener('submit', function (evento) {
    var form = evento.target.closest('[data-troca]');
    if (!form) return;
    evento.preventDefault();
    var acao = evento.submitter ? evento.submitter.value : '';
    var texto = form.credito ? form.credito.value.trim() : '';
    var credito = texto ? Math.round(parseFloat(texto.replace(/\./g, '').replace(',', '.')) * 100) : 0;
    if (!(credito >= 0) || (credito > 0 && acao !== 'concluido')) { avisar('Informe o crédito só ao concluir, por exemplo 129,90.'); return; }
    sb.rpc('admin_resolve_request', { p_request: form.dataset.troca, p_status: acao, p_note: form.nota.value, p_credit_cents: credito }).then(function (r) {
      avisar(r.error ? (r.error.code === 'P0001' ? r.error.message : 'Não foi possível atualizar.') : 'Solicitação atualizada.');
      carregarTrocas();
    });
  });
  $('#lista-pedidos').addEventListener('click', function (evento) {
    var finalizar = evento.target.closest('[data-finalizar]');
    var cancelar = evento.target.closest('[data-cancelar]');
    var reabrir = evento.target.closest('[data-reabrir]');
    if (finalizar) {
      pedidoFinalizando = finalizar.dataset.finalizar;
      $('#form-finalizar').reset();
      campoEstado.value = 'BA';
      carregarCidades();
      $('#erro-finalizar').hidden = true;
      $('#finalizar-titulo').textContent = 'Finalizar pedido #' + finalizar.dataset.numero;
      var pedidoAtual = pedidos.filter(function (o) { return o.id === pedidoFinalizando; })[0];
      $('#form-finalizar').pagamento.value = pedidoAtual.payment_choice === 'pix' ? 'pix' : '';
      var opcaoDinheiro = $('#form-finalizar').pagamento.querySelector('[value="dinheiro"]');
      opcaoDinheiro.disabled = pedidoAtual.delivery !== 'retirada';
      opcaoDinheiro.hidden = opcaoDinheiro.disabled;
      mostrarValorFinal();
      $('#finalizar').showModal();
    }
    if (cancelar && window.confirm('Cancelar o pedido #' + cancelar.dataset.numero + '?')) {
      mudarStatus(cancelar.dataset.cancelar, 'cancelado', 'Pedido cancelado.');
    }
    if (reabrir) mudarStatus(reabrir.dataset.reabrir, 'novo', 'Pedido reaberto.');
  });

  /* Estado e cidade na finalização */
  var ESTADOS = [['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins']];
  var cacheCidades = {};
  var cidadesEstado = [];
  var cidadesVisiveis = [];
  var cidadeAtiva = -1;
  var campoEstado = $('#fin-estado');
  var campoCidade = $('#fin-cidade');
  var listaCidades = $('#fin-cidades');

  campoEstado.innerHTML = ESTADOS.map(function (e) { return '<option value="' + e[0] + '">' + e[1] + '</option>'; }).join('');
  function semAcento(texto) { return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function abrirCidades(aberta) {
    listaCidades.hidden = !aberta;
    campoCidade.setAttribute('aria-expanded', String(aberta));
    if (!aberta) { cidadeAtiva = -1; campoCidade.removeAttribute('aria-activedescendant'); }
  }
  function desenharCidades() {
    var termo = semAcento(campoCidade.value);
    var comeca = [], contem = [];
    cidadesEstado.forEach(function (c) {
      var nome = semAcento(c);
      if (!termo || nome.indexOf(termo) === 0) comeca.push(c);
      else if (nome.indexOf(termo) !== -1) contem.push(c);
    });
    cidadesVisiveis = comeca.concat(contem);
    cidadeAtiva = -1;
    listaCidades.innerHTML = cidadesVisiveis.length ? cidadesVisiveis.map(function (c, i) {
      return '<li id="cidade-' + i + '" role="option" aria-selected="false" data-cidade="' + i + '">' + esc(c) + '</li>';
    }).join('') : '<li class="sem-cidade">Nenhuma cidade encontrada neste estado.</li>';
    abrirCidades(true);
  }
  function marcarCidade(indice) {
    var itens = listaCidades.querySelectorAll('[role="option"]');
    if (!itens.length) return;
    if (itens[cidadeAtiva]) itens[cidadeAtiva].setAttribute('aria-selected', 'false');
    cidadeAtiva = (indice + itens.length) % itens.length;
    itens[cidadeAtiva].setAttribute('aria-selected', 'true');
    itens[cidadeAtiva].scrollIntoView({ block: 'nearest' });
    campoCidade.setAttribute('aria-activedescendant', itens[cidadeAtiva].id);
  }
  function escolherCidade(indice) {
    campoCidade.value = cidadesVisiveis[indice];
    abrirCidades(false);
  }
  function carregarCidades() {
    var uf = campoEstado.value;
    campoCidade.value = '';
    abrirCidades(false);
    cidadesEstado = cacheCidades[uf] || [];
    if (cacheCidades[uf]) { campoCidade.disabled = false; return Promise.resolve(); }
    campoCidade.disabled = true;
    campoCidade.placeholder = 'Carregando cidades…';
    return fetch('../assets/data/cidades/' + uf + '.json').then(function (r) {
      if (!r.ok) throw new Error('cidades');
      return r.json();
    }).then(function (lista) {
      cacheCidades[uf] = lista;
      if (campoEstado.value === uf) cidadesEstado = lista;
      campoCidade.disabled = false;
      campoCidade.placeholder = 'Digite ou selecione';
    }).catch(function () {
      campoCidade.placeholder = 'Não foi possível carregar';
    });
  }
  campoEstado.addEventListener('change', function () {
    carregarCidades().then(function () { campoCidade.focus(); });
  });
  campoCidade.addEventListener('focus', desenharCidades);
  campoCidade.addEventListener('click', desenharCidades);
  campoCidade.addEventListener('input', desenharCidades);
  campoCidade.addEventListener('blur', function () { abrirCidades(false); });
  campoCidade.addEventListener('keydown', function (evento) {
    var aberta = !listaCidades.hidden;
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (!aberta) desenharCidades();
      marcarCidade(cidadeAtiva + (evento.key === 'ArrowDown' ? 1 : -1));
    } else if (evento.key === 'Enter' && aberta) {
      evento.preventDefault();
      if (cidadeAtiva >= 0) escolherCidade(cidadeAtiva);
      else if (cidadesVisiveis.length === 1) escolherCidade(0);
    } else if (evento.key === 'Escape' && aberta) {
      evento.preventDefault();
      evento.stopPropagation();
      abrirCidades(false);
    }
  });
  listaCidades.addEventListener('mousedown', function (evento) {
    var item = evento.target.closest('[data-cidade]');
    evento.preventDefault();
    if (item) escolherCidade(+item.dataset.cidade);
  });
  function cidadeConfirmada() {
    var termo = semAcento(campoCidade.value);
    return cidadesEstado.filter(function (c) { return semAcento(c) === termo; })[0] || null;
  }

  /* Finalização com forma de pagamento */
  var pedidoFinalizando = null;
  function mostrarValorFinal() {
    var pedido = pedidos.filter(function (o) { return o.id === pedidoFinalizando; })[0];
    var pagamento = $('#form-finalizar').pagamento.value;
    $('#finalizar-valor').textContent = pagamento
      ? 'Valor a receber: ' + dinheiro(valorPedido(pedido, ['pix', 'dinheiro', 'transferencia'].indexOf(pagamento) !== -1))
      : 'Cartão ' + dinheiro(valorPedido(pedido, false)) + ' · Pix ' + dinheiro(valorPedido(pedido, true));
  }
  $('#form-finalizar').pagamento.addEventListener('change', mostrarValorFinal);
  $('#finalizar').addEventListener('click', function (evento) {
    if (evento.target === this || evento.target.closest('[data-fechar]')) this.close();
  });
  $('#form-finalizar').addEventListener('submit', function (evento) {
    evento.preventDefault();
    var formulario = evento.target;
    var botao = formulario.querySelector('button[type="submit"]');
    var erro = $('#erro-finalizar');
    if (!formulario.pagamento.value) {
      erro.textContent = 'Escolha a forma de pagamento.';
      erro.hidden = false;
      return;
    }
    var cidade = cidadeConfirmada();
    if (!cidade) {
      erro.textContent = 'Selecione uma cidade da lista.';
      erro.hidden = false;
      campoCidade.focus();
      return;
    }
    erro.hidden = true;
    ocupado(botao, true, 'Finalizando…');
    sb.rpc('admin_finalize_order', { p_order: pedidoFinalizando, p_payment: formulario.pagamento.value, p_city: cidade, p_state: campoEstado.value }).then(function (r) {
      ocupado(botao, false);
      if (r.error) {
        erro.textContent = r.error.code === 'P0001' ? r.error.message : 'Não foi possível finalizar o pedido.';
        erro.hidden = false;
        return;
      }
      $('#finalizar').close();
      avisar('Pedido finalizado e estoque baixado.');
      carregarPedidos();
      carregarProdutos();
    });
  });

  /* Relatórios */
  var referencia = new Date();
  function iso(data) {
    return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
  }
  function dataBr(data) { return data.toLocaleDateString('pt-BR'); }
  function intervalo() {
    var tipo = $('#rel-tipo').value;
    var a = referencia.getFullYear(), m = referencia.getMonth(), d = referencia.getDate();
    if (tipo === 'diario') return [new Date(a, m, d), new Date(a, m, d)];
    if (tipo === 'semanal') {
      var inicio = d - ((referencia.getDay() + 6) % 7);
      return [new Date(a, m, inicio), new Date(a, m, inicio + 6)];
    }
    if (tipo === 'mensal') return [new Date(a, m, 1), new Date(a, m + 1, 0)];
    return [new Date(a, 0, 1), new Date(a, 11, 31)];
  }
  function moverPeriodo(sentido) {
    var tipo = $('#rel-tipo').value;
    var a = referencia.getFullYear(), m = referencia.getMonth(), d = referencia.getDate();
    if (tipo === 'diario') referencia = new Date(a, m, d + sentido);
    if (tipo === 'semanal') referencia = new Date(a, m, d + 7 * sentido);
    if (tipo === 'mensal') referencia = new Date(a, m + sentido, 1);
    if (tipo === 'anual') referencia = new Date(a + sentido, 0, 1);
    carregarRelatorio();
  }
  function tabela(titulo, cabecalho, linhas, largo) {
    return '<section class="bloco' + (largo ? ' bloco-largo' : '') + '"><h3>' + titulo + '</h3><div class="tabela-rolagem"><table class="tabela"><thead><tr>' +
      cabecalho.map(function (c, i) { return '<th' + (i ? ' class="num"' : '') + '>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr>' + l.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
  }
  function rotuloPeriodo(texto) {
    var partes = texto.split('-');
    return partes.length === 3 ? partes[2] + '/' + partes[1] + '/' + partes[0] : partes[1] + '/' + partes[0];
  }
  function desenharRelatorio(dados) {
    var caixa = $('#relatorio');
    if (!dados.orders) {
      caixa.innerHTML = '<p class="estado">Nenhuma venda finalizada neste período.</p>';
      return;
    }
    var ticket = Math.round(dados.revenue / dados.orders);
    function linhasValor(lista, rotulo) {
      return lista.map(function (x) {
        return [rotulo(x.label), x.orders, dinheiro(x.revenue), Math.round(x.revenue / dados.revenue * 100) + '%'];
      });
    }
    var cabecalho = ['', 'Pedidos', 'Valor', '%'];
    caixa.innerHTML = '<div class="resumo">' + [['Faturamento', dinheiro(dados.revenue)], ['Pedidos', dados.orders], ['Peças vendidas', dados.items], ['Ticket médio', dinheiro(ticket)]].map(function (i) {
      return '<div><strong>' + i[1] + '</strong><span>' + i[0] + '</span></div>';
    }).join('') + '</div><div class="relatorio-grade">' +
      tabela('Por forma de pagamento', ['Forma'].concat(cabecalho.slice(1)), linhasValor(dados.by_payment, function (l) { return esc(PAGAMENTOS[l] || l); })) +
      tabela('Por estado', ['Estado'].concat(cabecalho.slice(1)), linhasValor(dados.by_state, esc)) +
      tabela('Por cidade', ['Cidade'].concat(cabecalho.slice(1)), linhasValor(dados.by_city, esc)) +
      tabela('Por período', ['Data'].concat(cabecalho.slice(1)), linhasValor(dados.by_period, rotuloPeriodo)) +
      tabela('Mais vendidos', ['Produto', 'Peças', 'Valor'], dados.top_products.map(function (x) {
        return [esc(x.label) + ' (' + variacaoItem({ color: x.color, size: x.size }) + ')', x.quantity, dinheiro(x.revenue)];
      }), true) + '</div>';
  }
  function carregarRelatorio() {
    var tipo = $('#rel-tipo').value;
    var personalizado = tipo === 'personalizado';
    var caixa = $('#relatorio');
    var de, ate;
    $('#rel-navegar').hidden = personalizado;
    $('#rel-datas').hidden = !personalizado;
    if (personalizado) {
      if (!$('#rel-de').value) {
        $('#rel-de').value = iso(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
        $('#rel-ate').value = iso(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0));
      }
      de = $('#rel-de').value;
      ate = $('#rel-ate').value;
      if (!de || !ate || ate < de) {
        caixa.innerHTML = '<p class="estado">Escolha uma data inicial anterior à data final.</p>';
        return;
      }
    } else {
      var datas = intervalo();
      de = iso(datas[0]);
      ate = iso(datas[1]);
      if (tipo === 'diario') $('#rel-rotulo').textContent = dataBr(datas[0]);
      else if (tipo === 'mensal') $('#rel-rotulo').textContent = datas[0].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      else if (tipo === 'anual') $('#rel-rotulo').textContent = String(datas[0].getFullYear());
      else $('#rel-rotulo').textContent = dataBr(datas[0]) + ' a ' + dataBr(datas[1]);
    }
    caixa.innerHTML = '<p class="estado">Carregando relatório…</p>';
    var pedido = de + ate + tipo;
    carregarRelatorio.atual = pedido;
    sb.rpc('admin_report', { p_from: de, p_to: ate }).then(function (r) {
      if (carregarRelatorio.atual !== pedido) return;
      if (r.error) { caixa.innerHTML = '<p class="estado">Não foi possível carregar o relatório.</p>'; return; }
      desenharRelatorio(r.data);
    });
  }
  $('#rel-tipo').addEventListener('change', carregarRelatorio);
  $('#rel-de').addEventListener('change', carregarRelatorio);
  $('#rel-ate').addEventListener('change', carregarRelatorio);
  $('#rel-anterior').addEventListener('click', function () { moverPeriodo(-1); });
  $('#rel-proximo').addEventListener('click', function () { moverPeriodo(1); });

  sb.auth.getSession().then(function (r) {
    if (r.data.session) entrarNoPainel();
    else mostrarLogin();
  });
})();
