# Decisões, Riscos, Pendências e Histórico de Versões

## Registro de decisões

| ID | Decisão | Motivo | Impacto |
|---|---|---|---|
| DEC-01 | O MVP prioriza gestão comercial e vendas. | Direcionamento confirmado pelo solicitante. | Atendimento será um módulo posterior. |
| DEC-02 | O produto inicia com pessoas e empresas em uma estrutura de clientes. | Permite o fluxo comercial básico sem duplicar telas. | Contatos podem ser vinculados a empresas. |
| DEC-03 | O funil inicia com etapas padrão. | Não foram fornecidas etapas proprietárias. | Etapas serão configuráveis em evolução futura. |
| DEC-04 | A exclusão será lógica nos registros de domínio. | Preservação de histórico e auditabilidade. | As listas operacionais exibem somente registros ativos por padrão. |
| DEC-05 | A identidade usa a autenticação nativa da plataforma. | O projeto já oferece sessão segura. | Sem senha local armazenada pela aplicação. |
| DEC-06 | Implementar exclusivamente a Fase 1 neste incremento. | Direcionamento confirmado pelo solicitante. | Fases 2 a 6 seguem documentadas, mas sem código antecipado. |

## Riscos e pendências

| ID | Tema | Impacto | Tratamento |
|---|---|---|---|
| RSK-01 | Perfis detalhados não foram definidos. | Médio | Implementar administrador e usuário padrão no MVP; evoluir matriz posteriormente. |
| RSK-02 | Etapas, campos obrigatórios e métricas específicas do processo comercial não foram definidos. | Médio | Adotar estrutura mínima e documentar futura parametrização. |
| RSK-03 | Requisitos operacionais de LGPD por setor ainda não foram detalhados. | Médio | Preservar controle de acesso, minimização de dados e rastreabilidade; avaliar requisitos específicos antes de dados reais. |

## Histórico de versões

| Versão | Data | Descrição |
|---|---|---|
| 0.1.0 | 25/08/2026 | Escopo documentado do MVP comercial e início da implementação. |
| 0.2.0 | 25/08/2026 | Implementado o MVP comercial com clientes, contatos, oportunidades, atividades, interações, painel, auditoria, testes e revisão responsiva. |
| 0.2.1 | 25/08/2026 | Finalizados os critérios de qualidade: registros ativos preservados, contatos paginados e filtráveis, edição integral de oportunidades e estados de erro nas consultas. |
| 0.2.2 | 25/08/2026 | Finalizados os controles de inativação de oportunidades, atividades e interações, com auditoria e validação técnica da Fase 1. |
