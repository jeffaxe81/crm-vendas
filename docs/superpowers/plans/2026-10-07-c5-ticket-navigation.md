# C5 — Correções de navegação de atendimento

**Objetivo:** corrigir as lacunas verificadas na auditoria do C5 existente, sem ampliar os canais de atendimento.

**Arquitetura:** manter a API de tickets atual; isolar estado de detalhe por ID React e consumir paginação existente. Preservar RBAC, filtros e contratos.

**Referência:** docs/checkpoints/c5-1-tickets-foundation.md e auditoria do componente TicketsView.

## Execução

- [ ] Reproduzir troca A→B com rascunho e resposta pendente; garantir que B não herde comentários/eventos de A.
- [ ] Adicionar key por ID em TicketDetail; validar testes.
- [ ] Reproduzir acesso ao chamado 51 e troca de filtros após página 2.
- [ ] Implementar página/total, Anterior/Próxima, retorno à página 1 nos filtros e ajuste de página fora do total; fechar detalhe ao mudar página/filtro.
- [ ] Executar testes Web, revisão e quality gate completo antes do merge.

**Arquivos:** apps/web/src/app/tickets/tickets-view.tsx e tickets-view.test.tsx.
**Revisão:** resposta atrasada, filtro sem resultado, página removida por alteração concorrente, perfil sem escrita, total ausente em fixtures antigas.
