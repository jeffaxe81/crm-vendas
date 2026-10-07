# C4 — Auditoria funcional de Territory Management

## Problemas encontrados

A auditoria funcional identificou duas lacunas de uso e uma de isolamento:

- a tela exigia digitação manual do UUID do vendedor;
- a inclusão de empresa-alvo exigia digitação manual do UUID da empresa;
- a API aceitava `salesRepId` sem comprovar que o usuário estava ativo e vinculado à organização corrente com perfil comercial.

## Correções

- `GET /api/v1/territories/sales-reps` lista membros ativos com permissão `territory.write`;
- listagem de territórios inclui o nome do vendedor relacionado;
- reatribuição usa seletor por nome;
- criação, atualização e reatribuição validam o vendedor dentro do tenant;
- empresa-alvo é buscada pela API de Empresas e selecionada pelo nome;
- UUIDs deixam de ser requisito operacional na interface.

## Segurança

A validação de vendedor é feita no backend e não depende da interface. Usuário de outra organização, inativo ou sem `territory.write` é rejeitado com resposta genérica de não encontrado.

## Cobertura

- integração API: opções elegíveis e bloqueio cross-tenant;
- Web: seleção de vendedor por nome;
- Web: busca e seleção de empresa-alvo por nome.
