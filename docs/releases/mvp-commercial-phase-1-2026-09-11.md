# Release — MVP Comercial — Fase 1

Data de fechamento: 11/09/2026

## Identificação canônica

- Marco: `MVP Comercial — Fase 1`.
- Baseline de fechamento: `main` em `f6104e4f065998693fa6cdfb0ffeb5afe7b8ac01`.
- Última microentrega funcional integrada: C3.6.6 — Opportunities Web / Movimentação de Etapa.
- PR de integração funcional final: #33.
- Head funcional aprovado do PR #33: `c58f2a9a8a5bdf2a7caca91019638c2933226761`.
- Gate funcional final antes da integração: workflow `34592874399` / Gate #629 — GREEN.
- Merge commit da C3.6.6: `f6104e4f065998693fa6cdfb0ffeb5afe7b8ac01`.

## Escopo fechado

A release encerra exclusivamente a Fase 1 — MVP Comercial. Permanecem fora deste fechamento as Fases 2 a 6 e qualquer funcionalidade futura ainda registrada apenas em roadmap ou Banco de Ideias.

O MVP fechado contém:

- autenticação e sessão locais;
- organizações, memberships, RBAC e auditoria;
- empresas, contatos, canais, vínculos e histórico de relacionamento;
- atividades e compromissos com lifecycle operacional;
- funil comercial tenant-aware;
- oportunidades tenant-aware com criação, consulta, edição por API, movimentação controlada de etapa, concorrência otimista e soft delete;
- Web de oportunidades com lista, criação e movimentação de etapa;
- isolamento multiempresa com PostgreSQL RLS fail-closed e `FORCE ROW LEVEL SECURITY`;
- testes automatizados, E2E, validação de Compose e build de imagens no quality gate.

## Validação funcional de fechamento

O fluxo comercial mínimo definido para a Fase 1 está coberto pelas jornadas E2E canônicas do repositório:

1. empresa e contato são criados, canal e vínculo comercial são persistidos e o histórico permanece após reload;
2. atividade é criada, concluída e consultada no estado concluído;
3. oportunidade é criada para uma empresa, movimentada entre etapas do mesmo funil e a nova etapa permanece após reload.

Os critérios funcionais consolidados do backlog da sprint estão marcados como concluídos para modelo de dados, clientes/contatos, oportunidades/funil, atividades/interações, painel/auditoria e qualidade.

## Segurança e qualidade preservadas

- nenhum bypass de RLS é permitido;
- a role da aplicação é provisionada sem `BYPASSRLS`;
- APIs e mutações permanecem tenant-aware;
- RBAC permanece explícito;
- auditoria e soft delete preservam histórico;
- o fechamento da release não autoriza implementação das Fases 2 a 6.

## Versionamento

Este fechamento não atribui um novo número SemVer. O repositório contém históricos de versão de gerações anteriores que não estão totalmente alinhados entre os documentos atuais; por isso, a identificação desta release é feita pelo marco, data e SHA até que o versionamento canônico seja normalizado em decisão própria.

## Gate de fechamento

Este documento e a atualização do roadmap devem passar pelo quality gate completo do repositório em PR próprio. O fechamento só deve ser integrado à `main` após o gate ficar GREEN e o gate humano de integração ser respeitado.
