# F4.3-02D4 — dupla checagem das evidências do relay

Data: 10/10/2026. Base: PR #123, dependente da cadeia #117–#122.

## Implementação

- O registro append-only de evidência passa a capturar a versão da configuração `EmailRelaySettings` observada no momento da submissão, inclusive versão 0 quando não existe configuração. O valor é uma informação operacional, não um certificado.
- `POST /admin/email/relay-evidence/:evidenceId/review` aceita somente decisões `CHECKED` (referência examinada) ou `REJECTED`, sem campo de texto livre ou segredo. Exige autenticação, permissão `integration.manage` e vínculo ADMIN ativo.
- **Segregação de atores:** o próprio autor não pode revisar a referência. A revisão precisa ser feita por outro administrador ativo da mesma organização; revisão entre tenants não é aceita.
- **Concorrência e imutabilidade:** a linha original de auditoria é bloqueada com `FOR UPDATE` enquanto a revisão é validada e registrada numa segunda linha de `audit_logs`. Um único julgamento por referência, sem sobrescrever os registros anteriores; tentativas duplicadas falham com conflito.
- **Versionamento:** se a configuração mudou desde a submissão, a revisão é recusada, exigindo uma nova referência adequada à configuração atual. Se a versão mudar depois da revisão, o painel sinaliza revisão desatualizada.
- `GET /admin/email/relay-evidence` devolve uma projeção tipada das evidências e, quando presente, da revisão independente: decisão, ator, data e versão. Não retorna payload de auditoria arbitrário.
- A interface existente de Integrações continua com carregamento do diagnóstico **sob demanda**. Permite que um administrador diferente do autor marque uma referência como analisada ou rejeitada, com destaque quando a configuração mudou.

## Fronteira de segurança

**Não há aprovação de provedor nem envio.** `CHECKED` significa apenas que um segundo operador examinou a referência opaca; não valida automaticamente idempotência durável, restrição de saída da rede, DNS/TLS ou autorização real de operação. A coluna `verification` da evidência permanece `SUBMITTED_UNVERIFIED`; a revisão retorna `REVIEWED_NOT_CERTIFIED`.

`EmailRelayReadinessService` continua retornando `NOT_VERIFIED` para todas as provas externas, `senderRegistration: BLOCKED`, `sendingEnabled: false`, `activationEligible: false`. O `EmailModule` continua utilizando `DisabledEmailProvider`, sem rotina de disparo externo.

## Validação

Testes PostgreSQL/RLS verificam segregação de usuários, cross-tenant, rejeição, versão alterada, concorrência de revisores, registro único, integridade de auditoria e invariância dos gates de envio.

Permanecer como Draft até CI integral e revisão independente de toda a cadeia, com merge apenas na sequência #117 → #118 → #119 → #120 → #121 → #122 → #123 → esta PR.
