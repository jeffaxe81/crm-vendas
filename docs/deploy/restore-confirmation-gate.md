# CRM-Vendas — gate interno de confirmação de restauração

## Estado da entrega

Este incremento fornece somente `consumeRestoreConfirmation`, uma função interna
que deve participar da **mesma transação de manutenção** de uma futura
restauração. **Não implementa a substituição de dados e não cria rota HTTP,
botão ou comando de restauração.** Não autoriza GO de produção.

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

## Executor interno de empresas, contatos e etiquetas

O executor transacional interno já substitui `Company`, `Contact`,
`ContactChannel`, `CompanyContact`, `RelationshipEntry`, `Tag`,
`CompanyTag` e `ContactTag`. Prepara todos os registros antes da primeira
exclusão, verifica referências e identidades sob o lock exclusivo, remove
primeiro os vínculos empresa/contato-etiqueta e demais dependências, depois
os registros pais, e reinsere pais antes dos vínculos. Falha de constraint
reverte a transação inteira. Datas são convertidas diretamente pelo
PostgreSQL, preservando seis dígitos de microssegundos do snapshot; enums
usam o mapeamento do esquema revisado.

Testes PostgreSQL/RLS comprovam ida e volta dos dois tipos de etiquetas,
exclusão de associações criadas após a cópia, rejeição de referência quebrada,
rollback de falha tardia de unicidade, preservação de outro tenant e
preservação de associação Superusuário. Etiquetas estão agora no subconjunto
interno implementado; modelos como `Pipeline` continuam bloqueados quando
têm registros no backup ou no estado atual.

Este executor rejeita modelos `REPLACE` ainda não suportados quando há
registros no backup **ou no estado atual** da organização. Usuários globais,
senhas, associações, privilégios, sessões, credenciais e auditoria não são
substituídos por esse incremento. A raiz `Organization` é validada como
destino, mas sua configuração ainda não é recuperada.

Continua sendo uma função interna sem rota, botão ou operação de worker de
restauração. A implementação dos demais modelos e políticas especiais, cópia
preventiva, confirmação, auditoria de sucesso e revogação de sessões ainda
precisa ser integrada antes de disponibilizar restauração completa ao usuário.
