# Ellize Collection

Site institucional da Ellize Collection, loja de moda feminina e masculina premium em Vitória da Conquista, BA.

HTML, CSS e JavaScript puros: sem dependências e sem etapa de build.

## Rodar localmente

```bash
python -m http.server 4173
```

Depois abra http://localhost:4173.

## Estrutura

- `index.html`: página única, com SEO e dados estruturados
- `assets/css/tokens.css`: cores, fontes, espaçamentos e raios
- `assets/css/site.css`: estilos dos componentes
- `assets/js/main.js`: menu mobile e animação de entrada
- `assets/img/`: logo em SVG e texturas

## Trocar as texturas por fotos

Os painéis usam texturas de cetim (`cetim-*.webp`). Para usar fotos da loja, troque o `src` da imagem no painel em `index.html` e descreva a foto no `alt`.

## Ao definir o domínio

Adicione a tag `canonical` e `og:url`, e troque `og:image` por uma URL absoluta.
