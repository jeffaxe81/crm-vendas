# Cycle 3 — Sales Pipeline Design

## Status

Design aprovado para o próximo ciclo do CRM Axesistemas. Nenhuma implementação de código deve iniciar antes da revisão deste documento e da elaboração do plano TDD correspondente.

## Objetivo

Entregar o núcleo comercial enxuto do CRM, permitindo que cada organização configure e opere seu próprio funil de vendas com oportunidades rastreáveis, sem incluir ainda tarefas/agenda ou dashboard gerencial.

O ciclo deve permitir, de ponta a ponta:

1. criar e consultar um funil comercial;
2. configurar e ordenar etapas;
3. criar uma oportunidade vinculada a uma empresa e opcionalmente a um contato;
4. atribuir responsável, valor estimado e previsão de fechamento;
5. mover a oportunidade entre etapas com histórico imutável;
6. encerrar a oportunidade como ganha ou perdida;
7. visualizar e operar oportunidades em uma interface Web com Kanban básico;
8. preservar isolamento multiempresa, RBAC, auditoria e rastreabilidade.

Checkpoint alvo: `v0.3.0-sales-pipeline`.

## Escopo incluído

### C3.1 — Contratos e modelo de domínio

Introduzir os contratos e entidades:

- `Pipeline`;
- `PipelineStage`;
- `Opportunity`;
- `OpportunityStageHistory`.

Todas as entidades devem pertencer explicitamente a uma `Organization` ou ser alcançáveis apenas por relações cujo tenant seja validado.

### C3.2 — Funis e etapas

Permitir:

- criar, listar, visualizar e editar funis;
- criar, editar, reordenar e inativar etapas;
- manter ao menos um funil padrão por organização;
- impedir que etapas de uma organização sejam usadas por outra;
- impedir que uma oportunidade seja movida para uma etapa pertencente a outro funil.

A exclusão física de funis/etapas não faz parte deste ciclo quando houver histórico ou oportunidades vinculadas. A abordagem preferencial é inativação lógica.

### C3.3 — Oportunidades

Cada oportunidade deve conter, no mínimo:

- `organizationId`;
- `pipelineId`;
- `stageId`;
- `companyId`;
- `contactId` opcional;
- `ownerUserId`;
- título;
- valor estimado;
- moeda;
- previsão de fechamento opcional;
- status `OPEN | WON | LOST`;
- motivo de perda opcional;
- timestamps de criação e atualização.

Operações mínimas:

- criar;
- listar;
- consultar detalhe;
- editar dados permitidos;
- filtrar por empresa, contato, responsável, etapa e status.

### C3.4 — Movimentação entre etapas

A mudança de etapa deve ser uma operação de domínio própria, não apenas um update genérico.

Cada movimentação deve:

1. validar tenant ativo;
2. validar que oportunidade e etapa pertencem à mesma organização;
3. validar que a etapa pertence ao mesmo funil da oportunidade;
4. atualizar a etapa atual da oportunidade;
5. registrar `OpportunityStageHistory` append-only com etapa anterior, nova etapa, usuário e data/hora.

O histórico de movimentação não deve ser editável nem excluível pela aplicação.

### C3.5 — Ganho e perda

Permitir encerrar uma oportunidade como:

- `WON`;
- `LOST`.

Regras:

- apenas oportunidades `OPEN` podem ser fechadas;
- fechar como `LOST` pode registrar motivo textual opcional neste ciclo;
- uma oportunidade fechada não pode voltar para `OPEN` neste ciclo;
- reabertura fica fora do escopo e, se desejada, entra em ciclo posterior;
- o fechamento deve gerar auditoria.

### C3.6 — Web

Entregar interface coerente com o App Shell existente:

- listagem de oportunidades;
- criação e edição;
- detalhe da oportunidade;
- Kanban básico por etapas do funil;
- movimentação controlada entre colunas;
- indicação visual de oportunidades ganhas/perdidas fora do fluxo aberto.

Drag-and-drop é desejável, mas não obrigatório para o aceite do ciclo. Caso introduza complexidade desnecessária, a movimentação pode inicialmente ser feita por ação explícita de mudança de etapa.

### C3.7 — Segurança, auditoria e E2E

Preservar integralmente os princípios dos Ciclos 1 e 2:

- isolamento multiempresa por `organizationId`;
- cross-tenant retorna 404 quando apropriado;
- escrita protegida por permissões;
- `VIEWER` permanece somente leitura;
- auditoria sem segredos;
- histórico de etapas append-only.

Jornada E2E mínima:

1. login;
2. selecionar/criar empresa;
3. criar oportunidade;
4. mover a oportunidade entre etapas;
5. fechar como ganha ou perdida;
6. recarregar a aplicação;
7. confirmar persistência da oportunidade e do histórico;
8. validar tentativa adversarial cross-tenant.

## Fora do escopo

Ficam explicitamente fora do Cycle 3:

