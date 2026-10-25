# CRM — consolidação de produtividade, cinco meses antecipados

Registro: 25/10/2026. Branch: `feat/crm-productivity-consolidated-five-months-20261025`.
Base de criação: PR #308, originada de `main@4512cf187b0ffdf203f0002fae5b566f6270521e`.
Fonte dos filtros: PR #307. Ambas as PRs de origem permanecem intactas.

## Candidato unificado

- **Contatos:** pesquisa local, filtros com/sem canais, ordenação, limpeza de
  filtros e exportação VCF **dos contatos visíveis**.
- **Empresas:** pesquisa ampliada, filtros por nome fantasia, ordenação,
  limpeza de filtros e CSV **das empresas visíveis**.
- **Atividades:** filtros locais de prioridade/prazo, limpeza de filtros e
  calendário ICS **das atividades visíveis** que possuem prazo.
- **Oportunidades:** filtros locais por cliente e previsão, ordenação, limpeza
  de filtros e CSV **das oportunidades visíveis** na lista.
- **Agenda:** exportação em ICS da página carregada.

A exportação é iniciada por clique do usuário e utiliza somente registros
já retornados à interface autenticada. A paginação continua sendo aplicada;
**não se trata de exportação completa do tenant**. A visão Kanban não recebe
novos filtros; o filtro de oportunidades destina-se ao modo lista.

## Governança

- Nenhuma operação de escrita, endpoint, migração ou regra RLS foi alterada.
- CSV/VCF/ICS podem conter dados pessoais e comerciais: revisar permissão
  específica de exportação, finalidade, retenção e auditoria antes de deploy.
- Horários ICS são _provisórios_, não convocam participantes e não sincronizam
  calendários. Conferir eventuais duplicações após importação.
- **Sem execução manual nem inclusão de testes** nesta rodada a pedido do
  usuário. Construção, formatação, segurança e homologação não foram
  aprovadas por esta execução.
- A CI automática da PR #308 falhou anteriormente em formatação; não declarar
  qualidade verde sem validação no SHA final. A consolidação pode introduzir
  conflitos de estilo que exigirão revisão posterior.
- Não aprovar merge automático. Manter draft e preservar as PRs de origem.
