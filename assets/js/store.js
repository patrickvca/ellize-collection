(function () {
  var URL_SUPABASE = window.Ellize.config.url;
  var CHAVE_PUBLICA = window.Ellize.config.chave;
  var WHATSAPP = window.Ellize.config.whatsapp;
  var FILTROS = [
    ['', 'Todos'], ['feminino', 'Feminino'], ['masculino', 'Masculino'],
    ['conjuntos', 'Conjuntos'], ['vestidos', 'Vestidos'], ['bolsas', 'Bolsas'], ['promocao', 'Promoção']
  ];
  var STATUS = {
    novo: 'Aguardando pagamento', confirmado: 'Confirmado', pago: 'Pago',
    enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado'
  };
  var VOLTAS = ['carrinho.html'];

  var sb = window.supabase.createClient(URL_SUPABASE, CHAVE_PUBLICA, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
  });
  var carrinho = window.EllizeCarrinho;
  var parametros = new URLSearchParams(location.search);

  var dinheiro = window.Ellize.dinheiro;
  var esc = window.Ellize.esc;
  var icone = window.Ellize.icone;
  var preco = window.Ellize.preco;
  var precoPix = window.Ellize.precoPix;
  var emPromocao = window.Ellize.emPromocao;
  var estoque = window.Ellize.estoque;
  var esgotado = window.Ellize.esgotado;
  var precoHTML = window.Ellize.precoHTML;
  var cores = window.Ellize.cores;
  var temCores = window.Ellize.temCores;
  var estoqueCor = window.Ellize.estoqueCor;
  var estoqueTamanho = window.Ellize.estoqueTamanho;
  var corHex = window.Ellize.corHex;
  var variacao = window.Ellize.variacao;
  var fotoCor = window.Ellize.fotoCor;
  function $(seletor) { return document.querySelector(seletor); }
  function estado(titulo, texto, acao) {
    return '<div class="estado"><h2>' + esc(titulo) + '</h2>' + (texto ? '<p>' + esc(texto) + '</p>' : '') + (acao || '') + '</div>';
  }
  function erroCarregar() {
    return estado('Não foi possível carregar', 'Verifique sua conexão e tente novamente.',
      '<a class="botao botao-vinho" href="' + esc(location.pathname.split('/').pop() + location.search) + '">Tentar novamente</a>');
  }
  function selo(produto) {
    return '<span class="selos">' + (produto.is_sample ? '<span class="selo-exemplo">Exemplo</span>' : '') +
      (emPromocao(produto) ? '<span class="selo-exemplo selo-promo">Promoção</span>' : '') +
      (esgotado(produto) ? '<span class="selo-exemplo selo-esgotado">Esgotado</span>' : '') + '</span>';
  }
  function traduzirErro(erro) {
    var m = (erro && erro.message) || '';
    if (erro && erro.code === 'P0001') return m;
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.';
    if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use a opção Entrar.';
    if (/password.*(at least|characters|weak)/i.test(m)) return 'Use uma senha com pelo menos 8 caracteres.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (/fetch|network/i.test(m)) return 'Sem conexão. Verifique sua internet e tente novamente.';
    return 'Algo deu errado. Tente novamente.';
  }
  function ocupado(botao, ativo, texto) {
    if (ativo) {
      botao.dataset.texto = botao.textContent;
      botao.textContent = texto;
    } else if (botao.dataset.texto) {
      botao.textContent = botao.dataset.texto;
    }
    botao.disabled = ativo;
    botao.setAttribute('aria-busy', String(ativo));
  }
  function urlDaPagina(pagina) {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + pagina;
  }

  /* Catálogo */
  var NOMES = { feminino: 'Feminino', masculino: 'Masculino', conjuntos: 'Conjuntos', vestidos: 'Vestidos', bolsas: 'Bolsas', promocao: 'Promoção' };

  function trilha(itens) {
    return '<nav class="trilha" aria-label="Você está em"><ol>' + itens.map(function (item, n) {
      var ultimo = n === itens.length - 1;
      return '<li>' + (ultimo ? '<span aria-current="page">' + esc(item[0]) + '</span>' : '<a href="' + item[1] + '">' + esc(item[0]) + '</a>') + '</li>';
    }).join('') + '</ol></nav>';
  }
  function cartao(p) {
    var link = 'produto.html?p=' + encodeURIComponent(p.slug);
    var disponiveis = cores(p).filter(function (c) { return estoqueCor(p, c.name) > 0; });
    var rapida = '';
    if (disponiveis.length > 1) {
      rapida = '<div class="compra-rapida"><a class="rapida-botao" href="' + link + '">Ver cores</a></div>';
    } else if (disponiveis.length === 1) {
      var cor = disponiveis[0].name;
      rapida = '<div class="compra-rapida"><button class="rapida-botao" type="button" data-rapida>Compra rápida</button>' +
        '<div class="rapida-tamanhos" hidden>' + p.sizes.filter(function (t) { return estoque(p, cor, t) > 0; }).map(function (t) {
          return '<button type="button" data-tamanho="' + esc(t) + '" aria-label="Adicionar ' + esc(p.name) + ', tamanho ' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') + '</div></div>';
    }
    var pontos = temCores(p) ? '<span class="pontos-cor" aria-label="Cores: ' + esc(cores(p).map(function (c) { return c.name; }).join(', ')) + '">' +
      cores(p).map(function (c) { return '<i style="background:' + corHex(c) + '"></i>'; }).join('') + '</span>' : '';
    return '<article class="produto" data-id="' + esc(p.id) + '">' +
      '<div class="produto-foto"><a href="' + link + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.image) + '" alt="" width="800" height="1000" loading="lazy"></a>' + selo(p) +
      rapida + '</div>' +
      '<a class="produto-info" href="' + link + '"><span class="produto-nome">' + esc(p.name) + '</span>' +
      '<span class="produto-preco">' + precoHTML(p) + '</span>' + pontos + '</a></article>';
  }
  function ativarCompraRapida(raiz, mapa) {
    raiz.addEventListener('click', function (evento) {
      var cartaoAtual = evento.target.closest('.produto');
      if (!cartaoAtual) return;
      var p = mapa[cartaoAtual.dataset.id];
      var rapida = evento.target.closest('[data-rapida]');
      var tamanho = evento.target.closest('[data-tamanho]');
      if (!rapida && !tamanho) return;
      var corUnica = cores(p).filter(function (c) { return estoqueCor(p, c.name) > 0; })[0].name;
      if (rapida) {
        var livres = p.sizes.filter(function (t) { return estoque(p, corUnica, t) > 0; });
        if (livres.length === 1) { window.Ellize.adicionar(p, corUnica, livres[0]); return; }
        rapida.hidden = true;
        var opcoes = cartaoAtual.querySelector('.rapida-tamanhos');
        opcoes.hidden = false;
        opcoes.querySelector('button').focus();
      }
      if (tamanho) window.Ellize.adicionar(p, corUnica, tamanho.dataset.tamanho);
    });
  }

  function iniciarLoja() {
    var pedidas = (parametros.get('c') || '').split(',').filter(function (t) { return NOMES[t]; });
    var busca = (parametros.get('q') || '').trim().slice(0, 60);
    var titulo = busca ? 'Resultados para "' + busca + '"'
      : pedidas.length ? pedidas.map(function (t) { return NOMES[t]; }).join(' · ') : 'Novidades';
    var filtroAtual = !busca && pedidas.length < 2 ? (pedidas[0] || '') : null;
    var lista = [];
    var mapa = {};
    var grade = $('#produtos');
    var campoTamanho = $('#filtro-tamanho');
    var campoCor = $('#filtro-cor');
    var campoOrdem = $('#ordem');

    document.title = titulo + ' | Ellize Collection';
    $('#titulo').textContent = titulo;
    $('#trilha').innerHTML = trilha(pedidas.length || busca
      ? [['Início', 'index.html'], ['Novidades', 'loja.html'], [titulo]]
      : [['Início', 'index.html'], ['Novidades']]);
    $('#filtros').innerHTML = FILTROS.map(function (f) {
      var href = f[0] ? 'loja.html?c=' + f[0] : 'loja.html';
      return '<a class="filtro" href="' + href + '"' + (f[0] === filtroAtual ? ' aria-current="page"' : '') + '>' + esc(f[1]) + '</a>';
    }).join('');

    function desenhar() {
      var tamanho = campoTamanho.value;
      var ordem = campoOrdem.value;
      var cor = campoCor.value;
      var itens = lista.filter(function (p) {
        if (cor && tamanho) return estoque(p, cor, tamanho) > 0;
        if (cor) return estoqueCor(p, cor) > 0;
        return !tamanho || estoqueTamanho(p, tamanho) > 0;
      });
      if (ordem === 'menor') itens.sort(function (a, b) { return preco(a) - preco(b); });
      if (ordem === 'maior') itens.sort(function (a, b) { return preco(b) - preco(a); });
      $('#contagem').textContent = itens.length + (itens.length === 1 ? ' produto' : ' produtos');
      grade.innerHTML = itens.length ? itens.map(cartao).join('') : estado(
        busca ? 'Nenhuma peça encontrada' : 'Nenhuma peça por aqui',
        busca ? 'Tente outra palavra ou veja todas as novidades.' : 'Veja as outras categorias da loja.',
        '<a class="botao botao-vinho" href="loja.html">Ver novidades</a>');
    }

    var consulta = sb.from('products').select('*').order('created_at', { ascending: false });
    var categorias = pedidas.filter(function (t) { return t !== 'promocao'; });
    if (categorias.length) consulta = consulta.contains('tags', categorias);
    if (pedidas.indexOf('promocao') !== -1) consulta = consulta.or('promo_price_cents.not.is.null,promo_pix_price_cents.not.is.null');
    if (busca) consulta = consulta.ilike('name', '%' + busca.replace(/[%_\\]/g, '\\$&') + '%');
    consulta.then(function (resposta) {
      grade.setAttribute('aria-busy', 'false');
      if (resposta.error) { grade.innerHTML = erroCarregar(); return; }
      lista = resposta.data;
      lista.forEach(function (p) { mapa[p.id] = p; });
      if (lista.some(function (p) { return p.is_sample; })) $('#nota-exemplo').hidden = false;
      var tamanhos = [];
      lista.forEach(function (p) {
        p.sizes.forEach(function (t) { if (tamanhos.indexOf(t) === -1) tamanhos.push(t); });
      });
      campoTamanho.insertAdjacentHTML('beforeend', tamanhos.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join(''));
      var nomesCor = [];
      lista.forEach(function (p) {
        if (temCores(p)) cores(p).forEach(function (c) { if (nomesCor.indexOf(c.name) === -1) nomesCor.push(c.name); });
      });
      campoCor.insertAdjacentHTML('beforeend', nomesCor.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join(''));
      campoCor.parentElement.hidden = !nomesCor.length;
      campoCor.addEventListener('change', desenhar);
      campoTamanho.addEventListener('change', desenhar);
      campoOrdem.addEventListener('change', desenhar);
      ativarCompraRapida(grade, mapa);
      desenhar();
    }, function () { grade.innerHTML = erroCarregar(); });
  }

  /* Produto */
  function iniciarProduto() {
    var alvo = $('#produto');
    var slug = parametros.get('p');
    var naoAchou = estado('Peça não encontrada', 'Ela pode ter saído da loja.', '<a class="botao botao-vinho" href="loja.html">Ver novidades</a>');
    if (!slug) { alvo.innerHTML = naoAchou; return; }
    sb.from('products').select('*').eq('slug', slug).maybeSingle().then(function (resposta) {
      if (resposta.error) { alvo.innerHTML = erroCarregar(); return; }
      var p = resposta.data;
      if (!p) { alvo.innerHTML = naoAchou; return; }
      document.title = p.name + ' | Ellize Collection';
      var categoria = p.tags.filter(function (t) { return NOMES[t]; }).pop();
      $('#trilha').innerHTML = trilha([['Início', 'index.html'], ['Novidades', 'loja.html']]
        .concat(categoria ? [[NOMES[categoria], 'loja.html?c=' + categoria]] : []).concat([[p.name]]));
      var livres = cores(p).filter(function (c) { return estoqueCor(p, c.name) > 0; });
      var corAtual = livres.length === 1 ? livres[0].name : null;
      function htmlTamanhos(cor, marcado) {
        var disponiveis = p.sizes.filter(function (t) { return !cor || estoque(p, cor, t) > 0; });
        return '<legend>Tamanho</legend>' + p.sizes.map(function (t) {
          var tem = cor ? estoque(p, cor, t) > 0 : estoqueTamanho(p, t) > 0;
          var checado = tem && (marcado === t || (cor && disponiveis.length === 1));
          return '<label><input type="radio" name="tamanho" value="' + esc(t) + '"' + (checado ? ' checked' : '') + (tem ? '' : ' disabled') + '><span>' + esc(t) + '</span></label>';
        }).join('');
      }
      var seletorCor = temCores(p) ? '<fieldset class="cores"><legend>Cor<span id="cor-nome">' + (corAtual ? ': ' + esc(corAtual) : '') + '</span></legend>' + cores(p).map(function (c) {
        var tem = estoqueCor(p, c.name) > 0;
        return '<label title="' + esc(c.name) + '"><input type="radio" name="cor" value="' + esc(c.name) + '"' + (corAtual === c.name ? ' checked' : '') + (tem ? '' : ' disabled') + ' aria-label="' + esc(c.name) + (tem ? '' : ', esgotada') + '">' +
          '<span style="background:' + corHex(c) + '"></span></label>';
      }).join('') + '</fieldset><p class="campo-erro" id="erro-cor" role="alert" hidden>Selecione uma cor.</p>' : '';
      alvo.innerHTML =
        '<div class="detalhe-foto"><img id="foto-produto" src="' + esc(corAtual ? fotoCor(p, corAtual) : p.image) + '" alt="" width="800" height="1000">' + selo(p) + '</div>' +
        '<form class="detalhe-info" id="form-produto" novalidate>' +
        '<h1>' + esc(p.name) + '</h1>' +
        '<p class="detalhe-preco">' + precoHTML(p) + '</p>' +
        seletorCor +
        '<fieldset class="tamanhos" id="tamanhos-produto">' + htmlTamanhos(corAtual || (temCores(p) ? null : cores(p)[0].name)) + '</fieldset>' +
        '<p class="campo-erro" id="erro-tamanho" role="alert" hidden>Selecione um tamanho.</p>' +
        '<button class="botao botao-vinho botao-largo" type="submit"' + (livres.length ? '>Adicionar à sacola' : ' disabled>Esgotado') + '</button>' +
        '<a class="botao botao-linha botao-largo" target="_blank" rel="noopener" href="' + WHATSAPP + '?text=' +
        encodeURIComponent('Olá! Tenho uma dúvida sobre: ' + p.name) + '">' + icone('i-whatsapp') + 'Tirar dúvida no WhatsApp</a>' +
        '<div class="sanfona"><details open><summary>Sobre a peça</summary><p>' + esc(p.description) + '</p></details>' +
        '<details><summary>Entrega</summary><p>Enviamos para todo o Brasil, e você também pode retirar na loja em Vitória da Conquista. O frete é combinado com a loja pelo WhatsApp.</p></details></div>' +
        '</form>';
      $('#form-produto').addEventListener('submit', function (evento) {
        evento.preventDefault();
        var escolhido = this.querySelector('input[name="tamanho"]:checked');
        var corMarcada = this.querySelector('input[name="cor"]:checked');
        var cor = temCores(p) ? (corMarcada && corMarcada.value) : cores(p)[0].name;
        if ($('#erro-cor')) $('#erro-cor').hidden = !!cor;
        $('#erro-tamanho').hidden = !!escolhido;
        if (cor && escolhido) window.Ellize.adicionar(p, cor, escolhido.value);
      });
      $('#form-produto').addEventListener('change', function (evento) {
        if (evento.target.name !== 'cor') return;
        var marcado = this.querySelector('input[name="tamanho"]:checked');
        $('#cor-nome').textContent = ': ' + evento.target.value;
        $('#foto-produto').src = fotoCor(p, evento.target.value);
        $('#erro-cor').hidden = true;
        $('#tamanhos-produto').innerHTML = htmlTamanhos(evento.target.value, marcado && marcado.value);
      });
      window.Ellize.produtos().then(function (todos) {
        var parecidos = window.Ellize.sugestoes(todos, p, 4);
        if (!parecidos.length) return;
        var mapa = {};
        parecidos.forEach(function (item) { mapa[item.id] = item; });
        var caixa = $('#relacionados');
        caixa.innerHTML = '<h2>Você pode gostar</h2><div class="produtos">' + parecidos.map(cartao).join('') + '</div>';
        caixa.hidden = false;
        ativarCompraRapida(caixa, mapa);
      }, function () {});
    }, function () { alvo.innerHTML = erroCarregar(); });
  }

  /* Carrinho e fechamento do pedido */
  function iniciarCarrinho() {
    var alvo = $('#carrinho');
    var produtos = {};

    function linhasValidas() {
      return carrinho.ler().filter(function (i) {
        return produtos[i.id] && estoque(produtos[i.id], i.color, i.size) > 0;
      }).map(function (i) {
        i.qty = Math.min(i.qty, estoque(produtos[i.id], i.color, i.size));
        return i;
      });
    }
    function total(pix) {
      return linhasValidas().reduce(function (soma, i) {
        return soma + i.qty * (pix ? precoPix(produtos[i.id]) : preco(produtos[i.id]));
      }, 0);
    }
    function atualizarTotais() {
      var cartao = total(false);
      var pix = total(true);
      $('#total').textContent = dinheiro(cartao);
      $('#total-pix').textContent = dinheiro(pix);
      $('#linha-pix').hidden = pix >= cartao;
      $('#rotulo-total').textContent = pix < cartao ? 'Total no cartão' : 'Total das peças';
      if ($('#opcao-pix')) {
        $('#opcao-pix').textContent = 'Pix · ' + dinheiro(pix);
        $('#opcao-cartao').textContent = 'Cartão · ' + dinheiro(cartao);
      }
    }
    function desenharVazio() {
      alvo.innerHTML = estado('Sua sacola está vazia', 'Escolha suas peças nas novidades.', '<a class="botao botao-vinho" href="loja.html">Ver novidades</a>');
    }
    function desenharLinhas() {
      var linhas = linhasValidas();
      if (!linhas.length) { desenharVazio(); return; }
      $('#itens').innerHTML = linhas.map(function (i, n) {
        var p = produtos[i.id];
        return '<li class="linha"><img src="' + esc(fotoCor(p, i.color)) + '" alt="" width="96" height="120">' +
          '<div class="linha-info"><a href="produto.html?p=' + encodeURIComponent(p.slug) + '">' + esc(p.name) + '</a>' +
          '<span>' + variacao(i.color, i.size) + '</span><span>' + precoHTML(p) + '</span></div>' +
          '<div class="linha-acoes"><div class="passo">' +
          '<button type="button" data-acao="menos" data-n="' + n + '" aria-label="Diminuir quantidade de ' + esc(p.name) + '"' + (i.qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span aria-live="polite">' + i.qty + '</span>' +
          '<button type="button" data-acao="mais" data-n="' + n + '" aria-label="Aumentar quantidade de ' + esc(p.name) + '"' + (i.qty >= Math.min(10, estoque(p, i.color, i.size)) ? ' disabled' : '') + '>+</button></div>' +
          '<button class="botao-icone" type="button" data-acao="remover" data-n="' + n + '" aria-label="Remover ' + esc(p.name) + '">' + icone('i-lixo', true) + '</button></div></li>';
      }).join('');
      atualizarTotais();
    }
    function desenharFechamento(sessao) {
      var caixa = $('#fechamento');
      if (!sessao) {
        caixa.innerHTML = '<p>Entre na sua conta para fechar o pedido. Sua sacola fica guardada.</p>' +
          '<a class="botao botao-vinho botao-largo" href="conta.html?volta=carrinho.html">Entrar ou criar conta</a>';
        return;
      }
      var meta = sessao.user.user_metadata || {};
      caixa.innerHTML =
        '<form id="form-pedido" class="formulario" novalidate>' +
        '<label class="campo">Nome completo<input name="nome" autocomplete="name" required minlength="2" maxlength="120" value="' + esc(meta.full_name || meta.name || '') + '"></label>' +
        '<label class="campo">Telefone com DDD<input name="telefone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20"></label>' +
        '<fieldset class="opcoes"><legend>Como quer pagar?</legend>' +
        '<label><input type="radio" name="pagamento" value="pix" checked><span id="opcao-pix"></span></label>' +
        '<label><input type="radio" name="pagamento" value="cartao"><span id="opcao-cartao"></span></label></fieldset>' +
        '<fieldset class="opcoes"><legend>Como quer receber?</legend>' +
        '<label><input type="radio" name="entrega" value="retirada" checked><span>Retirar na loja</span></label>' +
        '<label><input type="radio" name="entrega" value="envio"><span>Receber em casa</span></label></fieldset>' +
        '<label class="campo" id="campo-endereco" hidden>Endereço completo com CEP<textarea name="endereco" rows="3" autocomplete="street-address" maxlength="300"></textarea></label>' +
        '<label class="campo">Observação (opcional)<textarea name="nota" rows="2" maxlength="500"></textarea></label>' +
        '<p class="mensagem mensagem-erro" id="erro-pedido" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Fechar pedido</button>' +
        '<p class="nota-pequena">Ao fechar, você vai para o WhatsApp da loja para combinar o pagamento e o frete.</p></form>';
      var form = $('#form-pedido');
      form.addEventListener('change', function () {
        $('#campo-endereco').hidden = form.entrega.value !== 'envio';
      });
      form.addEventListener('submit', enviarPedido);
      atualizarTotais();
    }
    function enviarPedido(evento) {
      evento.preventDefault();
      var form = evento.target;
      var erro = $('#erro-pedido');
      var botao = form.querySelector('button[type="submit"]');
      var linhas = linhasValidas();
      erro.hidden = true;
      ocupado(botao, true, 'Enviando pedido…');
      sb.rpc('create_order', {
        p_items: linhas.map(function (i) { return { product_id: i.id, color: i.color, size: i.size, quantity: i.qty }; }),
        p_name: form.nome.value,
        p_phone: form.telefone.value,
        p_delivery: form.entrega.value,
        p_payment: form.pagamento.value,
        p_address: form.endereco.value,
        p_note: form.nota.value
      }).then(function (resposta) {
        if (resposta.error) {
          ocupado(botao, false);
          erro.textContent = traduzirErro(resposta.error);
          erro.hidden = false;
          return;
        }
        var pedido = resposta.data;
        var texto = 'Olá! Fiz o pedido #' + pedido.number + ' no site da Ellize Collection.\n\n' +
          linhas.map(function (i) { return i.qty + 'x ' + produtos[i.id].name + ' (' + (i.color !== 'Única' ? i.color + ', ' : '') + i.size + ')'; }).join('\n') +
          '\n\nTotal: ' + dinheiro(pedido.total_cents) + '\nPagamento: ' + (form.pagamento.value === 'pix' ? 'Pix' : 'Cartão') + '\nEntrega: ' + (form.entrega.value === 'envio' ? 'Receber em casa' : 'Retirar na loja');
        var linkPedido = WHATSAPP + '?text=' + encodeURIComponent(texto);
        carrinho.salvar([]);
        alvo.innerHTML = '<div class="estado estado-sucesso"><span class="etiqueta">Pedido #' + esc(pedido.number) + '</span>' +
          '<h2>Pedido recebido</h2><p>Total de ' + dinheiro(pedido.total_cents) + '. Abrindo o WhatsApp para você combinar o pagamento e o frete. Se não abrir, use o botão abaixo.</p>' +
          '<a class="botao botao-vinho" href="' + linkPedido + '">' + icone('i-whatsapp') + 'Enviar no WhatsApp</a>' +
          '<a class="botao botao-linha" href="conta.html">Ver meus pedidos</a></div>';
        window.scrollTo(0, 0);
        location.href = linkPedido;
      }, function () {
        ocupado(botao, false);
        erro.textContent = 'Sem conexão. Verifique sua internet e tente novamente.';
        erro.hidden = false;
      });
    }

    var ids = carrinho.ler().map(function (i) { return i.id; });
    if (!ids.length) { desenharVazio(); return; }
    Promise.all([sb.from('products').select('*').in('id', ids), sb.auth.getSession()]).then(function (r) {
      if (r[0].error) { alvo.innerHTML = erroCarregar(); return; }
      r[0].data.forEach(function (p) { produtos[p.id] = p; });
      var validas = linhasValidas();
      if (JSON.stringify(validas) !== JSON.stringify(carrinho.ler())) carrinho.salvar(validas);
      if (!validas.length) { desenharVazio(); return; }
      alvo.innerHTML = '<ul class="linhas" id="itens"></ul><aside class="resumo">' +
        '<p class="resumo-total"><span id="rotulo-total">Total das peças</span><strong id="total"></strong></p>' +
        '<p class="resumo-total" id="linha-pix" hidden><span>Total no Pix</span><strong id="total-pix"></strong></p>' +
        '<p class="nota-pequena">Frete combinado com a loja.</p><div id="fechamento"></div></aside>';
      desenharLinhas();
      desenharFechamento(r[1].data.session);
      document.addEventListener('ellize:sacola', function () { if ($('#itens')) desenharLinhas(); });
      $('#itens').addEventListener('click', function (evento) {
        var botao = evento.target.closest('[data-acao]');
        if (!botao) return;
        var itens = linhasValidas();
        var item = itens[+botao.dataset.n];
        if (botao.dataset.acao === 'mais') item.qty = Math.min(10, item.qty + 1);
        if (botao.dataset.acao === 'menos') item.qty = Math.max(1, item.qty - 1);
        if (botao.dataset.acao === 'remover') itens.splice(+botao.dataset.n, 1);
        carrinho.salvar(itens);
        desenharLinhas();
      });
    }, function () { alvo.innerHTML = erroCarregar(); });
  }

  /* Conta */
  function iniciarConta() {
    var alvo = $('#conta');
    var volta = parametros.get('volta');
    if (VOLTAS.indexOf(volta) === -1) volta = null;
    var recuperando = false;

    function campoEmail() {
      return '<label class="campo">E-mail<input name="email" type="email" autocomplete="email" required></label>';
    }
    function desenharAcesso(modo) {
      var cadastro = modo === 'cadastro';
      alvo.innerHTML = '<div class="acesso">' +
        '<h1>' + (cadastro ? 'Criar conta' : 'Entrar') + '</h1>' +
        '<button class="botao botao-linha botao-largo" id="google" type="button" disabled>Continuar com Google</button>' +
        '<p class="nota-pequena" id="google-nota" hidden>O login com Google ainda está sendo ativado. Use e-mail e senha.</p>' +
        '<p class="divisor"><span>ou</span></p>' +
        '<form class="formulario" id="form-acesso" novalidate>' +
        (cadastro ? '<label class="campo">Nome<input name="nome" autocomplete="name" required minlength="2" maxlength="120"></label>' : '') +
        campoEmail() +
        '<label class="campo">Senha<input name="senha" type="password" autocomplete="' + (cadastro ? 'new-password' : 'current-password') + '" required minlength="8"></label>' +
        '<p class="mensagem" id="msg-acesso" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">' + (cadastro ? 'Criar conta' : 'Entrar') + '</button></form>' +
        '<p class="troca">' + (cadastro
          ? 'Já tem conta? <button class="link" type="button" data-modo="entrar">Entrar</button>'
          : 'Ainda não tem conta? <button class="link" type="button" data-modo="cadastro">Criar conta</button><br><button class="link" type="button" data-modo="senha">Esqueci minha senha</button>') +
        '</p></div>';
      ativarGoogle();
      $('#form-acesso').addEventListener('submit', function (evento) {
        evento.preventDefault();
        var form = evento.target;
        var botao = form.querySelector('button[type="submit"]');
        if (!form.reportValidity()) return;
        ocupado(botao, true, 'Aguarde…');
        var pedido = cadastro
          ? sb.auth.signUp({
            email: form.email.value, password: form.senha.value,
            options: { data: { full_name: form.nome.value }, emailRedirectTo: urlDaPagina('conta.html') }
          })
          : sb.auth.signInWithPassword({ email: form.email.value, password: form.senha.value });
        pedido.then(function (r) {
          ocupado(botao, false);
          if (r.error) { mensagem('#msg-acesso', traduzirErro(r.error), true); return; }
          if (cadastro && !r.data.session) {
            mensagem('#msg-acesso', 'Quase lá! Enviamos um link de confirmação para o seu e-mail.', false);
            return;
          }
          aposEntrar();
        }, function () {
          ocupado(botao, false);
          mensagem('#msg-acesso', 'Sem conexão. Verifique sua internet e tente novamente.', true);
        });
      });
    }
    function mensagem(seletor, texto, erro) {
      var m = $(seletor);
      m.textContent = texto;
      m.className = 'mensagem ' + (erro ? 'mensagem-erro' : 'mensagem-sucesso');
      m.hidden = false;
    }
    function ativarGoogle() {
      var botao = $('#google');
      fetch(URL_SUPABASE + '/auth/v1/settings', { headers: { apikey: CHAVE_PUBLICA } })
        .then(function (r) { return r.json(); })
        .then(function (config) {
          if (!botao.isConnected) return;
          if (!config.external || !config.external.google) { $('#google-nota').hidden = false; return; }
          botao.disabled = false;
          botao.addEventListener('click', function () {
            ocupado(botao, true, 'Abrindo o Google…');
            sb.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: urlDaPagina(volta ? 'conta.html?volta=' + volta : 'conta.html') }
            });
          });
        })
        .catch(function () { $('#google-nota').hidden = false; });
    }
    function desenharRecuperar() {
      alvo.innerHTML = '<div class="acesso"><h1>Recuperar senha</h1>' +
        '<form class="formulario" id="form-senha" novalidate>' + campoEmail() +
        '<p class="mensagem" id="msg-senha" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Enviar link</button></form>' +
        '<p class="troca"><button class="link" type="button" data-modo="entrar">Voltar para entrar</button></p></div>';
      $('#form-senha').addEventListener('submit', function (evento) {
        evento.preventDefault();
        var form = evento.target;
        var botao = form.querySelector('button[type="submit"]');
        if (!form.reportValidity()) return;
        ocupado(botao, true, 'Enviando…');
        sb.auth.resetPasswordForEmail(form.email.value, { redirectTo: urlDaPagina('conta.html') }).then(function (r) {
          ocupado(botao, false);
          if (r.error) mensagem('#msg-senha', traduzirErro(r.error), true);
          else mensagem('#msg-senha', 'Se este e-mail tiver conta, você vai receber um link para criar uma nova senha.', false);
        });
      });
    }
    function desenharNovaSenha() {
      alvo.innerHTML = '<div class="acesso"><h1>Nova senha</h1><form class="formulario" id="form-nova" novalidate>' +
        '<label class="campo">Nova senha<input name="senha" type="password" autocomplete="new-password" required minlength="8"></label>' +
        '<p class="mensagem" id="msg-nova" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Salvar senha</button></form></div>';
      $('#form-nova').addEventListener('submit', function (evento) {
        evento.preventDefault();
        var form = evento.target;
        var botao = form.querySelector('button[type="submit"]');
        if (!form.reportValidity()) return;
        ocupado(botao, true, 'Salvando…');
        sb.auth.updateUser({ password: form.senha.value }).then(function (r) {
          ocupado(botao, false);
          if (r.error) { mensagem('#msg-nova', traduzirErro(r.error), true); return; }
          recuperando = false;
          aposEntrar();
        });
      });
    }
    function aposEntrar() {
      if (volta) { location.href = volta; return; }
      sb.auth.getSession().then(function (r) { desenharPainel(r.data.session); });
    }
    function desenharPainel(sessao) {
      var meta = sessao.user.user_metadata || {};
      alvo.innerHTML = '<div class="painel-conta"><div class="conta-topo"><div><span class="etiqueta">Minha conta</span>' +
        '<h1>Olá' + (meta.full_name ? ', ' + esc(meta.full_name.split(' ')[0]) : '') + '</h1><p>' + esc(sessao.user.email) + '</p></div>' +
        '<button class="botao botao-linha" id="sair" type="button">Sair</button></div>' +
        '<h2>Meus pedidos</h2><div id="pedidos" aria-busy="true"><p>Carregando pedidos…</p></div></div>';
      $('#sair').addEventListener('click', function () {
        sb.auth.signOut().then(function () { desenharAcesso('entrar'); });
      });
      sb.from('orders').select('number,total_cents,status,delivery,payment_choice,created_at,order_items(product_name,color,size,quantity)')
        .order('created_at', { ascending: false }).then(function (r) {
          var caixa = $('#pedidos');
          if (!caixa) return;
          caixa.setAttribute('aria-busy', 'false');
          if (r.error) { caixa.innerHTML = '<p class="mensagem mensagem-erro">Não foi possível carregar seus pedidos.</p>'; return; }
          if (!r.data.length) {
            caixa.innerHTML = estado('Nenhum pedido ainda', 'Seus pedidos aparecem aqui.', '<a class="botao botao-vinho" href="loja.html">Ver novidades</a>');
            return;
          }
          caixa.innerHTML = '<ul class="pedidos">' + r.data.map(function (o) {
            return '<li class="pedido"><div class="pedido-topo"><strong>Pedido #' + esc(o.number) + '</strong>' +
              '<span class="pedido-status">' + esc(STATUS[o.status] || o.status) + '</span></div>' +
              '<p>' + new Date(o.created_at).toLocaleDateString('pt-BR') + ' · ' + dinheiro(o.total_cents) + ' · ' + (o.payment_choice === 'pix' ? 'Pix' : 'Cartão') + ' · ' + (o.delivery === 'envio' ? 'Receber em casa' : 'Retirar na loja') + '</p>' +
              '<ul>' + o.order_items.map(function (i) {
                return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + (i.color !== 'Única' ? esc(i.color) + ', ' : '') + esc(i.size) + ')</li>';
              }).join('') + '</ul></li>';
          }).join('') + '</ul>';
        });
    }

    alvo.addEventListener('click', function (evento) {
      var botao = evento.target.closest('[data-modo]');
      if (!botao) return;
      if (botao.dataset.modo === 'senha') desenharRecuperar();
      else desenharAcesso(botao.dataset.modo);
    });
    sb.auth.onAuthStateChange(function (evento) {
      if (evento === 'PASSWORD_RECOVERY') {
        recuperando = true;
        setTimeout(desenharNovaSenha, 0);
      }
    });
    sb.auth.getSession().then(function (r) {
      if (recuperando) return;
      if (r.data.session) {
        if (volta) { location.href = volta; return; }
        desenharPainel(r.data.session);
      } else {
        desenharAcesso('entrar');
      }
    });
  }

  var iniciar = { loja: iniciarLoja, produto: iniciarProduto, carrinho: iniciarCarrinho, conta: iniciarConta };
  function iniciarPagina() { iniciar[document.body.dataset.pagina](); }
  window.Ellize.categorias().then(function (lista) {
    if (lista.length) {
      NOMES = { promocao: 'Promoção' };
      lista.forEach(function (c) { NOMES[c.slug] = c.name; });
      FILTROS = [['', 'Todos']].concat(lista.map(function (c) { return [c.slug, c.name]; }), [['promocao', 'Promoção']]);
    }
  }).catch(function () {}).then(iniciarPagina);
})();
