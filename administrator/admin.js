(function () {
  var sb = window.supabase.createClient(
    'https://ukvivmgyxnuijmglidwm.supabase.co',
    'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj',
    { auth: { storageKey: 'ellize-admin', persistSession: true, detectSessionInUrl: false } }
  );
  var CATEGORIAS = [['feminino', 'Feminino'], ['masculino', 'Masculino'], ['conjuntos', 'Conjuntos'], ['vestidos', 'Vestidos'], ['bolsas', 'Bolsas']];
  var ATALHOS = ['PP', 'P', 'M', 'G', 'GG', 'Único'];
  var STATUS_FINALIZADO = [['pago', 'Pago'], ['enviado', 'Enviado'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado']];
  var BUCKET = 'produtos';
  var FOTO_PADRAO = 'assets/img/cetim-marfim.webp';
  var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var produtos = [];
  var pedidos = [];
  var editando = null;
  var fotoNova = null;
  var tempoAviso;

  function $(seletor) { return document.querySelector(seletor); }
  function dinheiro(centavos) { return moeda.format(centavos / 100); }
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fotoSrc(caminho) { return /^https?:/.test(caminho) ? caminho : '../' + caminho; }
  function total(p) {
    return p.sizes.reduce(function (soma, t) { return soma + (Number(p.stock[t]) || 0); }, 0);
  }
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
      $('#aba-produtos').hidden = botao.dataset.aba !== 'produtos';
      $('#aba-pedidos').hidden = botao.dataset.aba !== 'pedidos';
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
    var termo = $('#busca').value.trim().toLowerCase();
    var filtro = $('#filtro').value;
    var promo = produtos.filter(function (p) { return p.promo_price_cents; }).length;
    var esgotados = produtos.filter(function (p) { return total(p) === 0; }).length;
    var ativos = produtos.filter(function (p) { return p.active; }).length;
    $('#resumo').innerHTML = [['Produtos', produtos.length], ['Visíveis', ativos], ['Em promoção', promo], ['Esgotados', esgotados]].map(function (i) {
      return '<div><strong>' + i[1] + '</strong><span>' + i[0] + '</span></div>';
    }).join('');
    var lista = produtos.filter(function (p) {
      if (termo && p.name.toLowerCase().indexOf(termo) === -1) return false;
      if (filtro === 'ativos') return p.active;
      if (filtro === 'ocultos') return !p.active;
      if (filtro === 'promocao') return !!p.promo_price_cents;
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
      var estoque = p.sizes.map(function (t) {
        var q = Number(p.stock[t]) || 0;
        return '<span class="chip' + (q === 0 ? ' chip-zero' : q <= 2 ? ' chip-baixo' : '') + '">' + esc(t) + ': ' + q + '</span>';
      }).join('');
      return '<li class="item"><img src="' + esc(fotoSrc(p.image)) + '" alt="" width="64" height="80" loading="lazy">' +
        '<div class="item-info"><h3>' + esc(p.name) + '</h3><p class="item-preco">' + preco + '</p></div>' +
        '<div class="item-estoque">' + estoque + '</div>' +
        '<div class="item-selos">' + (p.active ? '<span class="selo selo-ok">Visível</span>' : '<span class="selo">Oculto</span>') +
        (p.promo_price_cents ? '<span class="selo selo-promo">Promoção</span>' : '') +
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
  function removerProduto(p) {
    if (!window.confirm('Remover "' + p.name + '" da loja? Os pedidos antigos continuam guardados.')) return;
    sb.from('products').delete().eq('id', p.id).then(function (r) {
      if (r.error) { avisar('Não foi possível remover o produto.'); return; }
      removerFoto(p.image);
      avisar('Produto removido.');
      carregarProdutos();
    });
  }

  /* Editor */
  var editor = $('#editor');
  var form = $('#form-produto');
  $('#categorias').innerHTML = CATEGORIAS.map(function (c) {
    return '<label class="marca-linha"><input type="checkbox" name="categoria" value="' + c[0] + '"> ' + c[1] + '</label>';
  }).join('');
  $('#atalhos').innerHTML = ATALHOS.map(function (t) {
    return '<button class="botao-texto" type="button" data-atalho="' + t + '">+ ' + t + '</button>';
  }).join('') + '<button class="botao-texto" type="button" data-atalho="">+ Outro</button>';

  function linhaTamanho(tamanho, quantidade) {
    $('#tamanhos').insertAdjacentHTML('beforeend',
      '<div class="tamanho-linha"><label>Tamanho<input class="t-nome" maxlength="12" value="' + esc(tamanho) + '"></label>' +
      '<label>Estoque<input class="t-qtd" type="number" min="0" max="9999" step="1" value="' + esc(quantidade) + '"></label>' +
      '<button class="fechar" type="button" data-tirar aria-label="Remover tamanho">×</button></div>');
  }
  $('#tamanhos').addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-tirar]');
    if (botao) botao.parentElement.remove();
  });
  $('#atalhos').addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-atalho]');
    if (!botao) return;
    var tamanho = botao.dataset.atalho;
    var existe = [].some.call(document.querySelectorAll('.t-nome'), function (i) { return tamanho && i.value === tamanho; });
    if (!existe) linhaTamanho(tamanho, 0);
  });
  function abrirEditor(p) {
    editando = p || null;
    fotoNova = null;
    form.reset();
    $('#foto').value = '';
    $('#erro-produto').hidden = true;
    $('#tamanhos').innerHTML = '';
    $('#editor-titulo').textContent = p ? 'Editar produto' : 'Novo produto';
    $('#foto-previa').src = fotoSrc(p ? p.image : FOTO_PADRAO);
    if (p) {
      form.nome.value = p.name;
      form.descricao.value = p.description;
      form.preco.value = paraTexto(p.price_cents);
      form.promo.value = p.promo_price_cents ? paraTexto(p.promo_price_cents) : '';
      form.ativo.checked = p.active;
      form.exemplo.checked = p.is_sample;
      form.querySelectorAll('[name="categoria"]').forEach(function (c) { c.checked = p.tags.indexOf(c.value) !== -1; });
      p.sizes.forEach(function (t) { linhaTamanho(t, Number(p.stock[t]) || 0); });
    } else {
      ['P', 'M', 'G'].forEach(function (t) { linhaTamanho(t, 0); });
    }
    editor.showModal();
  }
  $('#novo').addEventListener('click', function () { abrirEditor(null); });
  editor.addEventListener('click', function (evento) {
    if (evento.target === editor || evento.target.closest('[data-fechar]')) editor.close();
  });
  $('#foto').addEventListener('change', function () {
    fotoNova = this.files[0] || null;
    if (fotoNova) $('#foto-previa').src = URL.createObjectURL(fotoNova);
  });
  function reduzirFoto(arquivo) {
    return createImageBitmap(arquivo).then(function (imagem) {
      var escala = Math.min(1, 1400 / Math.max(imagem.width, imagem.height));
      var tela = document.createElement('canvas');
      tela.width = Math.round(imagem.width * escala);
      tela.height = Math.round(imagem.height * escala);
      tela.getContext('2d').drawImage(imagem, 0, 0, tela.width, tela.height);
      return new Promise(function (resolver, rejeitar) {
        tela.toBlob(function (blob) { blob ? resolver(blob) : rejeitar(new Error('foto')); }, 'image/webp', 0.82);
      });
    });
  }
  function enviarFoto() {
    if (!fotoNova) return Promise.resolve(null);
    return reduzirFoto(fotoNova).then(function (blob) {
      var nome = crypto.randomUUID() + '.webp';
      return sb.storage.from(BUCKET).upload(nome, blob, { contentType: 'image/webp' }).then(function (r) {
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
    if (promo && promo >= preco) throw new Error('O preço promocional precisa ser menor que o preço normal.');
    var tamanhos = [];
    var estoque = {};
    document.querySelectorAll('.tamanho-linha').forEach(function (linha) {
      var tamanho = linha.querySelector('.t-nome').value.trim();
      var quantidade = Number(linha.querySelector('.t-qtd').value);
      if (!tamanho) throw new Error('Preencha o nome de todos os tamanhos.');
      if (tamanhos.indexOf(tamanho) !== -1) throw new Error('O tamanho ' + tamanho + ' está repetido.');
      if (!Number.isInteger(quantidade) || quantidade < 0) throw new Error('O estoque de ' + tamanho + ' precisa ser um número inteiro.');
      tamanhos.push(tamanho);
      estoque[tamanho] = quantidade;
    });
    if (!tamanhos.length) throw new Error('Adicione pelo menos um tamanho.');
    return {
      name: nome,
      description: form.descricao.value.trim(),
      price_cents: preco,
      promo_price_cents: promo,
      sizes: tamanhos,
      stock: estoque,
      tags: [].map.call(form.querySelectorAll('[name="categoria"]:checked'), function (c) { return c.value; }),
      active: form.ativo.checked,
      is_sample: form.exemplo.checked
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
    ocupado(botao, true, 'Salvando…');
    var antigo = editando;
    enviarFoto().then(function (url) {
      dados.image = url || (antigo ? antigo.image : FOTO_PADRAO);
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
      if (resultado[1] && antigo) removerFoto(antigo.image);
      editor.close();
      avisar('Produto salvo.');
      carregarProdutos();
    }).catch(function () {
      ocupado(botao, false);
      erro.textContent = 'Não foi possível enviar a foto. Use JPG, PNG ou WebP.';
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
        '<p>' + esc(o.customer_name) + ' · <a href="' + esc(whatsapp) + '" target="_blank" rel="noopener">' + esc(o.phone) + '</a></p>' +
        '<p>' + (o.delivery === 'envio' ? 'Receber em casa: ' + esc(o.address || '') : 'Retirar na loja') + '</p>' +
        (o.note ? '<p>Observação: ' + esc(o.note) + '</p>' : '') +
        '<ul class="pedido-itens">' + o.order_items.map(function (i) {
          return '<li>' + i.quantity + 'x ' + esc(i.product_name) + ' (' + esc(i.size) + ') · ' + dinheiro(i.unit_price_cents) + '</li>';
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
  $('#lista-pedidos').addEventListener('click', function (evento) {
    var finalizar = evento.target.closest('[data-finalizar]');
    var cancelar = evento.target.closest('[data-cancelar]');
    var reabrir = evento.target.closest('[data-reabrir]');
    if (finalizar) {
      if (!window.confirm('Finalizar o pedido #' + finalizar.dataset.numero + '?\n\nConfirme que o pagamento foi recebido. O estoque será baixado.')) return;
      ocupado(finalizar, true, 'Finalizando…');
      concluirPedido(sb.rpc('admin_finalize_order', { p_order: finalizar.dataset.finalizar }), 'Pedido finalizado e estoque baixado.');
    }
    if (cancelar && window.confirm('Cancelar o pedido #' + cancelar.dataset.numero + '?')) {
      mudarStatus(cancelar.dataset.cancelar, 'cancelado', 'Pedido cancelado.');
    }
    if (reabrir) mudarStatus(reabrir.dataset.reabrir, 'novo', 'Pedido reaberto.');
  });

  sb.auth.getSession().then(function (r) {
    if (r.data.session) entrarNoPainel();
    else mostrarLogin();
  });
})();
