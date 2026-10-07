# C4 — Auditoria funcional de escala dos Territórios

## Problema encontrado

A tela de Territory Management consultava sempre `page=1&limit=100` e não oferecia navegação. Em organizações com mais de 100 territórios, os registros posteriores existiam na API/banco, mas ficavam inacessíveis pela interface.

## Correção

- paginação server-side com 50 territórios por página;
- controles Anterior/Próxima;
- total e número da página exibidos;
- busca reinicia na primeira página;
- detalhe expandido é fechado ao trocar de página para evitar contexto visual incorreto.

A API já suportava paginação, portanto não houve mudança de contrato ou banco.

## Cobertura

Teste Web comprova navegação da primeira para a segunda página e os parâmetros `page`/`limit` enviados à API.
