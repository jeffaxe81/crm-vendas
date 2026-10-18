# CRM — campos personalizados e workspace no executor interno

## Escopo

Base: `main` em `ef793e79a18ecc73928bfeb9abc4a60cc836e71e`, após a PR #258.
Entrega e evidências de integração:
[PR #259](https://github.com/jeffaxe81/crm-vendas/pull/259).
Continuação da Task 4 do [plano aprovado de backup](../superpowers/plans/2026-10-05-crm-backup.md)
e da [meta de antecipação de quatro meses](../superpowers/plans/2026-10-18-four-month-crm-acceleration.md).

O executor interno passa de 20 para 24 modelos:

| Modelo                    | Dados recuperados                                            |
| ------------------------- | ------------------------------------------------------------ |
| `CustomFieldDefinition`   | Escopo, chave, rótulo, tipo, opções e flags.                 |
| `CompanyCustomFieldValue` | Valores JSON ligados à empresa e à definição.                |
| `ContactCustomFieldValue` | Valores JSON ligados ao contato e à definição.               |
| `UserWorkspacePreference` | Preferências por organização e usuário atualmente associado. |

O formato existente do snapshot exporta JSON como texto bruto do PostgreSQL,
preservando números além da precisão de `Number` e distinguindo SQL NULL de
JSON null. A recuperação valida esse texto sem usar o resultado de
`JSON.parse` como dado restaurado; o PostgreSQL extrai e converte o conteúdo
nativo. Não há novo formato, versão, dependência ou migração.

Definições precedem valores na inserção; a exclusão segue a ordem inversa.
As preferências exigem associação atual por organização/usuário antes da
primeira exclusão. Associação recriada com novo ID para o mesmo par é aceita,
mantendo credencial, papel e autorização de Superusuário atuais.

## Validação preparada e executada

A base passou em 36 testes unitários direcionados. Antes da implementação,
14 regressões falharam pelos motivos esperados: ausência de suporte aos novos
modelos/tipos e ausência da checagem de associação para workspace. Depois da
implementação, passaram 53 testes direcionados, incluindo os testes existentes
de referências e identidades. Tipos da API e das especificações passaram após
gerar o cliente Prisma do esquema atual.

Os dois novos arquivos de integração contêm 26 casos PostgreSQL/RLS:

- Backup criptografado e verificado, alteração do estado atual e ida e volta
  exata de JSON, flags e seis dígitos de microssegundos.
- Ambos os escopos e todos os tipos de campo, JSON de objetos/arrays/escalares,
  strings com escapes, Unicode, números grandes, frações e nulos distintos.
- Cópia vazia real, remoção de registros posteriores e isolamento entre
  organizações, inclusive o mesmo usuário global em duas organizações.
- Referências ausentes/de outro tenant, usuário ausente/alterado e associação
  atual removida/recriada, observando o estado dentro da transação antes do
  rollback para comprovar os bloqueios anteriores à primeira exclusão.
- Rollback de unicidade de definições/valores, opções SELECT e chave composta
  de preferências, incluindo alterações anteriores no grafo de empresas.

Os casos PostgreSQL não foram executados localmente, pois este ambiente não
tem PostgreSQL/Docker. O primeiro CI RED da versão somente de testes,
[39127852122](https://github.com/jeffaxe81/crm-vendas/actions/runs/39127852122),
confirmou 17 falhas esperadas no primeiro lote. O diagnóstico completo
[39128216271](https://github.com/jeffaxe81/crm-vendas/actions/runs/39128216271)
executou ambos os lotes e confirmou 40 falhas esperadas: 26 PostgreSQL e 14
unitárias; os outros 958 testes da API passaram. As fixtures chegaram aos
erros esperados do executor anterior. A coleta do segundo lote após falha
foi temporária e o workflow final permanece igual ao da base.

A revisão independente não encontrou problemas críticos, importantes ou
menores. O CI GREEN completo deve constar no PR antes da integração.
Após o merge, exigir também CI de
`push/main` e manifesto de origem do SHA exato; uma cópia candidata não
constitui homologação operacional.

## Limites e próximas etapas

Quatro modelos organizacionais `REPLACE` continuam não suportados: `Role`,
`RolePermission`, `Ticket` e `TicketEvent`. Registros em qualquer um deles no
backup ou no estado atual continuam bloqueando o executor. A configuração da
raiz `Organization`, políticas especiais, cópia preventiva e orquestração
atômica de confirmação/auditoria/revogação ainda precisam ser concluídas.

O executor segue interno, sem rota, botão ou worker de restore. Staging #255,
homologação #159 e gate de dashboards #256 permanecem pendentes. Nenhum dado
real foi restaurado ou apagado, e nenhum servidor recebeu deploy nesta etapa.
Quatro meses continuam sendo meta do planejamento, sem tempo economizado ou
data garantida decorrente deste incremento.
