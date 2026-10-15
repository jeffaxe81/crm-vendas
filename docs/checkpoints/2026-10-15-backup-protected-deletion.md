# Exclusão protegida de backups — 15/10/2026

Incremento da issue #86, baseado no desenho de backup aprovado em
`docs/superpowers/specs/2026-10-05-crm-backup-design.md` e nos itens de API
e interface do plano `docs/superpowers/plans/2026-10-05-crm-backup.md`.
Branch `feat/protected-backup-deletion`, PR #214; base
`0f34c8e6943399dbf04d31d911a8c20908289d68`.

## Comportamento

Exclusão manual de cópias concluídas antigas, exclusiva do Superusuário
com sessão humana vigente. Confirmação estrita `EXCLUIR BACKUP` vinculada
ao identificador e checksum. Bloqueio por organização, revalidação da
autorização depois de esperar a trava, proteção da cópia mais recente
verificada e das operações e prévias em andamento.

O catálogo persiste `DELETING` com auditoria atômica antes do unlink.
O worker repete as proteções ao retomar, remove o arquivo idempotentemente
e confirma `DELETED` junto com a auditoria de conclusão. Falha após unlink
e antes do commit mantém a linha pendente para recuperação. Metadados são
preservados; download e prévia aceitam somente `COMPLETED`.

A migração apenas amplia os estados do catálogo; os estados de operações
de dados continuam separados. Retenção e publicação de prévias adquirem
a trava compartilhada antes de reler o catálogo, evitando decisões anteriores
à exclusão concorrente. A interface exige confirmação, oferece cancelamento,
apresenta rejeições e mantém polling após falhas de atualização.

## Revisão e verificações

Revisão técnica por outro agente identificou três achados importantes:
revalidar a cópia protegida no momento do unlink; revalidar operações
enfileiradas depois da solicitação; manter polling se a primeira atualização
falhar. Todos receberam testes que reproduziram a falha antes da correção.

- RED de contrato: estados de exclusão rejeitados pelo contrato anterior.
- RED de interface: ação de exclusão inexistente.
- RED da revisão: dois testes com arquivos criptografados reais demonstraram
  a remoção indevida da cópia; um teste Web demonstrou polling interrompido.
- O primeiro CI PostgreSQL expôs o import ausente do runtime Jest no novo
  teste ESM e um defeito anterior no validador de IDs: a expressão aceitava
  quatro grupos e recusava UUIDs válidos com cinco grupos. Três testes
  unitários reproduziram a validação incorreta antes da correção, e a jornada
  HTTP agora exercita download bem-sucedido antes da exclusão.
- GREEN local: 108 testes de contratos, 295 testes Web e 18 testes de
  armazenamento, worker e revalidação da exclusão. Tipos da API e Web aprovados.
- Integração PostgreSQL/RLS, migrações, E2E e imagens: acompanhar o CI do SHA final.
- O teste local `tests/container-contract.test.mjs` requer Docker, ausente
  neste executor; a validação completa de Compose deve ocorrer no CI.
- A primeira tentativa do CI de implementação falhou antes do checkout por
  cota de download em `public.ecr.aws`; uma nova tentativa passou dessa etapa.

Os resultados definitivos do CI serão registrados após conclusão.

## Limites desta entrega

Não restaura dados nem apaga dados operacionais. A restauração de contatos
foi integrada pela PR #213, sem exposição pública do executor. A issue #86
permanece aberta até a restauração integral e
a exclusão protegida de dados estarem entregues. Nenhum dado real foi
excluído, nenhum deploy foi executado e a homologação do servidor permanece
na issue #159.
