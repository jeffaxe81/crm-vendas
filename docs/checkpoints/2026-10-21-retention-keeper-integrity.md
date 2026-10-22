# Retenção de backup: verificação da cópia preservada

**Data:** 21/10/2026  
**Base:** `main`, commit `0a1fdeb547c0f6b6c5c066debb8866eb57975b3b`.

## Falha mitigada

O catálogo `COMPLETED` atesta uma verificação passada, mas não assegura que o arquivo cifrado mais recente ainda esteja íntegro. Na política anterior, a rotina de retenção poderia excluir cópias antigas válidas mesmo que o backup mais recente já estivesse corrompido.

## Mudança

- A seleção inicial continua desconsiderando cópias `PRE_RESTORE`.
- Cada exclusão candidata adquire o lock de manutenção compartilhado **antes** de reconsultar o catálogo.
- Um lock transacional exclusivo por tenant (`backup-retention:<tenant>`) serializa passagens de expurgo concorrentes.
- A rotina recalcula as cópias regulares mais recentes e nunca apaga uma cópia que agora pertença às `retentionCount` primeiras.
- Antes do DELETE, a cópia regular mais recente é relida do armazenamento, autenticada/decriptada e comparada com o manifesto e o catálogo usando `BackupService.verify`.
- Se a cópia a preservar estiver ausente, ilegível, adulterada ou incompatível, a limpeza falha fechada e **não** remove a cópia antiga examinada.
- `PRE_RESTORE` continua com proteção independente e nunca conta para retenção comum.

## Regressão

A suíte `backup-deletion.integration.spec.ts` agora prepara nove cópias, corrompe a mais recente e confirma que o expurgo falha sem remover nenhuma das cópias recuperáveis. O teste usa somente o PostgreSQL **descartável** da CI, pois a inicialização usa `TRUNCATE ... CASCADE`.

## Limites operacionais

Esta entrega **não** resolve a recuperação de arquivos órfãos após falha de I/O entre exclusão do catálogo e remoção física. Não habilita `RESTORE`, não é implantação, nem representa homologação operacional. `GO` de produção continua bloqueado pelas issues #159 e #250.

## Gates

- [ ] Gate integral da PR, com PostgreSQL/RLS e build, aprovado no HEAD exato.
- [ ] Integração e posterior `push/main` aprovados no SHA final.
- [ ] Manifesto de origem presente e verificado.
- [ ] Teste em ambiente de homologação antes de autorizar política de expurgo em produção.
