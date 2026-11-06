(function () {
  var CONFIG = {
    url: 'https://ukvivmgyxnuijmglidwm.supabase.co',
    chave: 'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj',
    whatsapp: 'https://wa.me/5577988298955'
  };
  var INSTAGRAM = 'https://www.instagram.com/ellizecollection/';
  var MAPA = 'https://www.google.com/maps/search/?api=1&query=Rua%20Miguel%20Pinheiro%2C%20968%2C%20Boa%20Vista%2C%20Vit%C3%B3ria%20da%20Conquista%20-%20BA%2C%2045026-445';
  var ICONES = 'assets/img/icones.svg#';
  var inicio = document.querySelector('.hero') ? '' : 'index.html';
  var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function dinheiro(centavos) { return moeda.format(centavos / 100); }
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icone(nome, linha) {
    return '<svg class="icone' + (linha ? ' icone-linha' : '') + '" aria-hidden="true"><use href="' + ICONES + nome + '"/></svg>';
  }

  function preco(p) { return p.promo_price_cents || p.price_cents; }
  function precoPix(p) { return Math.min(p.promo_pix_price_cents || p.pix_price_cents || preco(p), preco(p)); }
  function emPromocao(p) { return !!(p.promo_price_cents || p.promo_pix_price_cents); }
  function cores(p) { return p.colors && p.colors.length ? p.colors : [{ name: 'Única' }]; }
  function temCores(p) { var c = cores(p); return c.length > 1 || c[0].name !== 'Única'; }
  function estoque(p, cor, tamanho) { return Number(((p.stock || {})[cor] || {})[tamanho]) || 0; }
  function estoqueCor(p, cor) { return p.sizes.reduce(function (soma, t) { return soma + estoque(p, cor, t); }, 0); }
  function estoqueTamanho(p, tamanho) { return cores(p).reduce(function (soma, c) { return soma + estoque(p, c.name, tamanho); }, 0); }
  function esgotado(p) { return !cores(p).some(function (c) { return estoqueCor(p, c.name) > 0; }); }
  function fotoCor(p, cor) {
    var achada = cores(p).filter(function (c) { return c.name === cor; })[0];
    return (achada && achada.image) || p.image;
  }
  function corHex(c) { return /^#[0-9a-f]{6}$/i.test(c.hex || '') ? c.hex : '#d6d1c6'; }
  function variacao(cor, tamanho) { return (cor && cor !== 'Única' ? 'Cor ' + esc(cor) + ' · ' : '') + 'Tamanho ' + esc(tamanho); }
  function precoHTML(p) {
    var cartao = p.promo_price_cents
      ? '<s class="preco-antigo">' + dinheiro(p.price_cents) + '</s> <span class="preco-promo">' + dinheiro(p.promo_price_cents) + '</span>'
      : dinheiro(p.price_cents);
    if (precoPix(p) >= preco(p)) return cartao;
    return '<span class="preco-linha">' + cartao + ' <small>no cartão</small></span>' +
      '<span class="preco-linha preco-pix">' + dinheiro(precoPix(p)) + ' <small>no Pix</small></span>';
  }

  /* Catálogo público, carregado uma vez por página */
  var catalogo = null;
  function produtos() {
    if (!catalogo) {
      catalogo = fetch(CONFIG.url + '/rest/v1/products?select=id,slug,name,price_cents,promo_price_cents,pix_price_cents,promo_pix_price_cents,stock,colors,image,sizes,tags&order=created_at.desc&limit=200', {
        headers: { apikey: CONFIG.chave }
      }).then(function (resposta) {
        if (!resposta.ok) throw new Error('catalogo');
        return resposta.json();
      }).catch(function (erro) {
        catalogo = null;
        throw erro;
      });
    }
    return catalogo;
  }
  var listaCategorias = null;
  function categorias() {
    if (!listaCategorias) {
      listaCategorias = fetch(CONFIG.url + '/rest/v1/categories?select=*&order=position', {
        headers: { apikey: CONFIG.chave }
      }).then(function (resposta) {
        if (!resposta.ok) throw new Error('categorias');
        return resposta.json();
      }).catch(function (erro) {
        listaCategorias = null;
        throw erro;
      });
    }
    return listaCategorias;
  }
  function sugestoes(todos, referencia, limite) {
    var fora = carrinho.ler().map(function (i) { return i.id; }).concat(referencia ? [referencia.id] : []);
    var livres = todos.filter(function (p) { return fora.indexOf(p.id) === -1 && !esgotado(p); });
    function parecido(p) {
      return referencia ? p.tags.filter(function (t) { return referencia.tags.indexOf(t) !== -1; }).length : 0;
    }
    return livres.slice().sort(function (a, b) { return parecido(b) - parecido(a); }).slice(0, limite);
  }
  function vitrine(lista) {
    return '<div class="vitrine-grade">' + lista.map(function (p) {
      return '<a class="vitrine-item" href="produto.html?p=' + encodeURIComponent(p.slug) + '"><img src="' + esc(p.image) + '" alt="" width="160" height="200" loading="lazy">' +
        '<span>' + esc(p.name) + '</span><span>' + precoHTML(p) + '</span></a>';
    }).join('') + '</div>';
  }

  /* Barra e rodapé: uma única versão para todas as páginas */
  var MENU = [
    { id: 'novidades', rotulo: 'Novidades', vitrine: true, colunas: [
      ['Categorias', [['Ver todas', 'loja.html'], ['Promoções', 'loja.html?c=promocao'], ['Feminino', 'loja.html?c=feminino'], ['Masculino', 'loja.html?c=masculino'],
        ['Conjuntos', 'loja.html?c=conjuntos'], ['Vestidos', 'loja.html?c=vestidos'], ['Bolsas', 'loja.html?c=bolsas']]]
    ] },
    { id: 'colecoes', rotulo: 'Coleções', colunas: [
      ['Feminino', [['Ver tudo', 'loja.html?c=feminino'], ['Conjuntos', 'loja.html?c=feminino,conjuntos'], ['Vestidos', 'loja.html?c=feminino,vestidos'], ['Bolsas', 'loja.html?c=feminino,bolsas']]],
      ['Masculino', [['Ver tudo', 'loja.html?c=masculino'], ['Conjuntos', 'loja.html?c=masculino,conjuntos']]]
    ] },
    { id: 'destaques', rotulo: 'Destaques', colunas: [
      ['Mais procurados', [['Conjuntos', 'loja.html?c=conjuntos'], ['Vestidos', 'loja.html?c=vestidos'], ['Bolsas', 'loja.html?c=bolsas']]],
      ['Na página inicial', [['Ver destaques', inicio + '#destaques']]]
    ] },
    { id: 'marca', rotulo: 'A marca', colunas: [
      ['Ellize Collection', [['Sobre a marca', inicio + '#marca']]],
      ['Acompanhe', [['Instagram', INSTAGRAM, true]]]
    ] },
    { id: 'loja-fisica', rotulo: 'Loja física', colunas: [
      ['Visite', [['Endereço e contatos', inicio + '#loja'], ['Como chegar', MAPA, true]]],
      ['Fale com a gente', [['WhatsApp', CONFIG.whatsapp, true], ['E-mail', 'mailto:lookpremium96@gmail.com']]]
    ] }
  ];
  function htmlMenu() {
    return MENU.map(function (item) {
      var colunas = item.colunas.map(function (coluna) {
        return '<div class="submenu-coluna" data-coluna="' + coluna[0] + '"><p class="submenu-titulo">' + coluna[0] + '</p>' + coluna[1].map(function (link) {
          return '<a href="' + esc(link[1]) + '"' + (link[2] ? ' target="_blank" rel="noopener"' : '') + '>' + link[0] + '</a>';
        }).join('') + '</div>';
      }).join('');
      var extra = item.vitrine ? '<div class="submenu-vitrine" data-vitrine hidden><p class="submenu-titulo">Chegaram agora</p></div>' : '';
      return '<li class="menu-item"><button class="menu-gatilho" type="button" aria-expanded="false" aria-controls="sub-' + item.id + '">' + item.rotulo + '</button>' +
        '<div class="painel-barra submenu" id="sub-' + item.id + '" hidden>' + colunas + extra + '</div></li>';
    }).join('');
  }

  document.getElementById('topo').outerHTML =
    '<a class="pular" href="#conteudo">Pular para o conteúdo</a>' +
    '<p class="aviso">Enviamos para todo o Brasil</p>' +
    '<header class="cabecalho"><div class="cabecalho-barra">' +
    '<nav class="menu" aria-label="Menu principal">' +
    '<button class="botao-icone menu-botao" type="button" aria-expanded="false" aria-controls="menu-lista" aria-label="Abrir menu">' +
    '<svg class="icone icone-linha abrir" aria-hidden="true"><use href="' + ICONES + 'i-menu"/></svg>' +
    '<svg class="icone icone-linha fechar" aria-hidden="true"><use href="' + ICONES + 'i-fechar"/></svg></button>' +
    '<ul class="menu-lista" id="menu-lista">' + htmlMenu() + '</ul></nav>' +
    '<a class="marca" href="' + (inicio || '#conteudo') + '" aria-label="Ellize Collection, início"><img src="assets/img/logo.svg" alt="Ellize Collection" width="100" height="50"></a>' +
    '<div class="cabecalho-acoes">' +
    '<a class="botao-icone" href="conta.html" aria-label="Minha conta">' + icone('i-usuario', true) + '</a>' +
    '<button class="botao-icone carrinho-link" type="button" data-abrir-sacola aria-label="Abrir sacola">' + icone('i-sacola', true) +
    '<span class="carrinho-qtd" data-carrinho-qtd hidden></span></button>' +
    '<button class="botao-icone busca-botao" type="button" aria-expanded="false" aria-controls="busca" aria-label="Abrir busca">' + icone('i-busca', true) + '</button>' +
    '</div></div>' +
    '<form class="painel-barra busca" id="busca" action="loja.html" role="search" hidden>' +
    '<div class="busca-campo">' + icone('i-busca', true) +
    '<input type="search" name="q" placeholder="Buscar peças" aria-label="Buscar na loja" maxlength="60" autocomplete="off">' +
    '<button class="botao botao-vinho" type="submit">Buscar</button></div>' +
    '<div class="busca-sugestoes"><span>Sugestões:</span><a href="loja.html?c=vestidos">Vestidos</a><a href="loja.html?c=conjuntos">Conjuntos</a><a href="loja.html?c=bolsas">Bolsas</a></div>' +
    '<div class="busca-resultados" aria-live="polite"></div></form></header>';

  var rodape = document.getElementById('rodape');
  if (rodape) rodape.outerHTML =
    '<footer class="rodape sobre-escuro"><div class="container"><div class="rodape-grade">' +
    '<div class="rodape-marca"><img class="rodape-logo" src="assets/img/logo-claro.svg" alt="Ellize Collection" width="190" height="95" loading="lazy"></div>' +
    '<nav aria-label="Site"><h2>Site</h2><ul><li><a href="loja.html">Novidades</a></li><li><a href="' + inicio + '#colecoes">Coleções</a></li>' +
    '<li><a href="' + inicio + '#marca">A marca</a></li><li><a href="' + inicio + '#loja">Loja física</a></li><li><a href="conta.html">Minha conta</a></li><li><a href="politicas.html">Trocas e devoluções</a></li></ul></nav>' +
    '<div><h2>Contato</h2><ul><li><a href="' + CONFIG.whatsapp + '" target="_blank" rel="noopener">WhatsApp</a></li>' +
    '<li><a href="' + INSTAGRAM + '" target="_blank" rel="noopener">Instagram</a></li>' +
    '<li><a href="mailto:lookpremium96@gmail.com">E-mail</a></li></ul></div></div>' +
    '<p class="rodape-base">© 2026 Ellize Collection. Todos os direitos reservados.</p></div></footer>' +
    '<a class="fab" href="' + CONFIG.whatsapp + '?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20Ellize%20Collection." target="_blank" rel="noopener" aria-label="Falar pelo WhatsApp">' + icone('i-whatsapp') + '</a>';

  /* Dados da sacola */
  var CHAVE = 'ellize-carrinho';
  var carrinho = {
    ler: function () {
      try {
        var itens = JSON.parse(localStorage.getItem(CHAVE));
        return Array.isArray(itens) ? itens : [];
      } catch (erro) { return []; }
    },
    salvar: function (itens) {
      try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch (erro) {}
      carrinho.atualizarSelo();
      document.dispatchEvent(new CustomEvent('ellize:sacola'));
    },
    adicionar: function (id, cor, tamanho, quantidade, limite) {
      var itens = carrinho.ler();
      var item = itens.find(function (i) { return i.id === id && i.color === cor && i.size === tamanho; });
      if (item) item.qty = Math.min(limite || 10, 10, item.qty + quantidade);
      else itens.push({ id: id, color: cor, size: tamanho, qty: quantidade });
      carrinho.salvar(itens);
    },
    atualizarSelo: function () {
      var total = carrinho.ler().reduce(function (soma, i) { return soma + i.qty; }, 0);
      document.querySelectorAll('[data-carrinho-qtd]').forEach(function (selo) {
        selo.textContent = total;
        selo.hidden = total === 0;
      });
      document.querySelectorAll('.carrinho-link').forEach(function (link) {
        link.setAttribute('aria-label', total ? 'Abrir sacola, ' + total + (total === 1 ? ' item' : ' itens') : 'Abrir sacola');
      });
    }
  };
  window.EllizeCarrinho = carrinho;
  carrinho.atualizarSelo();
  window.addEventListener('storage', carrinho.atualizarSelo);

  /* Gaveta da sacola */
  document.body.insertAdjacentHTML('beforeend',
    '<dialog class="sacola" id="sacola" aria-labelledby="sacola-titulo">' +
    '<div class="sacola-topo"><h2 id="sacola-titulo">Sacola</h2>' +
    '<button class="botao-icone" type="button" data-fechar-sacola aria-label="Fechar sacola">' + icone('i-fechar', true) + '</button></div>' +
    '<div class="sacola-corpo" id="sacola-corpo"></div><div class="sacola-rodape" id="sacola-rodape"></div></dialog>');
  var sacola = document.getElementById('sacola');
  var sacolaCorpo = document.getElementById('sacola-corpo');
  var sacolaRodape = document.getElementById('sacola-rodape');
  var sacolaTitulo = document.getElementById('sacola-titulo');

  function linhaHTML(p, cor, tamanho) {
    return '<a href="produto.html?p=' + encodeURIComponent(p.slug) + '">' + esc(p.name) + '</a>' +
      '<span>' + variacao(cor, tamanho) + '</span><span>' + precoHTML(p) + '</span>';
  }
  function desenharLista() {
    sacolaTitulo.textContent = 'Sacola';
    sacolaRodape.innerHTML = '';
    sacolaCorpo.innerHTML = '<p>Carregando sacola…</p>';
    produtos().then(function (todos) {
      var mapa = {};
      todos.forEach(function (p) { mapa[p.id] = p; });
      var itens = carrinho.ler();
      var antes = JSON.stringify(itens);
      var validos = itens.filter(function (i) {
        return mapa[i.id] && estoque(mapa[i.id], i.color, i.size) > 0;
      });
      validos.forEach(function (i) { i.qty = Math.min(i.qty, estoque(mapa[i.id], i.color, i.size)); });
      if (JSON.stringify(validos) !== antes) carrinho.salvar(validos);
      if (!validos.length) {
        sacolaCorpo.innerHTML = '<div class="estado"><h2>Sua sacola está vazia</h2><p>Escolha suas peças nas novidades.</p><a class="botao botao-vinho" href="loja.html">Ver novidades</a></div>';
        return;
      }
      var total = validos.reduce(function (soma, i) { return soma + i.qty * preco(mapa[i.id]); }, 0);
      var totalPix = validos.reduce(function (soma, i) { return soma + i.qty * precoPix(mapa[i.id]); }, 0);
      sacolaCorpo.innerHTML = '<ul class="linhas">' + validos.map(function (i, n) {
        var p = mapa[i.id];
        return '<li class="linha"><img src="' + esc(fotoCor(p, i.color)) + '" alt="" width="72" height="90"><div class="linha-info">' + linhaHTML(p, i.color, i.size) + '</div>' +
          '<div class="linha-acoes"><div class="passo">' +
          '<button type="button" data-acao="menos" data-n="' + n + '" aria-label="Diminuir quantidade de ' + esc(p.name) + '"' + (i.qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span aria-live="polite">' + i.qty + '</span>' +
          '<button type="button" data-acao="mais" data-n="' + n + '" aria-label="Aumentar quantidade de ' + esc(p.name) + '"' + (i.qty >= Math.min(10, estoque(p, i.color, i.size)) ? ' disabled' : '') + '>+</button></div>' +
          '<button class="botao-icone" type="button" data-acao="remover" data-n="' + n + '" aria-label="Remover ' + esc(p.name) + '">' + icone('i-lixo', true) + '</button></div></li>';
      }).join('') + '</ul>';
      sacolaRodape.innerHTML = (totalPix < total ? '' : '<p class="sacola-valor"><span>Subtotal</span><strong>' + dinheiro(total) + '</strong></p>') +
        '<p class="sacola-valor"><span>Frete</span><strong>Calculado pelo CEP</strong></p>' +
        (totalPix < total
          ? '<p class="sacola-valor sacola-total"><span>Total no cartão</span><strong>' + dinheiro(total) + '</strong></p>' +
            '<p class="sacola-valor sacola-total"><span>Total no Pix</span><strong>' + dinheiro(totalPix) + '</strong></p>'
          : '<p class="sacola-valor sacola-total"><span>Valor total</span><strong>' + dinheiro(total) + '</strong></p>') +
        '<a class="botao botao-vinho botao-largo" href="carrinho.html">Finalizar compra</a>';
    }).catch(function () {
      sacolaCorpo.innerHTML = '<div class="estado"><h2>Não foi possível carregar</h2><p>Verifique sua conexão e tente novamente.</p></div>';
    });
  }
  function abrirSacola() {
    fecharTudo();
    if (!sacola.open) sacola.showModal();
  }
  function adicionar(p, cor, tamanho) {
    carrinho.adicionar(p.id, cor, tamanho, 1, estoque(p, cor, tamanho));
    abrirSacola();
    sacolaTitulo.textContent = 'Produto adicionado à sacola';
    sacolaCorpo.innerHTML = '<div class="linha"><img src="' + esc(fotoCor(p, cor)) + '" alt="" width="72" height="90"><div class="linha-info">' + linhaHTML(p, cor, tamanho) + '</div></div>' +
      '<div class="sacola-sugestao" id="sacola-sugestao" hidden><h3>Você pode gostar</h3></div>';
    sacolaRodape.innerHTML = '<button class="botao botao-vinho botao-largo" type="button" data-ver-sacola>Ver sacola</button>';
    produtos().then(function (todos) {
      var caixa = document.getElementById('sacola-sugestao');
      var lista = sugestoes(todos, p, 3);
      if (!caixa || !lista.length) return;
      caixa.insertAdjacentHTML('beforeend', vitrine(lista));
      caixa.hidden = false;
    }).catch(function () {});
  }
  document.addEventListener('click', function (evento) {
    if (evento.target.closest('[data-abrir-sacola]')) { abrirSacola(); desenharLista(); }
  });
  sacola.addEventListener('click', function (evento) {
    if (evento.target === sacola || evento.target.closest('[data-fechar-sacola]')) { sacola.close(); return; }
    if (evento.target.closest('[data-ver-sacola]')) { desenharLista(); return; }
    var botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    var itens = carrinho.ler();
    var item = itens[+botao.dataset.n];
    if (!item) return;
    if (botao.dataset.acao === 'mais') item.qty = Math.min(10, item.qty + 1);
    if (botao.dataset.acao === 'menos') item.qty = Math.max(1, item.qty - 1);
    if (botao.dataset.acao === 'remover') itens.splice(+botao.dataset.n, 1);
    carrinho.salvar(itens);
    desenharLista();
  });

  window.Ellize = {
    config: CONFIG, esc: esc, dinheiro: dinheiro, icone: icone,
    produtos: produtos, categorias: categorias, sugestoes: sugestoes, adicionar: adicionar,
    preco: preco, precoPix: precoPix, emPromocao: emPromocao, estoque: estoque, esgotado: esgotado, precoHTML: precoHTML,
    cores: cores, temCores: temCores, estoqueCor: estoqueCor, estoqueTamanho: estoqueTamanho, corHex: corHex, variacao: variacao, fotoCor: fotoCor
  };

  /* Menu e submenus */
  var botao = document.querySelector('.menu-botao');
  var lista = document.getElementById('menu-lista');
  var compacto = window.matchMedia('(max-width: 959.98px)');
  var comMouse = window.matchMedia('(hover: hover) and (min-width: 960px)');
  var gatilhos = lista.querySelectorAll('.menu-gatilho');
  var buscaBotao = document.querySelector('.busca-botao');
  var busca = document.getElementById('busca');
  var buscaCampo = busca.querySelector('input');
  var buscaResultados = busca.querySelector('.busca-resultados');
  var tempoFechar;

  function definirSubmenu(gatilho, aberto) {
    gatilho.setAttribute('aria-expanded', String(aberto));
    document.getElementById(gatilho.getAttribute('aria-controls')).hidden = !aberto;
    if (aberto) preencherVitrine(gatilho);
  }
  function fecharSubmenus(exceto) {
    gatilhos.forEach(function (g) { if (g !== exceto) definirSubmenu(g, false); });
  }
  function preencherVitrine(gatilho) {
    var caixa = document.getElementById(gatilho.getAttribute('aria-controls')).querySelector('[data-vitrine]');
    if (!caixa || caixa.dataset.pronta) return;
    caixa.dataset.pronta = '1';
    produtos().then(function (todos) {
      if (!todos.length) return;
      caixa.insertAdjacentHTML('beforeend', vitrine(todos.slice(0, 3)));
      caixa.hidden = false;
    }).catch(function () { delete caixa.dataset.pronta; });
  }
  function definirBusca(aberta) {
    busca.hidden = !aberta;
    buscaBotao.setAttribute('aria-expanded', String(aberta));
    buscaBotao.setAttribute('aria-label', aberta ? 'Fechar busca' : 'Abrir busca');
    if (aberta) buscaCampo.focus();
  }
  function definirMenu(aberto) {
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    lista.classList.toggle('aberta', aberto);
    document.body.classList.toggle('menu-aberto', aberto);
    if (!aberto) fecharSubmenus();
  }
  function fecharTudo() {
    fecharSubmenus();
    definirBusca(false);
    definirMenu(false);
  }

  botao.addEventListener('click', function () {
    var abrir = botao.getAttribute('aria-expanded') !== 'true';
    definirBusca(false);
    definirMenu(abrir);
  });
  gatilhos.forEach(function (gatilho) {
    var item = gatilho.parentElement;
    gatilho.addEventListener('click', function (evento) {
      var aberto = gatilho.getAttribute('aria-expanded') === 'true';
      var mouse = comMouse.matches && evento.detail > 0;
      definirBusca(false);
      fecharSubmenus(gatilho);
      definirSubmenu(gatilho, mouse ? true : !aberto);
    });
    item.addEventListener('mouseenter', function () {
      if (!comMouse.matches) return;
      clearTimeout(tempoFechar);
      definirBusca(false);
      fecharSubmenus(gatilho);
      definirSubmenu(gatilho, true);
    });
    item.addEventListener('mouseleave', function () {
      if (!comMouse.matches) return;
      tempoFechar = setTimeout(function () { definirSubmenu(gatilho, false); }, 180);
    });
  });
  lista.addEventListener('click', function (evento) {
    if (evento.target.closest('a')) fecharTudo();
  });

  buscaBotao.addEventListener('click', function () {
    var abrir = busca.hidden;
    fecharSubmenus();
    definirMenu(false);
    definirBusca(abrir);
  });
  buscaCampo.value = new URLSearchParams(location.search).get('q') || '';
  buscaCampo.addEventListener('input', function () {
    var termo = buscaCampo.value.trim().toLowerCase();
    if (termo.length < 2) { buscaResultados.innerHTML = ''; return; }
    produtos().then(function (todos) {
      if (buscaCampo.value.trim().toLowerCase() !== termo) return;
      var achados = todos.filter(function (p) { return p.name.toLowerCase().indexOf(termo) !== -1; }).slice(0, 4);
      buscaResultados.innerHTML = achados.length ? vitrine(achados) : '<p class="nota-pequena">Nenhuma peça encontrada.</p>';
    }).catch(function () {});
  });
  busca.addEventListener('submit', function (evento) {
    if (!buscaCampo.value.trim()) { evento.preventDefault(); buscaCampo.focus(); }
  });

  document.addEventListener('keydown', function (evento) {
    if (evento.key !== 'Escape' || sacola.open) return;
    var gatilhoAberto = lista.querySelector('.menu-gatilho[aria-expanded="true"]');
    if (!busca.hidden) { definirBusca(false); buscaBotao.focus(); return; }
    if (gatilhoAberto) { definirSubmenu(gatilhoAberto, false); gatilhoAberto.focus(); return; }
    if (botao.getAttribute('aria-expanded') === 'true') { definirMenu(false); botao.focus(); }
  });
  document.addEventListener('click', function (evento) {
    if (!evento.target.closest('.cabecalho')) fecharTudo();
  });
  compacto.addEventListener('change', fecharTudo);

  /* Categorias cadastradas no painel, na ordem definida */
  function linkCategoria(texto, filtro) {
    return '<a href="loja.html' + (filtro ? '?c=' + encodeURIComponent(filtro).replace(/%2C/g, ',') : '') + '">' + esc(texto) + '</a>';
  }
  function trocarLinks(titulo, html) {
    var coluna = lista.querySelector('[data-coluna="' + titulo + '"]');
    if (!coluna) return;
    coluna.querySelectorAll('a').forEach(function (a) { a.remove(); });
    coluna.insertAdjacentHTML('beforeend', html);
    coluna.hidden = !html;
  }
  function desenharDestaques(cats, pecas) {
    var grade = document.getElementById('destaques-grade');
    if (!grade) return;
    var TEXTURAS = ['cetim-vinho', 'cetim-rose', 'cetim-caramelo', 'cetim-preto'];
    var usadas = [];
    var texturas = 0;
    grade.innerHTML = cats.map(function (c) {
      var peca = c.image ? null : pecas.filter(function (p) {
        return p.tags.indexOf(c.slug) !== -1 && /^https?:/.test(p.image || '') && usadas.indexOf(p.image) === -1;
      })[0];
      if (peca) usadas.push(peca.image);
      var foto = c.image || (peca ? peca.image : 'assets/img/' + TEXTURAS[texturas++ % TEXTURAS.length] + '.webp');
      return '<a class="painel sobre-escuro" href="loja.html?c=' + encodeURIComponent(c.slug) + '">' +
        '<img src="' + esc(foto) + '" alt="" width="800" height="1000" loading="lazy">' +
        '<h3>' + esc(c.name) + '</h3>' +
        '<span class="painel-chamada">Ver peças ' + icone('i-seta', true) + '</span></a>';
    }).join('');
  }
  Promise.all([categorias(), produtos()]).then(function (dados) {
    var cats = dados[0];
    var pecas = dados[1];
    if (!cats.length) return;
    desenharDestaques(cats, pecas);
    var DEPARTAMENTOS = ['feminino', 'masculino'];
    var outras = cats.filter(function (c) { return DEPARTAMENTOS.indexOf(c.slug) === -1; });
    trocarLinks('Categorias', linkCategoria('Ver todas') + linkCategoria('Promoções', 'promocao') +
      cats.map(function (c) { return linkCategoria(c.name, c.slug); }).join(''));
    DEPARTAMENTOS.forEach(function (slug) {
      var departamento = cats.filter(function (c) { return c.slug === slug; })[0];
      var titulo = slug === 'feminino' ? 'Feminino' : 'Masculino';
      if (!departamento) { trocarLinks(titulo, ''); return; }
      var comPecas = outras.filter(function (c) {
        return pecas.some(function (p) { return p.tags.indexOf(slug) !== -1 && p.tags.indexOf(c.slug) !== -1; });
      });
      trocarLinks(titulo, linkCategoria('Ver tudo', slug) + comPecas.map(function (c) {
        return linkCategoria(c.name, slug + ',' + c.slug);
      }).join(''));
    });
    trocarLinks('Mais procurados', outras.map(function (c) { return linkCategoria(c.name, c.slug); }).join(''));
    var sugestoesBusca = busca.querySelector('.busca-sugestoes');
    sugestoesBusca.querySelectorAll('a').forEach(function (a) { a.remove(); });
    sugestoesBusca.insertAdjacentHTML('beforeend', outras.slice(0, 3).map(function (c) { return linkCategoria(c.name, c.slug); }).join(''));
  }).catch(function () {});

  /* Entrada suave */
  var itens = document.querySelectorAll('.revelar');
  if (!('IntersectionObserver' in window)) {
    itens.forEach(function (item) { item.classList.add('visivel'); });
    return;
  }
  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('visivel');
        observador.unobserve(entrada.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  itens.forEach(function (item) { observador.observe(item); });
})();
