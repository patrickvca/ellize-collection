# Ellize Collection

Site e loja online da Ellize Collection, moda feminina e masculina premium em Vitória da Conquista, BA.

HTML, CSS e JavaScript puros, sem etapa de build. Login, produtos e pedidos ficam no Supabase. O frete é calculado pelo CEP no carrinho e o pagamento é combinado pelo WhatsApp depois do pedido.

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

Produtos, categorias e pedidos são gerenciados no painel em `/administrator`. A ordem das categorias definida ali vale para a loja, o menu e os destaques da página inicial. Feminino e Masculino são fixas no topo do painel, sem edição além da capa, e ficam nos dois painéis principais. As demais categorias aparecem nos destaques. Cada card usa a capa escolhida na aba Categorias. Sem capa, usa a foto de um produto da categoria ou uma textura. Só entram contas cujo e-mail esteja na tabela `admins` e já confirmado. O painel não tem cadastro nem recuperação de senha. O estoque é controlado por cor e tamanho e só baixa quando a loja clica em Finalizar pedido, informando a forma de pagamento. Cada produto tem valor no cartão e valor no Pix. O cliente escolhe a forma ao fechar o pedido, e a forma confirmada ao finalizar define o valor final: Pix, dinheiro e transferência usam o valor no Pix, e débito, crédito e outro usam o valor no cartão. Dinheiro só é aceito em pedidos com retirada na loja. Ao finalizar, a loja também seleciona estado e cidade. Os relatórios contam apenas pedidos finalizados, pela data da finalização. Os produtos atuais são exemplos e devem ser trocados pelos reais.

A chave em `store.js` é pública por natureza. A segurança vem das regras de acesso do banco, e o total do pedido é calculado no servidor.

## Frete

A função `supabase/functions/frete` recebe o CEP e os itens da sacola e grava as opções em `shipping_quotes`. O cliente envia só o id da opção, e o `create_order` soma o valor ao total. O frete fica fora do faturamento nos relatórios.

- CEP de Vitória da Conquista (IBGE 2933307): retirada grátis ou entrega em domicílio por R$ 10,00.
- Outros CEPs: PAC e SEDEX cotados no Melhor Envio. Sem token configurado, o site pede para falar com a loja.

Segredos da função no Supabase: `MELHOR_ENVIO_TOKEN` e `MELHOR_ENVIO_USER_AGENT` (nome da aplicação com e-mail de contato). Peso, caixa, CEP de origem e valor da entrega local ficam no início de `index.ts`. Publique a função com a verificação de JWT desligada, porque a chave pública do site não é um JWT e visitantes sem login também calculam o frete.

## Pagamento

Com `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` configurados nas funções do Supabase, o pedido segue para o Checkout Pro. Sem eles, a tela de pagamento leva ao WhatsApp com a forma e o valor escolhidos. O frete também pode ser calculado na página do produto.

- `pagamento.html`: depois de fechar o pedido, o cliente escolhe Pix, cartão ou boleto. A escolha recalcula o pedido no servidor (`set_order_payment`): Pix e boleto usam o valor do Pix, e cartão usa o valor cheio.
- `supabase/functions/pagamento`: cria a cobrança só com a forma escolhida.
- `supabase/functions/pagamento-aviso`: recebe o aviso, confere a assinatura e consulta o pagamento no Mercado Pago. Se aprovado, o pedido vira pago e o estoque baixa.

Problemas como peça sem estoque, valor diferente ou pagamento devolvido aparecem em vermelho no pedido do painel. Cancelar no painel não devolve o dinheiro: a devolução é feita no Mercado Pago. No Mercado Pago, o aviso aponta para `https://ukvivmgyxnuijmglidwm.supabase.co/functions/v1/pagamento-aviso`, com o evento Pagamentos. As duas funções são publicadas com a verificação de JWT desligada, porque autenticam por conta própria. Use `SITE_URL` ao trocar de domínio.

## Minhas compras, trocas e crédito

Em `conta.html`, o cliente acompanha o andamento desde a compra. O código de rastreio é salvo no pedido pelo painel e move o pedido pago para enviado. Quando o pedido vira entregue, o rastreio some e aparecem Comprar novamente e, por 7 dias, Pedir troca ou devolução. O prazo conta da data em que a loja marca Entregue, e o servidor confere esse limite.

A aba Trocas do painel responde às solicitações. A troca vira crédito na conta do cliente (`store_credits`). No fechamento ele usa o crédito e paga só a diferença, e o que sobrar continua na conta. Cancelar um pedido devolve o crédito usado. A política fica em `politicas.html`.

A aba Clientes do painel lista as contas com `admin_list_customers`, restrita a administradores. Contas sem nome usam o nome do último pedido. O valor comprado soma só pedidos finalizados. Em Ver detalhes, a loja vê contato, últimas compras e movimentos de crédito, e ajusta o saldo para mais ou para menos com `admin_adjust_credit`. O motivo aparece para o cliente, e o saldo não fica negativo.

## Endereços

Cada conta salva até 20 endereços em `customer_addresses`, com um padrão. Em Minha conta o cliente cadastra, edita, exclui e escolhe o padrão. No carrinho, o padrão já vem marcado, calcula o frete e preenche o endereço. Um endereço novo usado no pedido pode ser salvo na hora.

## Publicação

Ao alterar CSS ou JS, troque o `?v=` nas páginas HTML para o navegador não misturar versões.

O site está no GitHub Pages: https://patrickvca.github.io/ellize-collection/

Ao trocar de domínio, atualize `canonical`, `og:url`, `og:image` e os dados estruturados em `index.html`.
