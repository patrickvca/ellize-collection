(function () {
  var ICONES = 'assets/img/icones.svg#';
  var WHATSAPP = 'https://wa.me/5577988298955';
  var INSTAGRAM = 'https://www.instagram.com/ellizecollection/';
  function icone(nome, classe) {
    return '<svg class="icone ' + (classe || '') + '" aria-hidden="true"><use href="' + ICONES + nome + '"/></svg>';
  }

  var topo = document.getElementById('topo');
  if (topo) {
    topo.outerHTML = '<a class="pular" href="#conteudo">Pular para o conteúdo</a>' +
      '<p class="aviso">Enviamos para todo o Brasil</p>' +
      '<header class="cabecalho"><div class="cabecalho-barra">' +
      '<nav class="menu" aria-label="Menu principal">' +
      '<button class="botao-icone menu-botao" type="button" aria-expanded="false" aria-controls="menu-lista" aria-label="Abrir menu">' +
      icone('i-menu', 'icone-linha abrir') + icone('i-fechar', 'icone-linha fechar') + '</button>' +
      '<ul class="menu-lista" id="menu-lista">' +
      '<li><a href="loja.html">Comprar</a></li><li><a href="index.html#colecoes">Coleções</a></li>' +
      '<li><a href="index.html#destaques">Destaques</a></li><li><a href="index.html#marca">A marca</a></li>' +
      '<li><a href="index.html#loja">Loja física</a></li></ul></nav>' +
      '<a class="marca" href="index.html" aria-label="Ellize Collection, início"><img src="assets/img/logo.svg" alt="Ellize Collection" width="100" height="50"></a>' +
      '<div class="cabecalho-acoes">' +
      '<a class="botao-icone" href="conta.html" aria-label="Minha conta">' + icone('i-usuario', 'icone-linha') + '</a>' +
      '<a class="botao-icone carrinho-link" href="carrinho.html" aria-label="Carrinho">' + icone('i-sacola', 'icone-linha') +
      '<span class="carrinho-qtd" data-carrinho-qtd hidden></span></a>' +
      '<a class="botao botao-vinho botao-comprar" href="loja.html">Comprar</a>' +
      '</div></div></header>';
  }
  var rodape = document.getElementById('rodape');
  if (rodape) {
    rodape.outerHTML = '<footer class="rodape sobre-escuro"><div class="container"><div class="rodape-grade">' +
      '<div class="rodape-marca"><img class="rodape-logo" src="assets/img/logo-claro.svg" alt="Ellize Collection" width="190" height="95" loading="lazy"></div>' +
      '<nav aria-label="Site"><h2>Site</h2><ul><li><a href="loja.html">Comprar</a></li><li><a href="index.html#colecoes">Coleções</a></li>' +
      '<li><a href="index.html#marca">A marca</a></li><li><a href="index.html#loja">Loja física</a></li><li><a href="conta.html">Minha conta</a></li></ul></nav>' +
      '<div><h2>Contato</h2><ul><li><a href="' + WHATSAPP + '" target="_blank" rel="noopener">WhatsApp</a></li>' +
      '<li><a href="' + INSTAGRAM + '" target="_blank" rel="noopener">Instagram</a></li>' +
      '<li><a href="mailto:lookpremium96@gmail.com">E-mail</a></li></ul></div></div>' +
      '<p class="rodape-base">© 2026 Ellize Collection. Todos os direitos reservados.</p></div></footer>' +
      '<a class="fab" href="' + WHATSAPP + '?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20Ellize%20Collection." target="_blank" rel="noopener" aria-label="Falar pelo WhatsApp">' + icone('i-whatsapp') + '</a>';
  }

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
    },
    adicionar: function (id, tamanho, quantidade) {
      var itens = carrinho.ler();
      var item = itens.find(function (i) { return i.id === id && i.size === tamanho; });
      if (item) item.qty = Math.min(10, item.qty + quantidade);
      else itens.push({ id: id, size: tamanho, qty: quantidade });
      carrinho.salvar(itens);
    },
    atualizarSelo: function () {
      var total = carrinho.ler().reduce(function (soma, i) { return soma + i.qty; }, 0);
      document.querySelectorAll('[data-carrinho-qtd]').forEach(function (selo) {
        selo.textContent = total;
        selo.hidden = total === 0;
      });
      document.querySelectorAll('.carrinho-link').forEach(function (link) {
        link.setAttribute('aria-label', total ? 'Carrinho, ' + total + (total === 1 ? ' item' : ' itens') : 'Carrinho');
      });
    }
  };
  window.EllizeCarrinho = carrinho;
  carrinho.atualizarSelo();
  window.addEventListener('storage', carrinho.atualizarSelo);

  var botao = document.querySelector('.menu-botao');
  var lista = document.getElementById('menu-lista');
  var compacto = window.matchMedia('(max-width: 959.98px)');

  function definirMenu(aberto) {
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    lista.classList.toggle('aberta', aberto);
    document.body.classList.toggle('menu-aberto', aberto);
  }

  botao.addEventListener('click', function () {
    definirMenu(botao.getAttribute('aria-expanded') !== 'true');
  });
  lista.addEventListener('click', function (evento) {
    if (evento.target.closest('a')) definirMenu(false);
  });
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') {
      definirMenu(false);
      botao.focus();
    }
  });
  document.addEventListener('click', function (evento) {
    if (!evento.target.closest('.cabecalho')) definirMenu(false);
  });
  compacto.addEventListener('change', function () { definirMenu(false); });

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
