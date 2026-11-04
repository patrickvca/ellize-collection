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

## Trocar as texturas por fotos

Os painéis usam texturas de cetim (`cetim-*.webp`). Para usar fotos da loja, troque o `src` da imagem no painel em `index.html` e descreva a foto no `alt`.

## Produtos e pedidos

Produtos e pedidos são gerenciados no painel em `/administrator`. Só entram contas cujo e-mail esteja na tabela `admins` e já confirmado. O painel não tem cadastro nem recuperação de senha. O estoque é controlado por cor e tamanho e só baixa quando a loja clica em Finalizar pedido, informando a forma de pagamento. Ao finalizar, a loja também seleciona estado e cidade. Os relatórios contam apenas pedidos finalizados, pela data da finalização. Os produtos atuais são exemplos e devem ser trocados pelos reais.

A chave em `store.js` é pública por natureza. A segurança vem das regras de acesso do banco, e o total do pedido é calculado no servidor.

## Publicação

O site está no GitHub Pages: https://patrickvca.github.io/ellize-collection/

Ao trocar de domínio, atualize `canonical`, `og:url`, `og:image` e os dados estruturados em `index.html`.
