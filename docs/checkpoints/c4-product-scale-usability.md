# C4 — Auditoria funcional de Produtos e Itens

## Problemas encontrados

A auditoria funcional identificou dois tetos silenciosos de 100 registros:

- o catálogo carregava sempre `page=1&limit=100` e não oferecia paginação;
- o seletor de produto ao adicionar um item na oportunidade carregava somente os 100 primeiros produtos ativos.

Em bases maiores, produtos existentes deixavam de ficar acessíveis pela interface.

## Correções

- catálogo paginado no servidor, com 50 registros por página;
- controles Anterior/Próxima e indicação de página/total;
- busca do catálogo reinicia na primeira página e continua usando o filtro da API;
- painel de itens carrega uma primeira página curta e permite busca server-side por código ou nome;
- a busca de itens substitui as opções exibidas sem carregar todo o catálogo no navegador.

## Cobertura

- teste Web navegando da página 1 para a página 2 do catálogo;
- teste Web localizando um produto fora da página inicial no seletor de itens.

## Sem alteração de domínio

Não há mudança de schema, contrato de persistência ou permissão. A correção usa a paginação e o filtro `q` já disponíveis na API de Produtos.
