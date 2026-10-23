# RESTORE: verificação física do destino antes de publicar PRE_RESTORE

**Data:** 22/10/2026  
**Base:** `main` no commit `5bd571cef4ba643d7eb1377b7e039c2a41ba22b0`.

## Risco corrigido

Um backup de destino validado por `BackupService.verify` pode sofrer corrupção, desaparecimento do arquivo ou substituição após essa verificação e antes de `stageRestorePreventiveCopy`. O preflight sob manutenção introduzido na PR #287 já verifica o catálogo e as referências, mas o estado `COMPLETED` não garante que o objeto imutável ainda exista e corresponda à cópia autenticada.

## Proteção

A primitiva interna agora relê e autentica o objeto de destino no `BackupStore` **depois** do preflight bloqueado e **antes** de criar qualquer objeto PRE_RESTORE ou registro de catálogo. A comparação é exata com os bytes do snapshot previamente verificado.

- Arquivo ausente (`ENOENT`), envelope estruturalmente inválido, falha de autenticação ou conteúdo inesperado: `RESTORE_TARGET_INVALID`, sem cópia preventiva publicada.
- Falha transitória de acesso ao armazenamento (ex.: `EIO`): mantém o erro original para política futura de retry; nunca a classifica como corrupção permanente.
- A primitiva permanece interna, exigindo transação com maintenance lock, posse de operação e validação de políticas de restauração.

## Regressão

Testes de integração com PostgreSQL/RLS e diretório privado descartável verificam: destino removido depois do verify inicial; envelope criptografado válido contendo conteúdo diferente; erro sintético transitório de leitura. Nos três cenários não há publicação preventiva, vínculo de operação nem restauração de dados. Os testes do repositório usam `TRUNCATE ... CASCADE`, nunca executar em produção.

## Limites

A revalidação não substitui as verificações de integridade e autorização necessárias imediatamente antes da **execução destrutiva** de RESTORE. Esta PR não cria executor público, worker, endpoint, botão ou deploy. Homologação #159 e critérios de #250 permanecem **NO-GO**.

## Gates

- [ ] CI de PR integral no SHA final, incluindo PostgreSQL/RLS e Docker.
- [ ] Merge somente com CI verde e branch sem conflitos.
- [ ] CI push/main, source_manifest e evidência do commit resultante.
- [ ] Aceite operacional em ambiente isolado antes de qualquer RESTORE real.
