# Ellize Collection

Site e loja online da Ellize Collection, moda feminina e masculina premium em Vitória da Conquista, BA.

HTML, CSS e JavaScript puros, sem etapa de build. Login, produtos e pedidos ficam no Supabase. O pagamento e o frete são combinados pelo WhatsApp depois do pedido.

## Rodar localmente

```bash
python -m http.server 4173
```

Depois abra http://localhost:4173.

## Estrutura

- `index.html`: página inicial, com SEO e dados estruturados
- `loja.html`, `produto.html`, `carrinho.html`, `conta.html`: loja online
- `404.html`: página não encontrada
- `administrator/`: painel da loja (produtos, estoque, promoções e pedidos)
- `assets/css/tokens.css`: cores, fontes, espaçamentos e raios
- `assets/css/site.css`: estilos dos componentes
- `assets/css/store.css`: estilos da loja
- `assets/js/main.js`: barra, submenus, busca, sacola e rodapé das páginas da loja
- `assets/js/store.js`: catálogo, pedidos e login
- `assets/vendor/`: biblioteca do Supabase (MIT)
- `assets/img/`: logo em SVG e texturas
- `assets/data/cidades/`: municípios do Brasil por estado (fonte: IBGE)

## Fotos dos produtos

No painel, as fotos são cortadas na proporção 4:5 e salvas com até 1200 × 1500 px.

## Trocar as texturas por fotos

Os painéis usam texturas de cetim (`cetim-*.webp`). Para usar fotos da loja, troque o `src` da imagem no painel em `index.html` e descreva a foto no `alt`.

## Produtos e pedidos

Produtos, categorias e pedidos são gerenciados no painel em `/administrator`. A ordem das categorias definida ali vale para a loja e o menu. Só entram contas cujo e-mail esteja na tabela `admins` e já confirmado. O painel não tem cadastro nem recuperação de senha. O estoque é controlado por cor e tamanho e só baixa quando a loja clica em Finalizar pedido, informando a forma de pagamento. Cada produto tem valor no cartão e valor no Pix. O cliente escolhe a forma ao fechar o pedido, e a forma confirmada ao finalizar define o valor final: Pix, dinheiro e transferência usam o valor no Pix, e débito, crédito e outro usam o valor no cartão. Dinheiro só é aceito em pedidos com retirada na loja. Ao finalizar, a loja também seleciona estado e cidade. Os relatórios contam apenas pedidos finalizados, pela data da finalização. Os produtos atuais são exemplos e devem ser trocados pelos reais.

A chave em `store.js` é pública por natureza. A segurança vem das regras de acesso do banco, e o total do pedido é calculado no servidor.

## Publicação

Ao alterar CSS ou JS, troque o `?v=` nas páginas HTML para o navegador não misturar versões.

O site está no GitHub Pages: https://patrickvca.github.io/ellize-collection/

Ao trocar de domínio, atualize `canonical`, `og:url`, `og:image` e os dados estruturados em `index.html`.
