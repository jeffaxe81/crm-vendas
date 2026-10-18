# CRM-Vendas — gate interno de confirmação de restauração

## Estado da entrega

O conjunto fornece `consumeRestoreConfirmation` e um executor interno limitado
ao grafo descrito ao final. A orquestração futura deve reuni-los na **mesma
transação de manutenção**, com cópia preventiva verificada. A restauração
completa, sua rota HTTP e seu botão permanecem pendentes. O incremento não
autoriza GO de produção.

## Restrições já verificadas pelo gate

- Somente principal com sessão humana e atributo `isSuperuser`; revalida
  associação ativa, usuário ativo e sessão não revogada.
- Exige a senha atual do usuário e a expressão exata `RESTAURAR DADOS`.
  A senha nunca é registrada em auditoria e o erro genérico evita revelar
  se o identificador da prévia, o vínculo da sessão ou a senha estavam errados.
- A prévia deve estar vigente, não consumida, e associada à organização,
  executor, sessão, backup e checksum verificado.
- Exige execução dentro de `withMaintenance` com isolamento
  `RepeatableRead` ou `Serializable`. O snapshot atual é lido nesse
  mesmo contexto, sob bloqueio exclusivo das escritas do tenant, e comparado
  com o fingerprint registrado na prévia.
- `withMaintenance` espera as escritas anteriores usando uma sessão dedicada,
  antes de iniciar a transação que fixa o snapshot. A transação deve usar o
  mesmo backend PostgreSQL que possui o lock; troca de conexão aborta a
  operação. O lock permanece até o commit/rollback e o fechamento da sessão,
  com espera limitada pelo timeout da operação.
- Confirmação consumida e auditoria participam da transação: se a futura
  restauração falhar, ambas devem ser revertidas.

## Pré-validação relacional adicional

A prévia agora verifica, de maneira **somente leitura**, as referências internas
do snapshot verificado usando o inventário de modelos e relações do Prisma,
incluindo vínculos compostos com a organização e associações de usuários.
Referências ausentes retornam `BACKUP_REFERENCES_INVALID` e impedem criar
uma prévia aparentemente válida. A checagem não modifica dados e não substitui
as verificações de integridade, políticas especiais e constraints no banco de
destino. Referências para modelos preservados/ausentes do snapshot não são
inferidas; deverão ser checadas pelo restaurador futuro no banco de destino.

## Pré-validação de identidades no banco atual

A prévia também compara os identificadores e e-mails de usuários referenciados
pelo backup com os usuários reais do banco, dentro de uma transação de leitura
`RepeatableRead` sob RLS. Falha quando o usuário referenciado não existe
(`RESTORE_USER_REFERENCE_MISSING`) ou o identificador passou a corresponder
a outro e-mail (`RESTORE_USER_IDENTITY_CHANGED`). Um ID de associação existente
não pode passar a representar outro usuário
(`RESTORE_MEMBERSHIP_IDENTITY_CHANGED`). Não são restaurados senhas, sessões,
credenciais nem privilégios de Superusuário nessa etapa.

Esta é uma checagem preliminar, não uma garantia de compatibilidade futura.
O executor deverá repeti-la **sob lock exclusivo**, validar todas as políticas
de modelos preservados, possíveis conflitos de unicidade e referências externas,
e somente então aplicar a restauração com rollback integral.

## Bloqueio antecipado de políticas não suportadas

Antes de consumir a confirmação de uso único, `preflightRestoreExecution`
recalcula, sob o lock de manutenção, as contagens do estado atual e compara
com o manifesto autenticado do backup. Caso algum modelo `REPLACE` ainda não
implementado pelo executor contenha registros no destino **ou** na cópia, falha
com `RESTORE_POLICY_UNSUPPORTED`. A confirmação continua disponível e os
dados não são alterados. Testes PostgreSQL/RLS cobrem ambos os sentidos.

Isso é uma proteção adicional, não autorização para executar restauração:
políticas especiais, backup preventivo e fluxo HTTP/UI continuam pendentes.

## Faltam antes de expor um botão RESTAURAR

1. Implementar e testar o restaurador de todos os modelos exportáveis e as
   políticas especiais (usuários referenciados, associação Superusuário,
   credenciais, tokens de pesquisa e sequenciadores).
2. Após adquirir o lock exclusivo e aguardar o commit das escritas anteriores,
   criar, verificar e proteger a cópia preventiva do estado atual, antes de
   substituir dados e sem liberar o mesmo lock de manutenção.
3. Preparar dados e validar todas as dependências antes de apagar/substituir.
4. Dentro da **mesma** transação exclusiva: revalidar/consumir confirmação,
   aplicar substituição, registrar auditoria de sucesso e revogar sessões.
5. Validar concorrência entre réplicas, corrupção, quota de armazenamento,
   falha de checksum, erro de FK, lock, RLS, expiração, dados alterados,
   confirmação duplicada e rollback completo.
6. Acrescentar rate limit contra tentativas de senha e confirmação, APIs com
   autorização e UX de dupla confirmação. Homologar somente em PostgreSQL
   de teste ou cópia descartável do ambiente Rocky Linux.

O gate não deve ser invocado isoladamente como sinal de restauração concluída.

## Executor interno dos subconjuntos revisados

