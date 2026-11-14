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
    return '<span class="selos">' +
      (emPromocao(produto) ? '<span class="selo-exemplo selo-promo">Promoção</span>' : '') +
      (esgotado(produto) ? '<span class="selo-exemplo selo-esgotado">Esgotado</span>' : '') + '</span>';
  }
  function pagamento(corpo, funcao) {
    return sb.auth.getSession().then(function (r) {
      var sessao = r.data.session;
      var controle = new AbortController();
      var limite = setTimeout(function () { controle.abort(); }, 15000);
      return fetch(URL_SUPABASE + '/functions/v1/' + (funcao || 'pagamento'), {
        method: 'POST',
        signal: controle.signal,
        headers: { 'Content-Type': 'application/json', apikey: CHAVE_PUBLICA, Authorization: 'Bearer ' + (sessao ? sessao.access_token : CHAVE_PUBLICA) },
        body: JSON.stringify(corpo)
      }).then(function (resposta) {
        clearTimeout(limite);
        return resposta.json();
      });
    }).catch(function () { return { error: 'Sem conexão. Tente novamente.' }; });
  }
  var FORMAS = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
  function cepComTraco(valor) {
    var numeros = String(valor || '').replace(/\D/g, '').slice(0, 8);
    return numeros.length > 5 ? numeros.slice(0, 5) + '-' + numeros.slice(5) : numeros;
  }
  function buscarCep(cep) {
    return fetch('https://viacep.com.br/ws/' + cep + '/json/').then(function (r) { return r.json(); });
  }
  function enderecoCurto(e) {
    return e.street + ', ' + e.number + (e.complement ? ', ' + e.complement : '') + ' · ' + e.district + ', ' + e.city + ' - ' + e.state;
  }
  function cotar(cep, itens) {
    return fetch(URL_SUPABASE + '/functions/v1/frete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CHAVE_PUBLICA },
      body: JSON.stringify({ cep: cep, items: itens })
    }).then(function (r) { return r.json(); });
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
        '<div class="detalhe-midia"><div class="detalhe-foto" id="galeria-palco"></div><div class="galeria-miniaturas" id="galeria-miniaturas"></div></div>' +
        '<form class="detalhe-info" id="form-produto" novalidate>' +
        '<h1>' + esc(p.name) + '</h1>' +
        '<p class="detalhe-preco">' + precoHTML(p) + '</p>' +
        seletorCor +
        '<fieldset class="tamanhos" id="tamanhos-produto">' + htmlTamanhos(corAtual || (temCores(p) ? null : cores(p)[0].name)) + '</fieldset>' +
        '<p class="campo-erro" id="erro-tamanho" role="alert" hidden>Selecione um tamanho.</p>' +
        '<button class="botao botao-vinho botao-largo" type="submit"' + (livres.length ? '>Adicionar à sacola' : ' disabled>Esgotado') + '</button>' +
        '<a class="botao botao-linha botao-largo" target="_blank" rel="noopener" href="' + WHATSAPP + '?text=' +
        encodeURIComponent('Olá! Tenho uma dúvida sobre: ' + p.name) + '">' + icone('i-whatsapp') + 'Tirar dúvida no WhatsApp</a>' +
        '<div class="frete-produto"><label class="campo">Calcule o frete<span class="frete-linha">' +
        '<input id="cep-produto" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000">' +
        '<button class="botao botao-linha" type="button" id="calcular-produto">Calcular</button></span></label>' +
        '<div id="frete-produto" aria-live="polite"></div></div>' +
        '<div class="sanfona"><details open><summary>Sobre a peça</summary><p>' + esc(p.description) + '</p></details>' +
        '<details><summary>Entrega</summary><p>Enviamos para todo o Brasil pelos Correios, com valor e prazo calculados pelo CEP. Em Vitória da Conquista, você retira na loja sem custo ou recebe em casa por R$ 10,00.</p></details>' +
        '<details><summary>Trocas e devoluções</summary><p>Você tem até 7 dias depois do recebimento para pedir troca ou devolução. <a href="politicas.html">Ver a política completa</a>.</p></details></div>' +
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
      var campoCep = $('#cep-produto');
      try { campoCep.value = cepComTraco(localStorage.getItem('ellize:cep') || ''); } catch (e) {}
      function calcularNoProduto() {
        var cep = campoCep.value.replace(/\D/g, '');
        var caixa = $('#frete-produto');
        if (cep.length !== 8) { caixa.innerHTML = '<p class="mensagem mensagem-erro">Informe um CEP com 8 números.</p>'; return; }
        caixa.innerHTML = '<p class="nota-pequena">Calculando o frete…</p>';
        cotar(cep, [{ product_id: p.id, quantity: 1 }]).then(function (dados) {
          if (dados.error) {
            caixa.innerHTML = '<p class="mensagem mensagem-erro">' + esc(dados.error) + '</p>';
            return;
          }
          try { localStorage.setItem('ellize:cep', dados.cep); } catch (e) {}
          caixa.innerHTML = '<p class="nota-pequena">Entrega para ' + esc(dados.city + ' - ' + dados.state) + ', para 1 peça:</p><ul class="frete-lista">' +
            dados.options.map(function (o) {
              return '<li><span>' + esc(o.service) + (o.days ? ' · até ' + o.days + (o.days === 1 ? ' dia' : ' dias') : '') + '</span><strong>' +
                (o.price_cents ? dinheiro(o.price_cents) : 'Grátis') + '</strong></li>';
            }).join('') + '</ul>';
        }, function () {
          caixa.innerHTML = '<p class="mensagem mensagem-erro">Não foi possível calcular o frete. Verifique sua conexão.</p>';
        });
      }
      campoCep.addEventListener('input', function () { campoCep.value = cepComTraco(campoCep.value); });
      campoCep.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') { evento.preventDefault(); calcularNoProduto(); }
      });
      $('#calcular-produto').addEventListener('click', calcularNoProduto);
      /* Galeria: vídeos primeiro, depois as fotos da cor escolhida */
      var midias = [];
      var atual = 0;
      function montarGaleria(cor, comecarNaFoto) {
        var achada = cor ? cores(p).filter(function (c) { return c.name === cor; })[0] : null;
        var fotos = p.images && p.images.length ? p.images
          : achada ? (achada.images && achada.images.length ? achada.images : (achada.image ? [achada.image] : [])) : [];
        if (!fotos.length) fotos = [p.image];
        var videos = (p.videos || []).map(function (url) { return { tipo: 'video', url: url }; });
        midias = videos.concat(fotos.map(function (url) { return { tipo: 'foto', url: url }; }));
        $('#galeria-miniaturas').innerHTML = midias.length > 1 ? midias.map(function (m, i) {
          return '<button type="button" class="miniatura' + (m.tipo === 'video' ? ' miniatura-video' : '') + '" data-midia="' + i + '" aria-label="' +
            (m.tipo === 'video' ? 'Ver vídeo ' + (i + 1) : 'Ver foto ' + (i - videos.length + 1)) + '">' +
            (m.tipo === 'video' ? '<video src="' + esc(m.url) + '#t=0.5" muted playsinline preload="metadata"></video>' : '<img src="' + esc(m.url) + '" alt="" width="80" height="100" loading="lazy">') + '</button>';
        }).join('') : '';
        mostrar(comecarNaFoto ? videos.length : 0);
      }
      function mostrar(indice) {
        atual = (indice + midias.length) % midias.length;
        var m = midias[atual];
        $('#galeria-palco').innerHTML = (m.tipo === 'video'
          ? '<video src="' + esc(m.url) + '" controls muted autoplay loop playsinline preload="metadata"></video>'
          : '<img src="' + esc(m.url) + '" alt="' + esc(p.name) + '" width="800" height="1000">') +
          selo(p) +
          (midias.length > 1 ? '<button type="button" class="galeria-seta galeria-anterior" data-passo="-1" aria-label="Anterior">‹</button>' +
            '<button type="button" class="galeria-seta galeria-proxima" data-passo="1" aria-label="Próxima">›</button>' : '');
        document.querySelectorAll('#galeria-miniaturas [data-midia]').forEach(function (b) {
          b.setAttribute('aria-current', String(+b.dataset.midia === atual));
        });
      }
      $('#galeria-palco').addEventListener('click', function (evento) {
        var seta = evento.target.closest('[data-passo]');
        if (seta) mostrar(atual + Number(seta.dataset.passo));
      });
      $('#galeria-miniaturas').addEventListener('click', function (evento) {
        var botao = evento.target.closest('[data-midia]');
        if (botao) mostrar(+botao.dataset.midia);
      });
      var toqueX = null;
      $('#galeria-palco').addEventListener('touchstart', function (evento) { toqueX = evento.touches[0].clientX; }, { passive: true });
      $('#galeria-palco').addEventListener('touchend', function (evento) {
        if (toqueX === null || evento.target.closest('video')) { toqueX = null; return; }
        var distancia = evento.changedTouches[0].clientX - toqueX;
        toqueX = null;
        if (Math.abs(distancia) > 40 && midias.length > 1) mostrar(atual + (distancia < 0 ? 1 : -1));
      });
      montarGaleria(corAtual, false);
      $('#form-produto').addEventListener('change', function (evento) {
        if (evento.target.name !== 'cor') return;
        var marcado = this.querySelector('input[name="tamanho"]:checked');
        $('#cor-nome').textContent = ': ' + evento.target.value;
        montarGaleria(evento.target.value, true);
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
    var frete = null;
    var consultaFrete = 0;
    var saldoCredito = 0;
    var enderecos = [];
    var enderecoEscolhido = null;
    function valorFrete() { return frete && frete.escolhida ? frete.escolhida.price_cents : 0; }
    function usandoCredito() { var campo = $('#usar-credito'); return saldoCredito > 0 && !!(campo && campo.checked); }
    function menosCredito(valor) { return usandoCredito() ? Math.max(0, valor - saldoCredito) : valor; }
    function pecas() { return linhasValidas().reduce(function (soma, i) { return soma + i.qty; }, 0); }
    function total(pix) {
      return linhasValidas().reduce(function (soma, i) {
        return soma + i.qty * (pix ? precoPix(produtos[i.id]) : preco(produtos[i.id]));
      }, 0);
    }
    function atualizarTotais() {
      var escolhida = frete && frete.escolhida;
      var cartaoCheio = total(false) + valorFrete();
      var pixCheio = total(true) + valorFrete();
      var cartao = menosCredito(cartaoCheio);
      var pix = menosCredito(pixCheio);
      $('#linha-credito').hidden = !usandoCredito();
      $('#valor-credito').textContent = '− ' + dinheiro(Math.min(saldoCredito, cartaoCheio));
      $('#linha-frete').hidden = !escolhida;
      $('#valor-frete').textContent = valorFrete() ? dinheiro(valorFrete()) : 'Grátis';
      if ($('#campo-endereco')) $('#campo-endereco').hidden = !escolhida || escolhida.kind === 'retirada';
      $('#total').textContent = dinheiro(cartao);
      $('#total-pix').textContent = dinheiro(pix);
      $('#linha-pix').hidden = pix >= cartao;
      $('#rotulo-total').textContent = pix < cartao ? 'Total no cartão' : (escolhida ? 'Total' : 'Total das peças');
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
      if (frete && frete.pecas !== pecas()) calcularFrete(frete.cep);
      atualizarTotais();
    }
    function prazoFrete(opcao) { return opcao.days ? 'até ' + opcao.days + (opcao.days === 1 ? ' dia' : ' dias') : ''; }
    function desenharFrete() {
      $('#frete-resultado').innerHTML = '<fieldset class="opcoes opcoes-frete"><legend>Entrega para ' + esc(frete.cidade) + '</legend>' +
        frete.opcoes.map(function (o, n) {
          var detalhes = [esc(o.service), o.price_cents ? dinheiro(o.price_cents) : 'Grátis', prazoFrete(o)].filter(Boolean).join(' · ');
          return '<label><input type="radio" name="frete" value="' + n + '"' + (n === 0 ? ' checked' : '') + '><span>' + detalhes + '</span></label>';
        }).join('') + '</fieldset>';
    }
    function preencherEndereco(dados) {
      var form = $('#form-pedido');
      if (!form || form.dataset.cep === dados.cep) return;
      form.dataset.cep = dados.cep;
      var salvo = enderecoEscolhido && enderecoEscolhido.cep === dados.cep ? enderecoEscolhido : null;
      form.rua.value = salvo ? salvo.street : (dados.street || '');
      form.bairro.value = salvo ? salvo.district : (dados.district || '');
      form.numero.value = salvo ? salvo.number : '';
      form.complemento.value = salvo ? (salvo.complement || '') : '';
      $('#opcao-salvar-endereco').hidden = !!salvo;
      form.cidade.value = dados.city;
      form.estado.value = dados.state;
    }
    function textoEndereco(form) {
      return [form.rua.value, form.numero.value, form.complemento.value, form.bairro.value, form.cidade.value + ' - ' + form.estado.value]
        .map(function (parte) { return parte.trim(); }).filter(Boolean).join(', ');
    }
    function campoFaltando(form) {
      return [form.rua, form.numero, form.bairro].filter(function (campo) { return !campo.value.trim(); })[0];
    }
    function calcularFrete(cep) {
      var caixa = $('#frete-resultado');
      var consulta = ++consultaFrete;
      var quantidade = pecas();
      frete = null;
      caixa.innerHTML = '<p class="nota-pequena">Calculando o frete…</p>';
      atualizarTotais();
      function falhar(texto, contato) {
        caixa.innerHTML = '<p class="mensagem mensagem-erro">' + esc(texto) + '</p>' +
          (contato ? '<a class="botao botao-linha botao-largo" href="' + WHATSAPP + '">' + icone('i-whatsapp') + 'Falar com a loja</a>' : '');
      }
      fetch(URL_SUPABASE + '/functions/v1/frete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CHAVE_PUBLICA },
        body: JSON.stringify({ cep: cep, items: linhasValidas().map(function (i) { return { product_id: i.id, quantity: i.qty }; }) })
      }).then(function (r) { return r.json(); }).then(function (dados) {
        if (consulta !== consultaFrete) return;
        if (dados.error) { falhar(dados.error, dados.contato); return; }
        frete = { cep: dados.cep, cidade: dados.city + ' - ' + dados.state, opcoes: dados.options, escolhida: dados.options[0], pecas: quantidade };
        preencherEndereco(dados);
        try { localStorage.setItem('ellize:cep', dados.cep); } catch (e) {}
        desenharFrete();
        atualizarTotais();
      }).catch(function () {
        if (consulta === consultaFrete) falhar('Não foi possível calcular o frete. Verifique sua conexão e tente novamente.');
      });
    }
    function formatarCep(valor) {
      var numeros = valor.replace(/\D/g, '').slice(0, 8);
      return numeros.length > 5 ? numeros.slice(0, 5) + '-' + numeros.slice(5) : numeros;
    }
    function ligarFrete() {
      var form = $('#form-frete');
      form.cep.addEventListener('input', function () { form.cep.value = formatarCep(form.cep.value); });
      form.addEventListener('submit', function (evento) {
        evento.preventDefault();
        var cep = form.cep.value.replace(/\D/g, '');
        if (cep.length !== 8) {
          $('#frete-resultado').innerHTML = '<p class="mensagem mensagem-erro">Informe um CEP com 8 números.</p>';
          return;
        }
        calcularFrete(cep);
      });
      $('#frete-resultado').addEventListener('change', function (evento) {
        if (evento.target.name !== 'frete') return;
        frete.escolhida = frete.opcoes[+evento.target.value];
        atualizarTotais();
      });
      var salvo = '';
      try { salvo = localStorage.getItem('ellize:cep') || ''; } catch (e) {}
      if (salvo.length === 8) {
        form.cep.value = formatarCep(salvo);
        calcularFrete(salvo);
      }
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
        '<fieldset class="endereco" id="campo-endereco" hidden><legend>Endereço de entrega</legend>' +
        '<label class="campo">Rua<input name="rua" autocomplete="address-line1" maxlength="120"></label>' +
        '<div class="endereco-linha endereco-numero"><label class="campo">Número<input name="numero" inputmode="text" maxlength="10"></label>' +
        '<label class="campo">Complemento (opcional)<input name="complemento" autocomplete="address-line2" maxlength="60"></label></div>' +
        '<label class="campo">Bairro<input name="bairro" maxlength="60"></label>' +
        '<div class="endereco-linha endereco-cidade"><label class="campo">Cidade<input name="cidade" readonly tabindex="-1"></label>' +
        '<label class="campo">Estado<input name="estado" readonly tabindex="-1"></label></div>' +
        '<label class="credito-opcao" id="opcao-salvar-endereco"><input type="checkbox" id="salvar-endereco" checked> Salvar este endereço na minha conta</label></fieldset>' +
        '<label class="credito-opcao" id="opcao-credito" hidden><input type="checkbox" id="usar-credito"> <span id="texto-credito"></span></label>' +
        '<label class="campo">Observação (opcional)<textarea name="nota" rows="2" maxlength="500"></textarea></label>' +
        '<p class="mensagem mensagem-erro" id="erro-pedido" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Fechar pedido</button>' +
        '<p class="nota-pequena">Ao fechar, você escolhe a forma de pagamento na próxima tela.</p></form>';
      $('#form-pedido').addEventListener('submit', enviarPedido);
      $('#form-pedido').addEventListener('change', function (evento) {
        if (evento.target.id === 'usar-credito') atualizarTotais();
      });
      sb.from('orders').select('customer_name, phone').eq('user_id', sessao.user.id)
        .order('created_at', { ascending: false }).limit(1).then(function (r) {
          var ultimo = !r.error && r.data && r.data[0];
          var form = $('#form-pedido');
          if (!ultimo || !form) return;
          if (ultimo.customer_name && form.nome.value === form.nome.defaultValue) form.nome.value = ultimo.customer_name;
          if (!form.telefone.value && ultimo.phone) form.telefone.value = ultimo.phone;
        });
      sb.from('customer_addresses').select('*').order('is_default', { ascending: false }).order('created_at').then(function (r) {
        if (r.error || !r.data.length) return;
        enderecos = r.data;
        $('#enderecos-salvos').innerHTML = '<fieldset class="opcoes opcoes-frete enderecos-escolha"><legend>Entregar em</legend>' +
          enderecos.map(function (e, n) {
            return '<label><input type="radio" name="endereco-salvo" value="' + n + '"' + (n === 0 ? ' checked' : '') + '><span>' + esc(enderecoCurto(e)) + '</span></label>';
          }).join('') + '<label><input type="radio" name="endereco-salvo" value=""><span>Outro endereço</span></label></fieldset>';
        $('#enderecos-salvos').addEventListener('change', function (evento) {
          if (evento.target.name !== 'endereco-salvo') return;
          escolherEndereco(evento.target.value === '' ? null : enderecos[+evento.target.value]);
        });
        escolherEndereco(enderecos[0]);
      });
      sb.from('store_credits').select('amount_cents').then(function (r) {
        if (r.error) return;
        saldoCredito = r.data.reduce(function (soma, c) { return soma + c.amount_cents; }, 0);
        if (saldoCredito <= 0) { saldoCredito = 0; return; }
        $('#texto-credito').textContent = 'Usar crédito disponível: ' + dinheiro(saldoCredito);
        $('#opcao-credito').hidden = false;
        atualizarTotais();
      });
      atualizarTotais();
    }
    function escolherEndereco(e) {
      enderecoEscolhido = e;
      var form = $('#form-pedido');
      if (form) delete form.dataset.cep;
      if (!e) {
        $('#opcao-salvar-endereco').hidden = false;
        $('#form-frete').cep.focus();
        return;
      }
      $('#form-frete').cep.value = formatarCep(e.cep);
      calcularFrete(e.cep);
    }
    function salvarEnderecoNovo(form) {
      if (enderecoEscolhido || !$('#salvar-endereco').checked) return Promise.resolve();
      return sb.from('customer_addresses').insert({
        cep: frete.cep, street: form.rua.value.trim(), number: form.numero.value.trim(),
        complement: form.complemento.value.trim() || null, district: form.bairro.value.trim(),
        city: form.cidade.value, state: form.estado.value, is_default: !enderecos.length
      }).then(function () {}, function () {});
    }
    function enviarPedido(evento) {
      evento.preventDefault();
      var form = evento.target;
      var erro = $('#erro-pedido');
      var botao = form.querySelector('button[type="submit"]');
      var linhas = linhasValidas();
      erro.hidden = true;
      var entrega = frete && frete.escolhida;
      if (!entrega) {
        erro.textContent = 'Calcule o frete pelo CEP para fechar o pedido.';
        erro.hidden = false;
        $('#form-frete').cep.focus();
        return;
      }
      var faltando = entrega.kind === 'retirada' ? null : campoFaltando(form);
      if (faltando) {
        erro.textContent = 'Preencha rua, número e bairro para a entrega.';
        erro.hidden = false;
        faltando.focus();
        return;
      }
      ocupado(botao, true, 'Enviando pedido…');
      sb.rpc('create_order', {
        p_items: linhas.map(function (i) { return { product_id: i.id, color: i.color, size: i.size, quantity: i.qty }; }),
        p_name: form.nome.value,
        p_phone: form.telefone.value,
        p_payment: 'cartao',
        p_quote: entrega.id,
        p_use_credit: usandoCredito(),
        p_address: entrega.kind === 'retirada' ? null : textoEndereco(form),
        p_note: form.nota.value
      }).then(function (resposta) {
        if (resposta.error) {
          ocupado(botao, false);
          erro.textContent = traduzirErro(resposta.error);
          erro.hidden = false;
          return;
        }
        var pedido = resposta.data;
        var salvar = entrega.kind === 'retirada' ? Promise.resolve() : salvarEnderecoNovo(form);
        if (pedido.total_cents === 0) {
          carrinho.salvar([]);
          alvo.innerHTML = '<div class="estado estado-sucesso"><span class="etiqueta">Pedido #' + esc(pedido.number) + '</span>' +
            '<h2>Pedido recebido</h2><p>Seu crédito cobriu o valor total. A loja vai confirmar o pedido.</p>' +
            '<a class="botao botao-vinho" href="conta.html">Ver minhas compras</a></div>';
          window.scrollTo(0, 0);
          return;
        }
        carrinho.salvar([]);
        salvar.then(function () { location.href = 'pagamento.html?pedido=' + encodeURIComponent(pedido.id); });
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
        '<div id="enderecos-salvos"></div>' +
        '<form id="form-frete" novalidate><label class="campo">Calcule o frete pelo CEP<span class="frete-linha">' +
        '<input name="cep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000">' +
        '<button class="botao botao-linha" type="submit">Calcular</button></span></label></form>' +
        '<div id="frete-resultado" aria-live="polite"></div>' +
        '<p class="resumo-total" id="linha-frete" hidden><span>Frete</span><strong id="valor-frete"></strong></p>' +
        '<p class="resumo-total" id="linha-credito" hidden><span>Crédito da loja</span><strong id="valor-credito"></strong></p>' +
        '<p class="resumo-total"><span id="rotulo-total">Total das peças</span><strong id="total"></strong></p>' +
        '<p class="resumo-total" id="linha-pix" hidden><span>Total no Pix</span><strong id="total-pix"></strong></p>' +
        '<div id="fechamento"></div></aside>';
      desenharLinhas();
      desenharFechamento(r[1].data.session);
      ligarFrete();
      $('#form-frete').addEventListener('submit', function () {
        var cep = $('#form-frete').cep.value.replace(/\D/g, '');
        if (!enderecoEscolhido || enderecoEscolhido.cep === cep) return;
        enderecoEscolhido = null;
        var outro = document.querySelector('[name="endereco-salvo"][value=""]');
        if (outro) outro.checked = true;
        $('#opcao-salvar-endereco').hidden = false;
      });
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
        (cadastro ? '<label class="campo">Nome completo<input name="nome" autocomplete="name" required minlength="2" maxlength="120"></label>' : '') +
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
        if (cadastro) form.nome.value = form.nome.value.trim();
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
        '<div class="conta-abas" role="tablist" aria-label="Minha conta">' +
        '<button type="button" role="tab" id="tab-compras" aria-controls="aba-compras" data-aba-conta="compras">Minhas compras</button>' +
        '<button type="button" role="tab" id="tab-enderecos" aria-controls="aba-enderecos" data-aba-conta="enderecos">Meus endereços</button></div>' +
        '<section id="aba-compras" role="tabpanel" aria-labelledby="tab-compras"><div id="saldo-credito"></div><div id="pedidos" aria-busy="true"><p>Carregando compras…</p></div></section>' +
        '<section id="aba-enderecos" role="tabpanel" aria-labelledby="tab-enderecos"><div id="enderecos"><p>Carregando endereços…</p></div></section></div>';
      mostrarAbaConta(location.hash === '#enderecos' ? 'enderecos' : 'compras');
      carregarEnderecos();
      $('#sair').addEventListener('click', function () {
        sb.auth.signOut().then(function () { desenharAcesso('entrar'); });
      });
      sb.from('store_credits').select('amount_cents,reason,created_at').order('created_at', { ascending: false }).then(function (r) {
        var caixa = $('#saldo-credito');
        if (r.error || !r.data.length || !caixa) return;
        var saldo = r.data.reduce(function (soma, c) { return soma + c.amount_cents; }, 0);
        caixa.innerHTML = '<div class="saldo-credito"><p>' + (saldo > 0
          ? 'Você tem <strong>' + dinheiro(saldo) + '</strong> de crédito na loja. Use ao fechar o próximo pedido.'
          : 'Seu crédito na loja está em <strong>' + dinheiro(0) + '</strong>.') + '</p>' +
          '<details><summary>Ver histórico do crédito</summary><ul class="credito-historico">' + r.data.map(function (c) {
            return '<li><span>' + dataCurta(c.created_at) + ' · ' + esc(c.reason) + '</span><strong>' + (c.amount_cents < 0 ? '− ' : '+ ') + dinheiro(Math.abs(c.amount_cents)) + '</strong></li>';
          }).join('') + '</ul></details></div>';
      });
      sb.from('orders').select('id,number,total_cents,credit_cents,status,delivery,shipping_service,payment_choice,payment_issue,stock_deducted,tracking_code,delivered_at,created_at,order_items(product_id,product_name,color,size,quantity),order_requests(kind,status,admin_note,credit_cents,created_at)')
        .order('created_at', { ascending: false }).then(function (r) {
          var caixa = $('#pedidos');
          if (!caixa) return;
          caixa.setAttribute('aria-busy', 'false');
          if (r.error) { caixa.innerHTML = '<p class="mensagem mensagem-erro">Não foi possível carregar suas compras.</p>'; return; }
          if (!r.data.length) {
            caixa.innerHTML = estado('Nenhuma compra ainda', 'Suas compras aparecem aqui.', '<a class="botao botao-vinho" href="loja.html">Ver novidades</a>');
            return;
          }
          var comprasPorId = {};
          var AVISOS = {
            aprovado: 'Pagamento aprovado. Seu pedido aparece como pago em instantes.',
            pendente: 'Pagamento em análise. Avisaremos quando for confirmado.',
            recusado: 'O pagamento não foi concluído. Você pode tentar de novo no pedido.'
          };
          var aviso = AVISOS[parametros.get('pagamento')];
          caixa.innerHTML = (aviso ? '<p class="mensagem">' + aviso + '</p>' : '') + '<ul class="pedidos">' + r.data.map(function (o) {
            comprasPorId[o.id] = o;
            return '<li class="pedido"><div class="pedido-topo"><strong>Pedido #' + esc(o.number) + '</strong>' +
              '<span class="pedido-status">' + esc(STATUS[o.status] || o.status) + '</span></div>' +
              '<p>' + new Date(o.created_at).toLocaleDateString('pt-BR') + ' · ' + dinheiro(o.total_cents) + (o.status === 'novo' && !o.stock_deducted ? '' : ' · ' + (FORMAS[o.payment_choice] || 'Cartão')) + ' · ' + (o.delivery === 'retirada' ? 'Retirar na loja' : esc(o.shipping_service || 'Receber em casa')) + '</p>' +
              '<ul>' + o.order_items.map(function (i) {
                return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + (i.color !== 'Única' ? esc(i.color) + ', ' : '') + esc(i.size) + ')</li>';
              }).join('') + '</ul>' +
              rastreioHTML(o) + solicitacaoHTML(o) + '<div class="pedido-botoes">' +
              (o.status === 'novo' && !o.stock_deducted && !o.payment_issue && o.total_cents > 0 ? '<a class="botao botao-vinho" href="pagamento.html?pedido=' + encodeURIComponent(o.id) + '">Pagar agora</a>' : '') +
              (o.status === 'entregue' || o.status === 'cancelado' ? '<button class="botao botao-vinho" type="button" data-recomprar="' + esc(o.id) + '">Comprar novamente</button>' : '') +
              (podeSolicitar(o) ? '<button class="botao botao-linha" type="button" data-solicitar="' + esc(o.id) + '">Pedir troca ou devolução</button>' : '') +
              '</div></li>';
          }).join('') + '</ul>';
          caixa.addEventListener('submit', function (evento) {
            if (!evento.target.matches('[data-form-solicitar]')) return;
            evento.preventDefault();
            enviarSolicitacao(evento.target);
          });
          caixa.addEventListener('click', function (evento) {
            var recomprar = evento.target.closest('[data-recomprar]');
            if (recomprar) { comprarNovamente(comprasPorId[recomprar.dataset.recomprar], recomprar); return; }
            var solicitar = evento.target.closest('[data-solicitar]');
            if (solicitar) { abrirSolicitacao(comprasPorId[solicitar.dataset.solicitar], solicitar); return; }
          });
        });
    }

    function mostrarAbaConta(aba) {
      ['compras', 'enderecos'].forEach(function (nome) {
        var ativa = nome === aba;
        $('#tab-' + nome).setAttribute('aria-selected', String(ativa));
        $('#tab-' + nome).tabIndex = ativa ? 0 : -1;
        $('#aba-' + nome).hidden = !ativa;
      });
      try { history.replaceState(null, '', location.pathname + location.search + (aba === 'enderecos' ? '#enderecos' : '')); } catch (e) {}
    }
    var meusEnderecos = [];
    function carregarEnderecos() {
      sb.from('customer_addresses').select('*').order('is_default', { ascending: false }).order('created_at').then(function (r) {
        var caixa = $('#enderecos');
        if (!caixa) return;
        if (r.error) { caixa.innerHTML = '<p class="mensagem mensagem-erro">Não foi possível carregar seus endereços.</p>'; return; }
        meusEnderecos = r.data;
        desenharEnderecos();
      });
    }
    function desenharEnderecos() {
      var caixa = $('#enderecos');
      caixa.innerHTML = (meusEnderecos.length ? '<ul class="enderecos-lista">' + meusEnderecos.map(function (e) {
        return '<li class="endereco-card' + (e.is_default ? ' padrao' : '') + '"><div><strong>' + esc(e.street) + ', ' + esc(e.number) + (e.complement ? ', ' + esc(e.complement) : '') + '</strong>' +
          '<span>' + esc(e.district) + ', ' + esc(e.city) + ' - ' + esc(e.state) + ' · CEP ' + cepComTraco(e.cep) + '</span></div>' +
          '<div class="endereco-acoes">' + (e.is_default ? '<span class="selo-padrao">Padrão</span>' : '<button class="botao-texto" type="button" data-padrao="' + esc(e.id) + '">Definir como padrão</button>') +
          '<button class="botao-texto" type="button" data-editar-endereco="' + esc(e.id) + '">Editar</button>' +
          '<button class="botao-texto botao-perigo" type="button" data-excluir-endereco="' + esc(e.id) + '">Excluir</button></div></li>';
      }).join('') + '</ul>' : '<p class="nota-pequena">Nenhum endereço salvo. Salve um para fechar os próximos pedidos mais rápido.</p>') +
        '<button class="botao botao-linha" type="button" data-novo-endereco>Adicionar endereço</button><div id="form-endereco-caixa"></div>';
    }
    function abrirFormEndereco(e) {
      var caixa = $('#form-endereco-caixa');
      caixa.innerHTML = '<form class="formulario endereco-form" id="form-endereco" novalidate>' +
        '<h3>' + (e ? 'Editar endereço' : 'Novo endereço') + '</h3>' +
        '<label class="campo">CEP<input name="cep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="' + (e ? cepComTraco(e.cep) : '') + '"></label>' +
        '<label class="campo">Rua<input name="rua" autocomplete="address-line1" maxlength="120" value="' + (e ? esc(e.street) : '') + '"></label>' +
        '<div class="endereco-linha endereco-numero"><label class="campo">Número<input name="numero" maxlength="10" value="' + (e ? esc(e.number) : '') + '"></label>' +
        '<label class="campo">Complemento (opcional)<input name="complemento" autocomplete="address-line2" maxlength="60" value="' + (e && e.complement ? esc(e.complement) : '') + '"></label></div>' +
        '<label class="campo">Bairro<input name="bairro" maxlength="60" value="' + (e ? esc(e.district) : '') + '"></label>' +
        '<div class="endereco-linha endereco-cidade"><label class="campo">Cidade<input name="cidade" readonly tabindex="-1" value="' + (e ? esc(e.city) : '') + '"></label>' +
        '<label class="campo">Estado<input name="estado" readonly tabindex="-1" value="' + (e ? esc(e.state) : '') + '"></label></div>' +
        (e && e.is_default ? '' : '<label class="credito-opcao"><input type="checkbox" name="padrao"' + (meusEnderecos.length ? '' : ' checked') + '> Usar como endereço padrão</label>') +
        '<p class="mensagem mensagem-erro" role="alert" hidden></p>' +
        '<div class="pedido-botoes"><button class="botao botao-vinho" type="submit">Salvar endereço</button>' +
        '<button class="botao-texto" type="button" data-cancelar-endereco>Cancelar</button></div></form>';
      var form = $('#form-endereco');
      form.dataset.id = e ? e.id : '';
      form.cep.addEventListener('input', function () {
        form.cep.value = cepComTraco(form.cep.value);
        var cep = form.cep.value.replace(/\D/g, '');
        if (cep.length !== 8) return;
        buscarCep(cep).then(function (dados) {
          var erro = form.querySelector('.mensagem-erro');
          if (dados.erro) { erro.textContent = 'CEP não encontrado. Confira os números.'; erro.hidden = false; return; }
          erro.hidden = true;
          form.rua.value = dados.logradouro || form.rua.value;
          form.bairro.value = dados.bairro || form.bairro.value;
          form.cidade.value = dados.localidade;
          form.estado.value = dados.uf;
          (form.rua.value ? form.numero : form.rua).focus();
        }, function () {});
      });
      form.addEventListener('submit', salvarEndereco);
      form.cep.focus();
    }
    function salvarEndereco(evento) {
      evento.preventDefault();
      var form = evento.target;
      var erro = form.querySelector('.mensagem-erro');
      var botao = form.querySelector('button[type="submit"]');
      var dados = {
        cep: form.cep.value.replace(/\D/g, ''), street: form.rua.value.trim(), number: form.numero.value.trim(),
        complement: form.complemento.value.trim() || null, district: form.bairro.value.trim(), city: form.cidade.value, state: form.estado.value
      };
      erro.hidden = true;
      if (dados.cep.length !== 8 || !dados.city) { erro.textContent = 'Informe um CEP válido.'; erro.hidden = false; return; }
      if (!dados.street || !dados.number || !dados.district) { erro.textContent = 'Preencha rua, número e bairro.'; erro.hidden = false; return; }
      ocupado(botao, true, 'Salvando…');
      var pedido = form.dataset.id
        ? sb.from('customer_addresses').update(dados).eq('id', form.dataset.id).select()
        : sb.from('customer_addresses').insert(dados).select();
      pedido.then(function (r) {
        if (r.error || !r.data.length) throw r.error || new Error('endereço');
        var padrao = form.padrao && form.padrao.checked;
        return padrao ? sb.rpc('set_default_address', { p_id: r.data[0].id }) : null;
      }).then(function () { carregarEnderecos(); }, function (falha) {
        ocupado(botao, false);
        erro.textContent = falha && falha.code === 'P0001' ? falha.message : 'Não foi possível salvar o endereço.';
        erro.hidden = false;
      });
    }
    function cuidarEnderecos(evento) {
      var alvoClique = evento.target;
      if (alvoClique.closest('[data-novo-endereco]')) { abrirFormEndereco(null); return; }
      if (alvoClique.closest('[data-cancelar-endereco]')) { $('#form-endereco-caixa').innerHTML = ''; return; }
      var editar = alvoClique.closest('[data-editar-endereco]');
      if (editar) { abrirFormEndereco(meusEnderecos.filter(function (e) { return e.id === editar.dataset.editarEndereco; })[0]); return; }
      var padrao = alvoClique.closest('[data-padrao]');
      if (padrao) {
        padrao.disabled = true;
        sb.rpc('set_default_address', { p_id: padrao.dataset.padrao }).then(carregarEnderecos);
        return;
      }
      var excluir = alvoClique.closest('[data-excluir-endereco]');
      if (excluir && window.confirm('Excluir este endereço?')) {
        var era = meusEnderecos.filter(function (e) { return e.id === excluir.dataset.excluirEndereco; })[0];
        sb.from('customer_addresses').delete().eq('id', era.id).then(function () {
          var resto = meusEnderecos.filter(function (e) { return e.id !== era.id; });
          return era.is_default && resto.length ? sb.rpc('set_default_address', { p_id: resto[0].id }) : null;
        }).then(carregarEnderecos);
      }
    }
    alvo.addEventListener('click', function (evento) {
      var aba = evento.target.closest('[data-aba-conta]');
      if (aba) { mostrarAbaConta(aba.dataset.abaConta); return; }
      if (evento.target.closest('#enderecos')) cuidarEnderecos(evento);
    });
    alvo.addEventListener('keydown', function (evento) {
      var aba = evento.target.closest('[data-aba-conta]');
      if (!aba || (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft')) return;
      var outra = aba.dataset.abaConta === 'compras' ? 'enderecos' : 'compras';
      mostrarAbaConta(outra);
      $('#tab-' + outra).focus();
    });

    function dataCurta(valor) { return new Date(valor).toLocaleDateString('pt-BR'); }
    function fimDoPrazo(o) { return new Date(new Date(o.delivered_at).getTime() + 7 * 24 * 60 * 60 * 1000); }
    function jaSolicitou(o) {
      return (o.order_requests || []).some(function (s) { return s.status !== 'recusado'; });
    }
    function podeSolicitar(o) {
      return o.status === 'entregue' && o.delivered_at && new Date() <= fimDoPrazo(o) && !jaSolicitou(o);
    }
    function rastreioHTML(o) {
      if (o.status === 'entregue') return o.delivered_at ? '<p class="pedido-entregue">Entregue em ' + dataCurta(o.delivered_at) + '</p>' : '';
      if (o.status === 'cancelado') return '';
      var retirada = o.delivery === 'retirada';
      var etapas = ['Pedido recebido', 'Pagamento confirmado', retirada ? 'Pronto para retirar' : 'A caminho', retirada ? 'Retirado' : 'Entregue'];
      var atual = { novo: 0, confirmado: 0, pago: 1, enviado: 2 }[o.status] || 0;
      return '<ol class="rastreio" aria-label="Andamento do pedido">' + etapas.map(function (etapa, n) {
        return '<li class="' + (n < atual ? 'feita' : n === atual ? 'atual' : '') + '"' + (n === atual ? ' aria-current="step"' : '') + '>' + etapa + '</li>';
      }).join('') + '</ol>' +
        (o.tracking_code ? '<p class="rastreio-codigo">Código de rastreio: <strong>' + esc(o.tracking_code) + '</strong> ' +
          '<a href="https://rastreamento.correios.com.br/app/index.php" target="_blank" rel="noopener">Rastrear nos Correios</a></p>' : '');
    }
    function solicitacaoHTML(o) {
      var NOMES = { aberto: 'Em análise', aprovado: 'Aprovada', recusado: 'Recusada', concluido: 'Concluída' };
      var lista = (o.order_requests || []).slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      if (!lista.length) {
        return podeSolicitar(o) ? '<p class="nota-pequena">Troca ou devolução até ' + dataCurta(fimDoPrazo(o)) + '. <a href="politicas.html">Ver a política</a>.</p>' : '';
      }
      var s = lista[0];
      return '<p class="pedido-solicitacao">' + (s.kind === 'troca' ? 'Troca' : 'Devolução') + ': ' + (NOMES[s.status] || esc(s.status)) +
        (s.credit_cents ? ' · crédito de ' + dinheiro(s.credit_cents) : '') + (s.admin_note ? '. ' + esc(s.admin_note) : '') + '</p>';
    }
    function comprarNovamente(o, botao) {
      var itens = o.order_items.filter(function (i) { return i.product_id; });
      ocupado(botao, true, 'Adicionando…');
      sb.from('products').select('*').in('id', itens.map(function (i) { return i.product_id; })).then(function (r) {
        var mapa = {};
        (r.data || []).forEach(function (p) { mapa[p.id] = p; });
        var adicionados = 0;
        itens.forEach(function (i) {
          var p = mapa[i.product_id];
          var disponivel = p ? estoque(p, i.color, i.size) : 0;
          if (disponivel < 1) return;
          carrinho.adicionar(p.id, i.color, i.size, Math.min(i.quantity, disponivel), disponivel);
          adicionados++;
        });
        if (adicionados) { location.href = 'carrinho.html'; return; }
        ocupado(botao, false);
        window.alert('Essas peças não estão mais disponíveis.');
      });
    }
    function abrirSolicitacao(o, botao) {
      var li = botao.closest('.pedido');
      if (li.querySelector('[data-form-solicitar]')) return;
      li.insertAdjacentHTML('beforeend', '<form class="formulario solicitacao" data-form-solicitar="' + esc(o.id) + '" novalidate>' +
        '<fieldset class="opcoes"><legend>O que você quer fazer?</legend>' +
        '<label><input type="radio" name="tipo" value="troca" checked><span>Trocar</span></label>' +
        '<label><input type="radio" name="tipo" value="devolucao"><span>Devolver e receber o reembolso</span></label></fieldset>' +
        '<fieldset class="solicitacao-pecas"><legend>Quais peças?</legend>' + o.order_items.map(function (i) {
          var nome = i.quantity + 'x ' + i.product_name + ' (' + (i.color !== 'Única' ? i.color + ', ' : '') + i.size + ')';
          return '<label><input type="checkbox" name="peca" value="' + esc(nome) + '"> ' + esc(nome) + '</label>';
        }).join('') + '</fieldset>' +
        '<label class="campo">Conte o motivo<textarea name="motivo" rows="3" maxlength="1000"></textarea></label>' +
        '<p class="mensagem mensagem-erro" role="alert" hidden></p>' +
        '<button class="botao botao-vinho" type="submit">Enviar solicitação</button>' +
        '<p class="nota-pequena">Na troca, o valor da peça vira crédito depois que ela chega à loja. <a href="politicas.html">Ver a política</a>.</p></form>');
      li.querySelector('[data-form-solicitar] input').focus();
    }
    function enviarSolicitacao(form) {
      var erro = form.querySelector('.mensagem-erro');
      var botao = form.querySelector('button[type="submit"]');
      var pecas = [].map.call(form.querySelectorAll('[name="peca"]:checked'), function (c) { return c.value; });
      erro.hidden = true;
      if (!pecas.length || !form.motivo.value.trim()) {
        erro.textContent = 'Escolha as peças e conte o motivo.';
        erro.hidden = false;
        return;
      }
      ocupado(botao, true, 'Enviando…');
      sb.rpc('create_return_request', {
        p_order: form.dataset.formSolicitar, p_kind: form.tipo.value, p_items: pecas.join('; '), p_reason: form.motivo.value
      }).then(function (r) {
        if (r.error) {
          ocupado(botao, false);
          erro.textContent = traduzirErro(r.error);
          erro.hidden = false;
          return;
        }
        location.href = 'conta.html';
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

  /* Tela de pagamento: o valor segue a forma escolhida */
  function iniciarPagamento() {
    var alvo = $('#pagamento');
    var id = parametros.get('pedido');
    var configuracao = pagamento({ check: true });
    var emailCliente = '';
    var controleBrick = null;
    var esperaPix = null;
    var METODOS = {
      pix: { bankTransfer: 'all' },
      cartao: { creditCard: 'all', debitCard: 'all' },
      boleto: { ticket: 'all' }
    };
    var RECUSAS = {
      cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente.',
      cc_rejected_bad_filled_security_code: 'O código de segurança está incorreto.',
      cc_rejected_bad_filled_date: 'A data de validade está incorreta.',
      cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
      cc_rejected_call_for_authorize: 'O banco pediu autorização. Fale com o banco do cartão e tente de novo.',
      cc_rejected_duplicated_payment: 'Este pagamento já foi feito.'
    };
    var DESCRICOES = {
      pix: 'Aprovação na hora, com o valor do Pix.',
      cartao: 'Crédito ou débito, em parcelas conforme o Mercado Pago.',
      boleto: 'Com o valor do Pix. Pode levar alguns dias para compensar.'
    };
    sb.auth.getSession().then(function (r) {
      if (r.data.session) emailCliente = r.data.session.user.email || '';
      if (!r.data.session) {
        alvo.innerHTML = estado('Entre na sua conta', 'Para pagar, entre na conta usada no pedido.', '<a class="botao botao-vinho" href="conta.html">Entrar</a>');
        return;
      }
      if (!id) { alvo.innerHTML = estado('Pedido não encontrado', 'Abra o pedido em Minhas compras.', '<a class="botao botao-vinho" href="conta.html">Minhas compras</a>'); return; }
      sb.from('orders').select('*,order_items(*)').eq('id', id).maybeSingle().then(function (resposta) {
        if (resposta.error) { alvo.innerHTML = erroCarregar(); return; }
        var o = resposta.data;
        if (!o) { alvo.innerHTML = estado('Pedido não encontrado', 'Abra o pedido em Minhas compras.', '<a class="botao botao-vinho" href="conta.html">Minhas compras</a>'); return; }
        if (o.status !== 'novo' || o.stock_deducted) {
          alvo.innerHTML = estado('Pedido #' + o.number + ' já está em andamento', 'Acompanhe pelo Minhas compras.', '<a class="botao botao-vinho" href="conta.html">Minhas compras</a>');
          return;
        }
        desenhar(o);
      }, function () { alvo.innerHTML = erroCarregar(); });
    });
    function valor(o, forma) {
      var bruto = o.shipping_cents + o.order_items.reduce(function (soma, i) {
        return soma + i.quantity * (forma === 'cartao' ? i.card_price_cents : i.pix_price_cents);
      }, 0);
      return Math.max(0, bruto - o.credit_cents);
    }
    function desenhar(o) {
      alvo.innerHTML = '<div class="pagamento-grade"><form class="formulario" id="form-pagamento" novalidate>' +
        '<fieldset class="formas"><legend>Como você quer pagar o pedido #' + esc(o.number) + '?</legend>' +
        ['pix', 'cartao', 'boleto'].map(function (forma) {
          return '<label class="forma"><input type="radio" name="forma" value="' + forma + '">' +
            '<span class="forma-nome">' + (forma === 'cartao' ? 'Cartão de crédito ou débito' : FORMAS[forma]) + '<small>' + DESCRICOES[forma] + '</small></span>' +
            '<strong class="forma-valor">' + dinheiro(valor(o, forma)) + '</strong></label>';
        }).join('') + '</fieldset>' +
        '<p class="mensagem mensagem-erro" id="erro-pagamento" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit" disabled>Escolha a forma de pagamento</button>' +
        '<p class="nota-pequena">O pagamento é feito no ambiente seguro do Mercado Pago.</p></form>' +
        '<aside class="resumo"><h2>Resumo</h2><ul class="resumo-itens">' + o.order_items.map(function (i) {
          return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + (i.color !== 'Única' ? esc(i.color) + ', ' : '') + esc(i.size) + ')</li>';
        }).join('') + '</ul>' +
        '<p class="resumo-total"><span>' + esc(o.shipping_service || 'Entrega') + '</span><strong>' + (o.shipping_cents ? dinheiro(o.shipping_cents) : 'Grátis') + '</strong></p>' +
        (o.credit_cents ? '<p class="resumo-total"><span>Crédito da loja</span><strong>− ' + dinheiro(o.credit_cents) + '</strong></p>' : '') +
        '<p class="resumo-total"><span>Total</span><strong id="total-pagamento">Escolha a forma</strong></p></aside></div>';
      var form = $('#form-pagamento');
      var botao = form.querySelector('button[type="submit"]');
      form.addEventListener('change', function () {
        var forma = form.forma.value;
        $('#total-pagamento').textContent = dinheiro(valor(o, forma));
        botao.disabled = false;
        botao.textContent = 'Pagar ' + dinheiro(valor(o, forma)) + ' com ' + { pix: 'Pix', cartao: 'cartão', boleto: 'boleto' }[forma];
      });
      form.addEventListener('submit', function (evento) {
        evento.preventDefault();
        var forma = form.forma.value;
        var erro = $('#erro-pagamento');
        if (!forma) return;
        erro.hidden = true;
        var texto = botao.textContent;
        ocupado(botao, true, 'Abrindo o pagamento…');
        sb.rpc('set_order_payment', { p_order: o.id, p_choice: forma }).then(function (r) {
          if (r.error) throw r.error;
          return configuracao.then(function (cfg) {
            if (cfg.publicKey) {
              ocupado(botao, false);
              botao.textContent = texto;
              abrirBrick(o, forma, r.data.total_cents, cfg.publicKey);
              return;
            }
            return pagamento({ order_id: o.id }).then(function (cobranca) {
            if (cobranca.url) { location.href = cobranca.url; return; }
            if (cobranca.disponivel) throw new Error(cobranca.error || 'Não foi possível abrir o pagamento. Tente novamente.');
            whatsapp(o, forma, r.data.total_cents);
            });
          });
        }).catch(function (falha) {
          ocupado(botao, false);
          botao.textContent = texto;
          erro.textContent = falha.code ? traduzirErro(falha) : falha.message;
          erro.hidden = false;
        });
      });
    }
    function carregarSdk() {
      if (window.MercadoPago) return Promise.resolve();
      return new Promise(function (resolver, rejeitar) {
        var script = document.createElement('script');
        script.src = 'https://sdk.mercadopago.com/js/v2';
        script.onload = resolver;
        script.onerror = rejeitar;
        document.head.appendChild(script);
      });
    }
    function fecharBrick() {
      if (controleBrick) { try { controleBrick.unmount(); } catch (e) {} controleBrick = null; }
    }
    function abrirBrick(o, forma, total, chave) {
      var form = $('#form-pagamento');
      form.hidden = true;
      var area = $('#area-brick');
      if (!area) {
        form.insertAdjacentHTML('afterend', '<div class="area-brick" id="area-brick"></div>');
        area = $('#area-brick');
      }
      area.hidden = false;
      area.innerHTML = '<p class="area-brick-titulo">Pagar <strong>' + dinheiro(total) + '</strong> com ' + (forma === 'cartao' ? 'cartão' : FORMAS[forma]) + '</p>' +
        '<div id="paymentBrick_container"><p class="nota-pequena">Carregando o pagamento…</p></div>' +
        '<p class="mensagem mensagem-erro" id="erro-brick" role="alert" hidden></p>' +
        '<button class="botao-texto" type="button" data-trocar-forma>Trocar forma de pagamento</button>';
      area.querySelector('[data-trocar-forma]').addEventListener('click', function () {
        fecharBrick();
        area.hidden = true;
        form.hidden = false;
      });
      carregarSdk().then(function () {
        var mp = new window.MercadoPago(chave, { locale: 'pt-BR' });
        $('#paymentBrick_container').innerHTML = '';
        return mp.bricks().create('payment', 'paymentBrick_container', {
          initialization: { amount: total / 100, payer: { email: emailCliente } },
          customization: { paymentMethods: METODOS[forma] },
          callbacks: {
            onReady: function () {},
            onError: function (erro) { console.error(erro); },
            onSubmit: function (dados) { return enviarPagamento(o, dados); }
          }
        });
      }).then(function (controle) { controleBrick = controle; }, function () {
        $('#paymentBrick_container').innerHTML = '';
        erroBrick('Não foi possível carregar o pagamento. Verifique sua conexão e recarregue a página.');
      });
    }
    function erroBrick(texto) {
      var erro = $('#erro-brick');
      if (!erro) return;
      erro.textContent = texto;
      erro.hidden = false;
    }
    function enviarPagamento(o, dados) {
      $('#erro-brick').hidden = true;
      return pagamento({
        order_id: o.id,
        selectedPaymentMethod: dados.selectedPaymentMethod || dados.paymentMethod,
        formData: dados.formData
      }, 'pagar').then(function (res) {
        if (res.error) { erroBrick(res.error); throw new Error(res.error); }
        if (res.status === 'rejected') {
          var motivo = RECUSAS[res.status_detail] || 'O pagamento foi recusado. Tente outro cartão ou outra forma de pagamento.';
          erroBrick(motivo);
          throw new Error(motivo);
        }
        fecharBrick();
        mostrarResultado(o, res);
      });
    }
    function mostrarResultado(o, res) {
      var etiqueta = '<span class="etiqueta">Pedido #' + esc(o.number) + '</span>';
      var compras = '<a class="botao botao-linha" href="conta.html">Ver minhas compras</a>';
      window.scrollTo(0, 0);
      if (res.status === 'approved') {
        alvo.innerHTML = '<div class="estado estado-sucesso">' + etiqueta + '<h2>Pagamento aprovado</h2>' +
          '<p>Recebemos o seu pagamento. Você acompanha o pedido em Minhas compras.</p>' + compras + '</div>';
        return;
      }
      if (res.qr_code) {
        alvo.innerHTML = '<div class="estado pix">' + etiqueta + '<h2>Pague com Pix</h2>' +
          '<p>Abra o app do seu banco e escaneie o QR Code ou use o código copia e cola.</p>' +
          (res.qr_code_base64 ? '<img class="pix-qr" src="data:image/png;base64,' + esc(res.qr_code_base64) + '" alt="QR Code do Pix" width="220" height="220">' : '') +
          '<div class="pix-codigo"><input id="pix-codigo" readonly value="' + esc(res.qr_code) + '" aria-label="Código Pix copia e cola">' +
          '<button class="botao botao-vinho" type="button" id="copiar-pix">Copiar código</button></div>' +
          '<p class="nota-pequena" id="pix-status" aria-live="polite">Aguardando o pagamento. Esta página atualiza sozinha.</p>' + compras + '</div>';
        $('#copiar-pix').addEventListener('click', function () {
          var campo = $('#pix-codigo');
          campo.select();
          (navigator.clipboard ? navigator.clipboard.writeText(campo.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
          this.textContent = 'Código copiado';
        });
        esperarPix(o, res.id);
        return;
      }
      if (res.boleto_url) {
        alvo.innerHTML = '<div class="estado estado-sucesso pix">' + etiqueta + '<h2>Boleto gerado</h2>' +
          '<p>Pague o boleto até o vencimento. A confirmação pode levar algumas horas depois do pagamento.</p>' +
          (res.linha_digitavel ? '<div class="pix-codigo"><input id="linha-boleto" readonly value="' + esc(res.linha_digitavel) + '" aria-label="Linha digitável do boleto">' +
          '<button class="botao botao-linha" type="button" id="copiar-boleto">Copiar linha</button></div>' : '') +
          '<a class="botao botao-vinho" href="' + esc(res.boleto_url) + '" target="_blank" rel="noopener">Abrir boleto</a>' + compras + '</div>';
        if ($('#copiar-boleto')) $('#copiar-boleto').addEventListener('click', function () {
          var campo = $('#linha-boleto');
          campo.select();
          (navigator.clipboard ? navigator.clipboard.writeText(campo.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
          this.textContent = 'Linha copiada';
        });
        return;
      }
      alvo.innerHTML = '<div class="estado">' + etiqueta + '<h2>Pagamento em análise</h2>' +
        '<p>O Mercado Pago está analisando o pagamento. Avisaremos em Minhas compras assim que for confirmado.</p>' + compras + '</div>';
    }
    function esperarPix(o, idPagamento) {
      var tentativas = 0;
      clearInterval(esperaPix);
      esperaPix = setInterval(function () {
        tentativas++;
        if (tentativas > 300 || !$('#pix-status')) { clearInterval(esperaPix); return; }
        pagamento({ order_id: o.id, payment_id: idPagamento, consultar: true }, 'pagar').then(function (res) {
          if (res.status === 'approved') { clearInterval(esperaPix); mostrarResultado(o, res); }
          if (res.status === 'cancelled' || res.status === 'rejected') {
            clearInterval(esperaPix);
            $('#pix-status').textContent = 'Este Pix expirou. Volte a Minhas compras para gerar outro.';
          }
        });
      }, 6000);
    }
    function whatsapp(o, forma, total) {
      var mensagem = 'Olá! Fiz o pedido #' + o.number + ' no site da Ellize Collection.\n\n' +
        o.order_items.map(function (i) { return i.quantity + 'x ' + i.product_name + ' (' + (i.color !== 'Única' ? i.color + ', ' : '') + i.size + ')'; }).join('\n') +
        (o.credit_cents ? '\n\nCrédito usado: ' + dinheiro(o.credit_cents) : '') + '\n\nTotal: ' + dinheiro(total) + '\nPagamento: ' + FORMAS[forma] +
        '\nEntrega: ' + (o.shipping_service || 'Retirar na loja') +
        (o.delivery === 'retirada' ? '' : '\nFrete: ' + dinheiro(o.shipping_cents) + '\nEndereço: ' + o.address + ', CEP ' + cepComTraco(o.cep));
      var link = WHATSAPP + '?text=' + encodeURIComponent(mensagem);
      alvo.innerHTML = '<div class="estado estado-sucesso"><span class="etiqueta">Pedido #' + esc(o.number) + '</span>' +
        '<h2>Falta só o pagamento</h2><p>Total de ' + dinheiro(total) + ' no ' + FORMAS[forma] + '. Abrindo o WhatsApp para você combinar o pagamento com a loja. Se não abrir, use o botão abaixo.</p>' +
        '<a class="botao botao-vinho" href="' + link + '">' + icone('i-whatsapp') + 'Enviar no WhatsApp</a>' +
        '<a class="botao botao-linha" href="conta.html">Ver minhas compras</a></div>';
      window.scrollTo(0, 0);
      location.href = link;
    }
  }

  var iniciar = { loja: iniciarLoja, produto: iniciarProduto, carrinho: iniciarCarrinho, conta: iniciarConta, pagamento: iniciarPagamento };
  function iniciarPagina() { iniciar[document.body.dataset.pagina](); }
  window.Ellize.categorias().then(function (lista) {
    if (lista.length) {
      NOMES = { promocao: 'Promoção' };
      lista.forEach(function (c) { NOMES[c.slug] = c.name; });
      FILTROS = [['', 'Todos']].concat(lista.map(function (c) { return [c.slug, c.name]; }), [['promocao', 'Promoção']]);
    }
  }).catch(function () {}).then(iniciarPagina);
})();
