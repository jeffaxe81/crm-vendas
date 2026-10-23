# RESTORE — rollback completo quando o arquivo do destino desaparece após a prévia

Data: 23/10/2026  
Base: `main` SHA `68d05dbb236669bc6eb4b09324961173d0347adb`.

## Risco

A PR #291 reuniu confirmação, cópia preventiva, restauração e auditoria na mesma transação PostgreSQL. A PR #288 verifica novamente o objeto criptografado de destino. Este teste integrado valida **a interação de ambas**: uma prévia emitida com backup válido não autoriza qualquer mutação se o arquivo ficar ausente ou for substituído antes da confirmação final.

## Regressão sintética PostgreSQL/RLS

Para cada condição (`missing` e `replaced`), o teste cria duas organizações, sessão de superusuário, dados comerciais, backup íntegro, prévia e operação RESTORE com lease; altera a empresa depois do snapshot; em seguida remove o objeto ou o substitui por outro envelope criptografado.

A execução interna deve falhar com `RESTORE_TARGET_INVALID` e comprovar que:

- nenhum arquivo nem registro `PRE_RESTORE` é criado;
- a prévia continua não consumida;
- a operação preserva estado `RUNNING` sem vínculo preventivo;
- os dados comerciais permanecem como antes da tentativa;
- não há auditoria de `restore.completed`.

A suíte usa `TRUNCATE ... CASCADE` em PostgreSQL descartável com papel RLS restrito. **Não executar em produção.**

## Portões

- CI integral do HEAD da PR, incluindo formatação, API/RLS, E2E, build de imagens;
- integração apenas após CI verde no commit exato;
- validação `verify`, `source_manifest` e artefato no SHA de `main`;
- gate RESTORE **NO-GO** até completar políticas de dados, testes de falhas e homologação #159/#250.

Sem rota, botão, worker público, deploy ou alteração em dados reais.
