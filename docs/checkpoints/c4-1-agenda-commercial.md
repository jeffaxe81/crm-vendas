# Checkpoint — C4.1 Agenda Comercial

## Estado

- fase: 2 — Produtividade;
- microentrega: C4.1 — Agenda Comercial;
- branch: `feat/c4-1-agenda-commercial`;
- PR: #37;
- base: `main` em `6cfaa8184e94c015cfc60bbac1c1a5f237a6aadf`;
- design: `docs/superpowers/specs/2026-09-12-c4-1-agenda-commercial-design.md`;
- plano: `docs/superpowers/plans/2026-09-12-c4-1-agenda-commercial.md`.

O workflow final executado sobre o SHA candidato definitivo deve ser registrado no body do PR #37. Isso mantém o commit documental testável sem tentar gravar dentro do próprio commit o SHA que só passa a existir depois da gravação.

## Escopo implementado

A Agenda Comercial foi construída como projeção de leitura do domínio canônico `Activity`, sem criar tabela, migration ou endpoint novo.

- `GET /api/v1/activities` permanece a única fonte da agenda;
- `dueFrom` e `dueTo` delimitam a janela temporal;
- janela invertida (`dueFrom > dueTo`) é rejeitada no contrato compartilhado;
- a comparação considera o instante absoluto, inclusive com offsets diferentes;
- a Agenda utiliza `ownerUserId` do usuário autenticado na interface;
- ordenação por `dueAt` ascendente;
- navegação semanal por `Anterior`, `Hoje` e `Próximo`;
- filtros por tipo, status e prioridade;
- agrupamento visual por dia;
- estados de carregamento, vazio e erro;
- acesso à navegação condicionado a `activity.read`;
- criação e alteração continuam na tela de Atividades.

## Segurança e multiempresa

Nenhum tenant é aceito da interface como fonte de autorização. A API continua derivando `organizationId` do principal autenticado e executando as consultas no contexto tenant-aware existente.

A C4.1 não cria nova permissão: reutiliza `activity.read`.

## Evidência de desenvolvimento

O primeiro candidato registrou o teste da regra de janela temporal em `08cca77200b5735ebcd60b3fb5b720bd6ad1fb56`. O workflow #644 avançou normalmente por infraestrutura, Prisma, migrations e provisionamento do role de aplicação e falhou no passo `Verify source and tests`, antes do GREEN.

Por decisão de produto durante a execução, as verificações intermediárias seguintes foram condensadas em um único gate completo ao final da microentrega, priorizando velocidade sem remover a validação final.

## Fora do escopo

- calendário mensal gráfico;
- drag-and-drop;
- recorrência;
- lembretes e notificações;
- Google Calendar ou Outlook;
- automações;
- IA;
- edição inline;
- novo endpoint `/agenda`;
- novo armazenamento;
- novas permissões.

## Gate de integração

O PR #37 permanece Draft até a execução do gate final completo. O merge não deve ocorrer sem workflow GREEN no head candidato e aprovação humana explícita específica para o PR #37.