O executor transacional interno já substitui `Company`, `Contact`,
`ContactChannel`, `CompanyContact`, `RelationshipEntry`, `Tag`,
`CompanyTag`, `ContactTag`, `Pipeline`, `PipelineStage`, `Product`,
`Opportunity`, `OpportunityItem`, `Activity`, `Territory`, `TerritoryQuota`,
`TerritoryTarget`, `TerritoryMetrics`, `SupportQueue`, `SlaPolicy`,
`CustomFieldDefinition`, `CompanyCustomFieldValue`, `ContactCustomFieldValue`
e `UserWorkspacePreference` (24 modelos).
Prepara todos os registros antes da primeira
exclusão, verifica referências e identidades sob o lock exclusivo, remove
primeiro os vínculos empresa/contato-etiqueta e demais dependências, depois
os registros pais, e reinsere pais antes dos vínculos. Falha de constraint
reverte a transação inteira. Datas são convertidas diretamente pelo
PostgreSQL, preservando seis dígitos de microssegundos do snapshot; enums
usam o mapeamento do esquema revisado. Valores `Decimal` são vinculados como
strings e convertidos diretamente pelo banco; valores numéricos JavaScript
nesses campos são rejeitados antes das exclusões.

Como associações de usuários são preservadas neste incremento, o executor
revalida também a existência de `(organizationId, ownerUserId)` para cada
oportunidade e de `(organizationId, userId)` para cada preferência de workspace
no banco atual, sob o mesmo lock e antes da primeira exclusão.
Um usuário global existente sem essa associação falha com
`RESTORE_MEMBERSHIP_REFERENCE_MISSING`. Uma associação recriada com outro ID
para o mesmo par organização/usuário é aceita; os privilégios atuais continuam
preservados. A checagem preliminar de identidades da prévia mantém seu contrato
independente das políticas futuras de restauração de associações.

Testes PostgreSQL/RLS comprovam ida e volta dos dois tipos de etiquetas,
exclusão de associações criadas após a cópia, rejeição de referência quebrada,
rollback de falha tardia de unicidade, preservação de outro tenant e
preservação de associação Superusuário. Etiquetas, funis e etapas agora
integram o subconjunto interno implementado. Testes PostgreSQL/RLS dos
funis comprovam também ida e volta de etapas (inclusive enum OPEN/WON/LOST),
rejeição de FK de etapa inválida antes de exclusões, rollback por conflito
de posição, isolamento entre tenants e remoção de registros novos ausentes
no backup. O grafo comercial acrescenta cobertura PostgreSQL/RLS para
preços além da precisão inteira do JavaScript, quantidades fracionárias,
microssegundos, dois tipos de cliente da oportunidade, FKs quebradas ou de
outro tenant, associação do responsável removida/recriada e rollback tardio
de constraint de quantidade. `Ticket` e os demais modelos ainda não
implementados continuam bloqueando a execução quando presentes em qualquer lado.

O subconjunto de territórios recupera cotas de vendas por período, empresas
vinculadas e métricas armazenadas, preservando seus valores decimais e datas.
As dependências de território e empresa são preparadas antes da primeira
exclusão. Filas e políticas de SLA recuperam prioridades, prazos, flags e
exclusão lógica. A cobertura PostgreSQL inclui os índices legados e específicos
de mês/trimestre/ano, referências ausentes ou de outro tenant, usuário histórico
removido, conflito do nome de fila e falhas tardias de cotas e SLA.

Um `Ticket` vinculado a uma fila continua impedindo o restore quando presente
somente no estado atual ou somente no backup. Protocolos, eventos e pesquisas
de satisfação ainda dependem de políticas próprias; este incremento não expõe
recuperação de chamados.

Campos personalizados recuperam definições e valores de empresas/contatos,
respeitando a ordem de dependências. O formato existente do snapshot guarda
colunas `Json` como texto bruto do PostgreSQL: `null` em JavaScript representa
SQL NULL e a string `"null"` representa JSON null. O executor valida o tipo e a
sintaxe desse texto antes das exclusões e usa extração/cast nativos do banco,
sem reserializar o resultado de `JSON.parse`. Assim preserva números grandes,
frações, objetos, arrays, strings e a distinção entre os dois tipos de nulo.
Preferências de workspace seguem o mesmo mecanismo e exigem a associação
atual do usuário; não restauram identidades ou privilégios históricos.

Os novos casos PostgreSQL/RLS cobrem ida e volta criptografada, precisão de
JSON e microssegundos, cópia vazia, referências inválidas, associação removida
ou recriada e rollback por constraints reais. A integração deste incremento
exige o resultado real do CI completo, registrado no PR #259, além do CI de
`push/main` e manifesto do commit final.

Este executor rejeita modelos `REPLACE` ainda não suportados quando há
registros no backup **ou no estado atual** da organização. Usuários globais,
senhas, associações, privilégios, sessões, credenciais e auditoria não são
substituídos por esse incremento. A raiz `Organization` é validada como
destino, mas sua configuração ainda não é recuperada.

Continua sendo uma função interna sem rota, botão ou operação de worker de
restauração. A implementação dos demais modelos e políticas especiais, cópia
preventiva, confirmação, auditoria de sucesso e revogação de sessões ainda
precisa ser integrada antes de disponibilizar restauração completa ao usuário.
