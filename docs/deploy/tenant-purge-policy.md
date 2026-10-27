# Política de expurgo técnico por tenant

Cada organização mantém uma política independente em `purge_policies`, sob
FORCE RLS e bloqueio de manutenção. O padrão é **desativado**. Somente sessão
humana de Superusuário pode usar `GET/PUT /api/v1/admin/purge/policy` e
`POST /api/v1/admin/purge/simulate`. API keys não atendem a esse requisito.
Habilitar ou alterar uma política habilitada exige `ATIVAR EXPURGO`.

## Categorias e compatibilidade

- `EXPIRED_OPERATION_PREVIEWS`: prévias cuja expiração é anterior ao corte,
  sem referência em `data_operations.payload.previewId` (inclusive execuções
  concluídas). É a única categoria padrão, inclusive para políticas existentes.
- `TERMINAL_WEBHOOK_DELIVERIES`: tentativas antigas cujo despacho está em
  `DELIVERED`, `EXHAUSTED` ou `CANCELLED`, sem lease, e cujo `updated_at`
  também é anterior ao corte. Exige seleção explícita. O despacho e a
  assinatura permanecem intactos; apenas as linhas de tentativas são removidas.

`categories` aceita somente essas categorias, sem duplicações e sem lista
vazia. Clientes antigos que omitem `categories` preservam a seleção já salva;
na criação recebem somente a categoria de prévias. A migração não amplia
nenhuma política habilitada.

Preserva prévias ativas ou referenciadas, trabalhos e filas, cadastros,
contatos, oportunidades, tickets, usuários, credenciais, anexos, auditoria e
backups. Não constitui exclusão comercial nem restauração.

## Simulação

```json
{
  "retentionDays": 90,
  "categories": ["EXPIRED_OPERATION_PREVIEWS", "TERMINAL_WEBHOOK_DELIVERIES"]
}
```

Envie ao endpoint `POST /api/v1/admin/purge/simulate`. Retorna `dryRun`,
`cutoff`, `counts` por categoria, `estimatedRecords` e `batchSize: 500`.
É uma leitura consistente em transação Repeatable Read, sem atualizar política,
última execução, auditoria ou qualquer outro registro. Não requer habilitar a
política nem confirmação de exclusão. A interface permite simular a seleção
antes de salvar, nas línguas português, inglês e espanhol.

As contagens são exatas para o snapshot e os predicados apresentados, não uma
reserva de linhas: o número pode mudar até a execução por envelhecimento ou
atividade concorrente. A execução usa os mesmos predicados, com limite por
categoria. Os campos legados `target` e a ação de auditoria
`purge.expired_previews_completed` permanecem por compatibilidade; `categories`
e `counts` descrevem o escopo efetivamente executado.

## Execução e segurança

- Retenção de 30 a 3650 dias; padrão 180 dias. Corte exclusivo (`<`), desde a
  expiração da prévia ou, para webhooks, tanto a criação da tentativa quanto
  a última atualização do despacho encerrado.
- Verificação na inicialização e a cada hora; no máximo uma passagem por
  tenant a cada 24 horas, sem rajadas de recuperação.
- No máximo **500 registros por categoria**, portanto até 1000 quando ambas
  estiverem selecionadas. O excedente fica para ciclos seguintes.
- Seleção, exclusão, atualização de `lastRunAt` e auditoria compartilham
  transação. Falha na auditoria desfaz integralmente a passagem.
- Bloqueio consultivo por tenant impede dupla execução entre réplicas e
  serializa alteração da política com exclusão.
- O trigger de imutabilidade de tentativas continua proibindo atualizações
  e exclusões comuns. A exceção exige contexto transacional de expurgo,
  tenant correto, política habilitada com categoria explícita, retenção
  válida e despacho terminal sem lease. FORCE RLS e o guard de manutenção
  continuam ativos; não há SECURITY DEFINER nem bypass RLS.
- Auditoria contém categorias, contagens, retenção, corte e limite. Não
  contém payloads, destinos ou segredos. Falhas da rotina geram somente
  mensagem fixa no servidor, sem stack/payload de exceções.

A migração `20261025191000_technical_purge_categories` deve ser aplicada pelo
fluxo normal de migrações, com geração do Prisma Client e reconstrução da API.
Não execute SQL de expurgo ad hoc, `TRUNCATE` ou bypass RLS em produção.
A exclusão de linhas não reduz imediatamente o arquivo físico PostgreSQL;
VACUUM e gerenciamento do volume pertencem à manutenção DBA. Retenção de
arquivos de backup e quotas são configurações separadas.
