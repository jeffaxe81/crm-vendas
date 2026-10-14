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

## Faltam antes de expor um botão RESTAURAR

1. Implementar e testar o restaurador de todos os modelos exportáveis e as
   políticas especiais (usuários referenciados, associação Superusuário,
   credenciais, tokens de pesquisa e sequenciadores).
2. Verificar e proteger a cópia preventiva do estado atual antes da transação.
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
