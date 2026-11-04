(function () {
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
