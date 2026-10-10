# F4.3-02B2A — revalidação de alertas na expedição

Data: 10/10/2026. Entrega empilhada sobre F4.3-02B1 (PR #117, SHA 5983595e4b28555c00ee9a54f3d568a3528249cf).

## Controles implementados

- Antes de enviar, `EmailOutboxWorker` reconsulta o ticket em `withTenant`/RLS e verifica organização ativa, status em andamento, ticket não excluído, membro atribuído ativo e usuário ativo.
- Compara destinatário com o e-mail atual do responsável e o SLA atualmente elegível (janela de até 30 minutos), usando a identidade de idempotência que contém o prazo.
- Mudança de responsável, alteração de prazo, encerramento, inativação ou evento não autorizado finaliza a entrada como `CANCELLED`, sem chamar provedor nem agendar nova tentativa.
- O fluxo `SATISFACTION_REQUEST` permanece bloqueado até existir regra explícita de consentimento.
- Falha de consulta / revalidação por exceção não gera envio; a tentativa pode ser reagendada pela política existente.
- Testes PostgreSQL com role RLS para aceitação válida, retry, mudança de prazo, encerramento, reatribuição e bloqueio de CSAT.

## Limites deliberados

- A leitura do estado atual e o envio externo não são atômicos: uma mudança simultânea depois da consulta exige controle transacional/versão adicional em etapa futura para garantia mais forte.
- Para evitar duplicatas na incerteza entre a aceitação remota e a confirmação no banco, ainda é obrigatório adicionar um adaptador de provedor com suporte a chave de idempotência e política para timeouts.
- Polling e transportador real continuam desativados; `DisabledEmailProvider` permanece como padrão. Não ligar envio externo neste incremento.
- Revalidação atual não é concessão de autorização para envio de CSAT; não habilitar sem consentimento e trilha de auditoria.
- Após a aprovação e merge de #117 na main, rebase/rebase via PR desta entrega e reexecutar testes; o PR dependente não deve ser mesclado primeiro.

## Gate

Executar CI completo (tipos, lint, formatação, PostgreSQL/RLS, testes de API, E2E e build) e obter revisão independente. A branch main permanece protegida.