- tarefas e compromissos;
- agenda;
- dashboard executivo;
- forecast avançado;
- produtos e catálogo;
- propostas e cotações;
- automações de funil;
- regras de distribuição;
- múltiplas moedas com conversão cambial;
- reabertura de oportunidades fechadas;
- metas e comissionamento;
- integrações externas.

Esses itens devem permanecer em backlog próprio e não podem ser absorvidos implicitamente durante a implementação.

## Arquitetura e limites

O Cycle 3 deve seguir a arquitetura já consolidada no CRM:

- Web em Next.js;
- API em NestJS;
- contratos TypeScript compartilhados;
- PostgreSQL + Prisma;
- monorepositório;
- Docker Compose;
- autenticação, RBAC, multiempresa e auditoria já existentes.

Nenhum novo serviço separado deve ser criado para este ciclo. O domínio comercial deve permanecer modular dentro da arquitetura atual, com baixo acoplamento e contratos explícitos.

## Modelo de relacionamento

Relações principais:

`Organization -> Pipeline -> PipelineStage`

`Organization -> Opportunity`

`Opportunity -> Company`

`Opportunity -> Contact?`

`Opportunity -> Owner User`

`Opportunity -> Pipeline`

`Opportunity -> Current PipelineStage`

`Opportunity -> OpportunityStageHistory[]`

O `Contact`, quando informado, deve pertencer à mesma organização da oportunidade e ser compatível com o vínculo comercial existente.

## Consistência e integridade

Devem existir validações em camada de aplicação e, quando apropriado, constraints no banco para evitar estados inválidos.

Exemplos obrigatórios:

- etapa de outro tenant não pode ser atribuída;
- empresa de outro tenant não pode ser vinculada;
- contato de outro tenant não pode ser vinculado;
- responsável precisa pertencer à organização ativa;
- oportunidade não pode apontar para etapa de outro funil;
- histórico de etapa não pode ser alterado depois de criado.

## Permissões

O desenho deve reutilizar o modelo de RBAC existente.

Permissões sugeridas:

- `opportunity.read`;
- `opportunity.write`;
- `pipeline.read`;
- `pipeline.write`.

Se o modelo atual favorecer agrupamento menor de permissões, o plano de implementação pode consolidá-las, desde que preserve:

- leitura separável de escrita;
- `VIEWER` sem mutações;
- auditoria das operações relevantes.

## Tratamento de erros

O ciclo deve reutilizar os padrões existentes de erro da API.

Casos principais:

- 400 para payload/regra de domínio inválida;
- 403 para ausência de permissão;
- 404 para recurso inexistente ou cross-tenant quando necessário para evitar vazamento de existência;
- 409 para conflito de estado quando fizer sentido, como tentativa de transição inválida de oportunidade já fechada.

## Estratégia TDD

A implementação deve ser dividida em microentregas sequenciais e verificáveis:

1. contratos e testes de domínio;
2. schema Prisma e migration reproduzível;
3. API de funis e etapas;
4. API de oportunidades;
5. operação de movimentação + histórico;
6. ganho/perda;
7. Web;
8. testes adversariais multiempresa;
9. E2E;
10. documentação, rollback e gate final.

Cada microentrega deve seguir Red -> Green -> Refactor e só avançar após seus testes específicos estarem verdes.

## Critérios de aceite do ciclo

O Cycle 3 só pode ser considerado tecnicamente concluído quando:

- migrations aplicam em PostgreSQL vazio;
- lint e typecheck estão verdes;
- testes unitários e de integração estão verdes;
- testes cross-tenant estão verdes;
- E2E do fluxo comercial está verde;
- builds de produção API/Web estão verdes;
- Docker Compose permanece válido;
- documentação e rollback estão atualizados;
- o mesmo SHA candidato passa pelo gate integral;
- aprovação pós-testes é explícita antes de merge no `main`.

## Rollback

Enquanto o Cycle 3 não estiver aprovado e integrado, o rollback oficial permanece no estado integrado após o Cycle 2.

O checkpoint alvo do novo ciclo é `v0.3.0-sales-pipeline`, a ser criado somente após gate integral verde e aprovação explícita.

## Correção documental

O backlog e roadmap antigos contêm marcações herdadas que indicam Oportunidades, Atividades e Painel como concluídos em uma implementação anterior. Durante o Cycle 3, a documentação deve ser reconciliada com a arquitetura vigente, distinguindo claramente:

- legado/anterior;
- implementado na nova arquitetura;
- planejado;
- fora de escopo.

Essa correção é documental e não autoriza implementação de Atividades ou Dashboard neste ciclo.

## Decisões do desenho

1. Cycle 3 é intencionalmente enxuto.
2. Atividades e Dashboard ficam para ciclo posterior.
3. Movimentação de etapa gera histórico imutável.
4. Reabertura de oportunidade fechada fica fora do escopo.
5. Multiempresa e RBAC são invariantes arquiteturais.
6. Não será criado novo serviço independente para o pipeline.
7. Drag-and-drop não é requisito bloqueante do aceite.
