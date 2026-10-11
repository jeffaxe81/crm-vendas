# F4.3-03A — fundação inbound de e-mail em quarentena

Issue: #128. Dependência: PR #127, workflow pós-merge na `main`.

## Escopo entregue

- Novo modelo `InboundMessage` e tabela `inbound_messages` com UUID, organização, canal, origem, hash opaco de identificador externo e datas.
- `channel=EMAIL` e `status=QUARANTINED` impostos por constraints do PostgreSQL. Nem o ORM pode promover uma mensagem a estado processado nesta fase.
- Chave única `(organization_id, channel, source_key, external_id_hash)`: repetição idêntica no mesmo tenant é idempotente; eventos de tenants distintos não colidem.
- `ENABLE/FORCE ROW LEVEL SECURITY`, `WITH CHECK` por organização e gatilho de bloqueio de manutenção/recovery.
- Inventário de backup: `export=EXCLUDE` e `restore=PRESERVE`, inclusive para evitar duplicação/reprocessamento após restauração.
- Testes reais com papel PostgreSQL restrito cobrem RLS, deduplicação, constraints, imutabilidade lógica da quarentena e ausência de conteúdo sensível.

## Limites explícitos

Não há endpoint público, controller, worker, scheduler, ingestão de webhook, envio de mensagens, vinculação a tickets/contatos, triagem automatizada ou ativação do relay. O `EmailModule` continua utilizando `DisabledEmailProvider`.

A tabela **não tem coluna de corpo, assunto, remetente, destinatário, anexos, credencial ou identificador externo em texto claro**. A coluna `external_id_hash` tem 64 caracteres hexadecimais minúsculos. No futuro deverá receber HMAC-SHA256 com segredo gerenciado, aplicado a um ID autenticado do provedor. Não persistir SHA-256 sem segredo sobre identificadores previsíveis. O armazenamento criptografado de conteúdo ficará para outra entrega com chave segregada, retenção, backup e autorização explícitos.

`source_key` é um identificador técnico não secreto e cadastrado em configuração confiável. Não aceitar nem copiar um `sourceKey`, `organizationId` ou outro valor de identidade fornecido no payload externo. O receptor futuro deve **primeiro** verificar a assinatura/autenticidade do provedor e resolver organização por vínculo confiável e inequívoco; caso contrário, rejeitar sem qualquer escrita.

## Etapas posteriores (fora desta PR)

1. Definir modelo de configuração de origens e resolver tenant por vínculo autenticado.
2. Verificar assinatura antes de processar corpo ou metadados.
3. Definir armazenamento cifrado, retenção, exclusão, capacidade e logs minimizados.
4. Implementar endpoint + service de ingestão com transação idempotente e rejeição de ambiguidades.
5. Implementar triagem humana auditável e vínculo opcional com Contato/Solicitação.
6. Homologar comunicação e considerar reutilização restrita para WhatsApp somente em F4.4, após revisão própria.

## Critérios de liberação

CI integral verde (PostgreSQL/RLS, API, contratos, frontend, E2E, Compose e imagens); revisão humana do diff e segurança. Esta entrega não equivale a aceite para conexão externa, pois nenhum provedor está integrado.
