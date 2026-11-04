(function () {
  var URL_SUPABASE = 'https://ukvivmgyxnuijmglidwm.supabase.co';
  var CHAVE_PUBLICA = 'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj';
  var WHATSAPP = 'https://wa.me/5577988298955';
  var ICONES = 'assets/img/icones.svg#';
  var FILTROS = [
    ['', 'Todos'], ['feminino', 'Feminino'], ['masculino', 'Masculino'],
    ['conjuntos', 'Conjuntos'], ['vestidos', 'Vestidos'], ['bolsas', 'Bolsas']
  ];
  var STATUS = {
    novo: 'Recebido', confirmado: 'Confirmado', pago: 'Pago',
    enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado'
  };
  var VOLTAS = ['carrinho.html'];

  var sb = window.supabase.createClient(URL_SUPABASE, CHAVE_PUBLICA, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
  });
  var carrinho = window.EllizeCarrinho;
  var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var parametros = new URLSearchParams(location.search);

  function dinheiro(centavos) { return moeda.format(centavos / 100); }
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icone(nome, linha) {
    return '<svg class="icone' + (linha ? ' icone-linha' : '') + '" aria-hidden="true"><use href="' + ICONES + nome + '"/></svg>';
  }
  function $(seletor) { return document.querySelector(seletor); }
  function estado(titulo, texto, acao) {
    return '<div class="estado"><h2>' + esc(titulo) + '</h2>' + (texto ? '<p>' + esc(texto) + '</p>' : '') + (acao || '') + '</div>';
  }
  function erroCarregar() {
    return estado('Não foi possível carregar', 'Verifique sua conexão e tente novamente.',
      '<a class="botao botao-vinho" href="' + esc(location.pathname.split('/').pop() + location.search) + '">Tentar novamente</a>');
  }
  function avisar(mensagem) {
    var aviso = $('.toast');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'toast';
      aviso.setAttribute('role', 'status');
      document.body.appendChild(aviso);
    }
    aviso.innerHTML = '<span>' + esc(mensagem) + '</span><a href="carrinho.html">Ver carrinho</a>';
    aviso.classList.add('visivel');
    clearTimeout(avisar.tempo);
    avisar.tempo = setTimeout(function () { aviso.classList.remove('visivel'); }, 4000);
  }
  function selo(produto) {
    return produto.is_sample ? '<span class="selo-exemplo">Exemplo</span>' : '';
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
  function iniciarLoja() {
    var filtro = parametros.get('c') || '';
    if (!FILTROS.some(function (f) { return f[0] === filtro; })) filtro = '';
    $('#filtros').innerHTML = FILTROS.map(function (f) {
      var href = f[0] ? 'loja.html?c=' + f[0] : 'loja.html';
      return '<a class="filtro" href="' + href + '"' + (f[0] === filtro ? ' aria-current="page"' : '') + '>' + f[1] + '</a>';
    }).join('');

    var consulta = sb.from('products').select('*').order('created_at');
    if (filtro) consulta = consulta.contains('tags', [filtro]);
    consulta.then(function (resposta) {
      var grade = $('#produtos');
      grade.setAttribute('aria-busy', 'false');
      if (resposta.error) { grade.outerHTML = erroCarregar(); return; }
      var produtos = resposta.data;
      if (!produtos.length) {
        grade.outerHTML = estado('Nenhuma peça por aqui', 'Veja as outras categorias da loja.', '<a class="botao botao-vinho" href="loja.html">Ver todos</a>');
        return;
      }
      if (produtos.some(function (p) { return p.is_sample; })) $('#nota-exemplo').hidden = false;
      grade.innerHTML = produtos.map(function (p) {
        return '<a class="produto" href="produto.html?p=' + encodeURIComponent(p.slug) + '">' +
          '<span class="produto-foto"><img src="' + esc(p.image) + '" alt="" width="800" height="1000" loading="lazy">' + selo(p) + '</span>' +
          '<span class="produto-nome">' + esc(p.name) + '</span>' +
          '<span class="produto-preco">' + dinheiro(p.price_cents) + '</span></a>';
      }).join('');
    }, function () { $('#produtos').outerHTML = erroCarregar(); });
  }

  /* Produto */
  function iniciarProduto() {
    var alvo = $('#produto');
    var slug = parametros.get('p');
    var naoAchou = estado('Peça não encontrada', 'Ela pode ter saído da loja.', '<a class="botao botao-vinho" href="loja.html">Ver a loja</a>');
    if (!slug) { alvo.innerHTML = naoAchou; return; }
    sb.from('products').select('*').eq('slug', slug).maybeSingle().then(function (resposta) {
      if (resposta.error) { alvo.innerHTML = erroCarregar(); return; }
      var p = resposta.data;
      if (!p) { alvo.innerHTML = naoAchou; return; }
      document.title = p.name + ' | Ellize Collection';
      var unico = p.sizes.length === 1;
      alvo.innerHTML =
        '<div class="detalhe-foto"><img src="' + esc(p.image) + '" alt="" width="800" height="1000">' + selo(p) + '</div>' +
        '<form class="detalhe-info" id="form-produto" novalidate>' +
        '<a class="voltar" href="loja.html">Voltar para a loja</a>' +
        '<h1>' + esc(p.name) + '</h1>' +
        '<p class="detalhe-preco">' + dinheiro(p.price_cents) + '</p>' +
        '<p class="detalhe-texto">' + esc(p.description) + '</p>' +
        '<fieldset class="tamanhos"><legend>Tamanho</legend>' + p.sizes.map(function (t) {
          return '<label><input type="radio" name="tamanho" value="' + esc(t) + '"' + (unico ? ' checked' : '') + '><span>' + esc(t) + '</span></label>';
        }).join('') + '</fieldset>' +
        '<p class="campo-erro" id="erro-tamanho" role="alert" hidden>Escolha um tamanho.</p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Adicionar ao carrinho</button>' +
        '<a class="botao botao-linha botao-largo" target="_blank" rel="noopener" href="' + WHATSAPP + '?text=' +
        encodeURIComponent('Olá! Tenho uma dúvida sobre: ' + p.name) + '">' + icone('i-whatsapp') + 'Tirar dúvida no WhatsApp</a>' +
        '</form>';
      $('#form-produto').addEventListener('submit', function (evento) {
        evento.preventDefault();
        var escolhido = this.querySelector('input[name="tamanho"]:checked');
        $('#erro-tamanho').hidden = !!escolhido;
        if (!escolhido) return;
        carrinho.adicionar(p.id, escolhido.value, 1);
        avisar(p.name + ' adicionado ao carrinho.');
      });
    }, function () { alvo.innerHTML = erroCarregar(); });
  }

  /* Carrinho e fechamento do pedido */
  function iniciarCarrinho() {
    var alvo = $('#carrinho');
    var produtos = {};

    function linhasValidas() {
      return carrinho.ler().filter(function (i) { return produtos[i.id] && produtos[i.id].sizes.indexOf(i.size) !== -1; });
    }
    function total() {
      return linhasValidas().reduce(function (soma, i) { return soma + i.qty * produtos[i.id].price_cents; }, 0);
    }
    function desenharVazio() {
      alvo.innerHTML = estado('Seu carrinho está vazio', 'Escolha suas peças na loja.', '<a class="botao botao-vinho" href="loja.html">Ver a loja</a>');
    }
    function desenharLinhas() {
      var linhas = linhasValidas();
      if (!linhas.length) { desenharVazio(); return; }
      $('#itens').innerHTML = linhas.map(function (i, n) {
        var p = produtos[i.id];
        return '<li class="linha"><img src="' + esc(p.image) + '" alt="" width="96" height="120">' +
          '<div class="linha-info"><a href="produto.html?p=' + encodeURIComponent(p.slug) + '">' + esc(p.name) + '</a>' +
          '<span>Tamanho ' + esc(i.size) + '</span><span>' + dinheiro(p.price_cents) + '</span></div>' +
          '<div class="linha-acoes"><div class="passo">' +
          '<button type="button" data-acao="menos" data-n="' + n + '" aria-label="Diminuir quantidade de ' + esc(p.name) + '"' + (i.qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span aria-live="polite">' + i.qty + '</span>' +
          '<button type="button" data-acao="mais" data-n="' + n + '" aria-label="Aumentar quantidade de ' + esc(p.name) + '"' + (i.qty >= 10 ? ' disabled' : '') + '>+</button></div>' +
          '<button class="botao-icone" type="button" data-acao="remover" data-n="' + n + '" aria-label="Remover ' + esc(p.name) + '">' + icone('i-lixo', true) + '</button></div></li>';
      }).join('');
      $('#total').textContent = dinheiro(total());
    }
    function desenharFechamento(sessao) {
      var caixa = $('#fechamento');
      if (!sessao) {
        caixa.innerHTML = '<p>Entre na sua conta para fechar o pedido. Seu carrinho fica guardado.</p>' +
          '<a class="botao botao-vinho botao-largo" href="conta.html?volta=carrinho.html">Entrar ou criar conta</a>';
        return;
      }
      var meta = sessao.user.user_metadata || {};
      caixa.innerHTML =
        '<form id="form-pedido" class="formulario" novalidate>' +
        '<label class="campo">Nome completo<input name="nome" autocomplete="name" required minlength="2" maxlength="120" value="' + esc(meta.full_name || meta.name || '') + '"></label>' +
        '<label class="campo">Telefone com DDD<input name="telefone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20"></label>' +
        '<fieldset class="opcoes"><legend>Como quer receber?</legend>' +
        '<label><input type="radio" name="entrega" value="retirada" checked><span>Retirar na loja</span></label>' +
        '<label><input type="radio" name="entrega" value="envio"><span>Receber em casa</span></label></fieldset>' +
        '<label class="campo" id="campo-endereco" hidden>Endereço completo com CEP<textarea name="endereco" rows="3" autocomplete="street-address" maxlength="300"></textarea></label>' +
        '<label class="campo">Observação (opcional)<textarea name="nota" rows="2" maxlength="500"></textarea></label>' +
        '<p class="mensagem mensagem-erro" id="erro-pedido" role="alert" hidden></p>' +
        '<button class="botao botao-vinho botao-largo" type="submit">Fechar pedido</button>' +
        '<p class="nota-pequena">Depois de fechar, você combina o pagamento e o frete com a loja pelo WhatsApp.</p></form>';
      var form = $('#form-pedido');
      form.addEventListener('change', function () {
        $('#campo-endereco').hidden = form.entrega.value !== 'envio';
      });
      form.addEventListener('submit', enviarPedido);
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
        p_items: linhas.map(function (i) { return { product_id: i.id, size: i.size, quantity: i.qty }; }),
        p_name: form.nome.value,
        p_phone: form.telefone.value,
        p_delivery: form.entrega.value,
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
          linhas.map(function (i) { return i.qty + 'x ' + produtos[i.id].name + ' (' + i.size + ')'; }).join('\n') +
          '\n\nTotal: ' + dinheiro(pedido.total_cents) + '\nEntrega: ' + (form.entrega.value === 'envio' ? 'Receber em casa' : 'Retirar na loja');
        carrinho.salvar([]);
        alvo.innerHTML = '<div class="estado estado-sucesso"><span class="etiqueta">Pedido #' + esc(pedido.number) + '</span>' +
          '<h2>Pedido recebido</h2><p>Total de ' + dinheiro(pedido.total_cents) + '. Envie o pedido no WhatsApp para combinar o pagamento e o frete.</p>' +
          '<a class="botao botao-vinho" target="_blank" rel="noopener" href="' + WHATSAPP + '?text=' + encodeURIComponent(texto) + '">' + icone('i-whatsapp') + 'Enviar no WhatsApp</a>' +
          '<a class="botao botao-linha" href="conta.html">Ver meus pedidos</a></div>';
        window.scrollTo(0, 0);
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
      if (validas.length !== carrinho.ler().length) carrinho.salvar(validas);
      if (!validas.length) { desenharVazio(); return; }
      alvo.innerHTML = '<ul class="linhas" id="itens"></ul><aside class="resumo">' +
        '<p class="resumo-total"><span>Total das peças</span><strong id="total"></strong></p>' +
        '<p class="nota-pequena">Frete combinado com a loja.</p><div id="fechamento"></div></aside>';
      desenharLinhas();
      desenharFechamento(r[1].data.session);
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
      sb.from('orders').select('number,total_cents,status,delivery,created_at,order_items(product_name,size,quantity)')
        .order('created_at', { ascending: false }).then(function (r) {
          var caixa = $('#pedidos');
          if (!caixa) return;
          caixa.setAttribute('aria-busy', 'false');
          if (r.error) { caixa.innerHTML = '<p class="mensagem mensagem-erro">Não foi possível carregar seus pedidos.</p>'; return; }
          if (!r.data.length) {
            caixa.innerHTML = estado('Nenhum pedido ainda', 'Seus pedidos aparecem aqui.', '<a class="botao botao-vinho" href="loja.html">Ver a loja</a>');
            return;
          }
          caixa.innerHTML = '<ul class="pedidos">' + r.data.map(function (o) {
            return '<li class="pedido"><div class="pedido-topo"><strong>Pedido #' + esc(o.number) + '</strong>' +
              '<span class="pedido-status">' + esc(STATUS[o.status] || o.status) + '</span></div>' +
              '<p>' + new Date(o.created_at).toLocaleDateString('pt-BR') + ' · ' + dinheiro(o.total_cents) + ' · ' + (o.delivery === 'envio' ? 'Receber em casa' : 'Retirar na loja') + '</p>' +
              '<ul>' + o.order_items.map(function (i) {
                return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + esc(i.size) + ')</li>';
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
  iniciar[document.body.dataset.pagina]();
})();
