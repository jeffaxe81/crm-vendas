# Checkpoint — C3.6.6 Opportunities Web / Movimentação de Etapa

## Estado da entrega

- branch canônica: `feat/c3-6-6-opportunities-web-stage-move`;
- PR: #33;
- base integrada: `main` em `480a5b2c2bbf37829d2e1d7474cd2c31fa5f1d3d`;
- sequência anterior integrada: C3.6.5 — Opportunities Web / Criação;
- PR permanece Draft e o merge permanece bloqueado até gate integral GREEN no SHA documental definitivo e aprovação humana explícita específica para o PR #33.

## Escopo desta microentrega

A C3.6.6 fecha a lacuna funcional da Fase 1 permitindo movimentar uma oportunidade entre etapas do próprio funil pela Web canônica:

- movimentação exposta somente para sessão com `opportunity.move`;
- seleção restrita às etapas pertencentes ao pipeline atual da oportunidade;
- reutilização de `PATCH /api/v1/opportunities/:id/stage`;
- envio de `{ stageId, version }`, preservando concorrência otimista já implementada na API;
- recarga da lista após movimentação bem-sucedida;
- nenhuma alteração de domínio, banco, migrations, RLS ou contrato de API.

## Segurança e contratos

- nenhuma nova permissão RBAC foi criada;
- `canMove` deriva exclusivamente das permissões da sessão autenticada;
- ocultar o comando na Web não substitui a autorização da API, que permanece a autoridade final;
- o cliente Web só oferece etapas do mesmo Pipeline carregado para a oportunidade;
- tentativa de troca de Pipeline continua fora do escopo e protegida pelo contrato backend existente;
- isolamento multiempresa, RLS e validações tenant-aware permanecem inalterados.

## Evidência TDD

### RED — comportamento antes da implementação

- commit RED: `9234413f0fb6ff8dee49082efdf9443cfba25acf`;
- workflow RED: `34591013129` (#616);
- infraestrutura, dependencies, Prisma, migrations e role de aplicação passaram;
- `Verify source and tests` falhou como esperado antes da implementação da movimentação Web;
- etapas posteriores do gate foram corretamente interrompidas.

### GREEN funcional intermediário

A implementação funcional foi introduzida incrementalmente nos commits:

- `a851fc290...` — movimentação de etapa na Web reutilizando a API existente;
- `920fa4090b97ebbb3a63abd868f24c1fa119497c` — permission gate por `opportunity.move`.

O workflow #619 terminou GREEN no head `920fa4090b97ebbb3a63abd868f24c1fa119497c`, incluindo verificação de fonte/testes, Playwright E2E existente, Compose e build das imagens.

## E2E específico da C3.6.6

Foi adicionado um fluxo Playwright dedicado que:

- autentica o administrador de teste;
- garante idempotentemente o `Funil de Vendas` padrão pela API;
- cria uma empresa pela interface Web;
- cria uma oportunidade na etapa `Prospecção` pela interface Web;
- movimenta a oportunidade para `Qualificação` pela interface Web;
- recarrega a aplicação e valida a persistência da nova etapa.

Esse teste complementa os testes Web existentes e valida o fluxo comercial real sem mocks.

## Fora do escopo

Permanecem deliberadamente fora da C3.6.6:

- edição cadastral geral da oportunidade;
- troca de Pipeline;
- Kanban e drag-and-drop;
- fechamento WON/LOST pela Web;
- forecast avançado;
- produtos, propostas, comissões, automações, integrações e IA;
- qualquer alteração de banco, migration, RLS ou contrato de domínio.

## Gate de integração

Após o E2E e esta documentação, um novo workflow completo deve terminar GREEN no SHA final da branch, incluindo:

- instalação congelada e políticas de supply chain;
- Prisma generate;
- deploy das migrations existentes;
- provisionamento da role de aplicação sem bypass de RLS;
- `pnpm verify`;
- bootstrap do administrador E2E;
- Playwright E2E, incluindo movimentação de oportunidade;
- validação de Compose;
- build das imagens API e Web.

Mesmo após GREEN e com o PR mergeável, o PR #33 deve permanecer Draft e **não pode ser marcado ready nem mergeado** sem aprovação humana explícita equivalente a:

`Aprovo o merge do PR #33 na main.`
