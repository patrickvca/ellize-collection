(function () {
  var sb = window.supabase.createClient(
    'https://ukvivmgyxnuijmglidwm.supabase.co',
    'sb_publishable_iYw7NyIVGCRldB_airq5mQ_lDbINTVj',
    { auth: { storageKey: 'ellize-admin', persistSession: true, detectSessionInUrl: false } }
  );
  var CATEGORIAS = [['feminino', 'Feminino'], ['masculino', 'Masculino'], ['conjuntos', 'Conjuntos'], ['vestidos', 'Vestidos'], ['bolsas', 'Bolsas']];
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
  var tempoAviso;

  function $(seletor) { return document.querySelector(seletor); }
  function dinheiro(centavos) { return moeda.format(centavos / 100); }
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fotoSrc(caminho) { return /^https?:/.test(caminho) ? caminho : '../' + caminho; }
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
      ['produtos', 'pedidos', 'relatorios'].forEach(function (aba) {
        $('#aba-' + aba).hidden = botao.dataset.aba !== aba;
      });
      if (botao.dataset.aba === 'relatorios') carregarRelatorio();
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
      (p.colors || []).map(function (c) { return c.image; }).concat(p.image).forEach(function (foto) {
        if (foto) removerFoto(foto);
      });
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
  }).join('') + '<button class="botao-texto" type="button" data-atalho="">+ Outro tamanho</button><button class="botao-texto" type="button" data-nova-cor>+ Cor</button>';

  var COR_PADRAO = '#d6d1c6';
  var grade = { cores: [], tamanhos: [], q: [] };

  function lerGrade() {
    document.querySelectorAll('#grade .c-nome').forEach(function (campo, i) { grade.cores[i].name = campo.value; });
    document.querySelectorAll('#grade .c-hex').forEach(function (campo, i) { grade.cores[i].hex = campo.value; });
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
      var previa = c.previa || (c.image ? fotoSrc(c.image) : '');
      return '<tr><td><div class="grade-cor"><label class="c-foto" title="Foto desta cor">' +
        (previa ? '<img src="' + esc(previa) + '" alt="" width="42" height="42">' : '<span>Foto</span>') +
        '<input type="file" accept="image/jpeg,image/png,image/webp" data-foto-cor="' + ci + '" aria-label="Foto da cor ' + esc(c.name) + '"></label>' +
        '<input class="c-hex" type="color" value="' + esc(c.hex) + '" aria-label="Tom da cor">' +
        '<input class="c-nome" maxlength="30" value="' + esc(c.name) + '" placeholder="Azul" aria-label="Nome da cor"></div></td>' +
        grade.tamanhos.map(function (t, ti) {
          return '<td><input class="q" type="number" min="0" max="9999" step="1" value="' + esc(grade.q[ci][ti]) + '" data-c="' + ci + '" data-t="' + ti + '" aria-label="Estoque da cor ' + esc(c.name) + ', tamanho ' + esc(t) + '"></td>';
        }).join('') +
        '<td><button class="fechar" type="button" data-tirar-cor="' + ci + '" aria-label="Remover cor ' + esc(c.name) + '">×</button></td></tr>';
    }).join('') + '</tbody></table>';
  }
  function adicionarTamanho(nome) {
    lerGrade();
    if (nome && grade.tamanhos.indexOf(nome) !== -1) return;
    grade.tamanhos.push(nome);
    grade.q.forEach(function (linha) { linha.push(0); });
    desenharGrade();
  }
  $('#grade').addEventListener('change', function (evento) {
    var campo = evento.target.closest('[data-foto-cor]');
    if (!campo || !campo.files[0]) return;
    lerGrade();
    var cor = grade.cores[+campo.dataset.fotoCor];
    cor.arquivo = campo.files[0];
    cor.previa = URL.createObjectURL(cor.arquivo);
    desenharGrade();
  });
  $('#grade').addEventListener('click', function (evento) {
    var cor = evento.target.closest('[data-tirar-cor]');
    var tamanho = evento.target.closest('[data-tirar-tamanho]');
    if (!cor && !tamanho) return;
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
      grade.cores.push({ name: '', hex: '#7a1218' });
      grade.q.push(grade.tamanhos.map(function () { return 0; }));
      desenharGrade();
      var nomes = document.querySelectorAll('#grade .c-nome');
      nomes[nomes.length - 1].focus();
    }
  });
  function abrirEditor(p) {
    editando = p || null;
    fotoNova = null;
    form.reset();
    $('#foto').value = '';
    $('#erro-produto').hidden = true;
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
      grade = {
        cores: p.colors.map(function (c) { return { name: c.name, hex: c.hex || COR_PADRAO, image: c.image || null }; }),
        tamanhos: p.sizes.slice(),
        q: p.colors.map(function (c) { return p.sizes.map(function (t) { return qtd(p, c.name, t); }); })
      };
    } else {
      grade = { cores: [{ name: 'Única', hex: COR_PADRAO }], tamanhos: ['P', 'M', 'G'], q: [[0, 0, 0]] };
    }
    desenharGrade();
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
  function enviarFoto(arquivo) {
    if (!arquivo) return Promise.resolve(null);
    return reduzirFoto(arquivo).then(function (blob) {
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
      sizes: tamanhos,
      colors: grade.cores.map(function (c, i) { return { name: nomesCor[i], hex: c.hex, image: c.image || null }; }),
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
    var envios = [enviarFoto(fotoNova)].concat(grade.cores.map(function (c) { return enviarFoto(c.arquivo); }));
    Promise.all(envios).then(function (urls) {
      var url = urls[0];
      dados.colors.forEach(function (c, i) { if (urls[i + 1]) c.image = urls[i + 1]; });
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
        var emUso = dados.colors.map(function (c) { return c.image; }).concat(dados.image);
        (antigo.colors || []).map(function (c) { return c.image; }).concat(antigo.image).forEach(function (foto) {
          if (foto && emUso.indexOf(foto) === -1) removerFoto(foto);
        });
      }
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
        '<p>' + esc(o.customer_name) + ' · <a href="' + esc(whatsapp) + '" target="_blank" rel="noopener">' + esc(o.phone) + '</a>' + (o.city ? ' · ' + esc(o.city) + ' - ' + esc(o.state) : '') + '</p>' +
        (o.payment_method ? '<p>Pagamento: ' + esc(PAGAMENTOS[o.payment_method] || o.payment_method) + '</p>' : '') +
        '<p>' + (o.delivery === 'envio' ? 'Receber em casa: ' + esc(o.address || '') : 'Retirar na loja') + '</p>' +
        (o.note ? '<p>Observação: ' + esc(o.note) + '</p>' : '') +
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
