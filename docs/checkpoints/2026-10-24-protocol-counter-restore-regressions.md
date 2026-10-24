# RESTORE — regressões do contador de protocolos

Data: 24/10/2026. Base: PR #297, commit `7eedc9875ea2789513ed960fcff1a2056961a8a3`.

## Incremento

Quatro casos adicionais exercitam o executor interno real:

- backup com contador 43 e estado atual 10: resultado 43;
- backup e estado atual com contador 43: resultado 43;
- repetir as duas restaurações anteriores mantém o mesmo resultado;
- ano criado depois do backup permanece presente;
- falha explícita após o executor concluir reverte o contador e a empresa na mesma transação.

Os dois primeiros itens são casos parametrizados. O rollback verifica primeiro os valores restaurados dentro da transação; depois exige o erro sintético específico e compara o estado externo com os valores anteriores à tentativa. Isso evita passar sem executar a restauração.

## Evidência local

PostgreSQL 18 descartável, banco exclusivo de testes, dados sintéticos e 51 migrações aplicadas. O papel usado por `runtime.withMaintenance` foi consultado em `pg_roles`: `rolsuper=false` e `rolbypassrls=false`.

Comando direcionado: `pnpm --filter @axes/api test --runTestsByPath src/data-management/restore-ticket-protocol-counter.integration.spec.ts src/data-management/restore-ticket-protocol-counter.spec.ts src/data-management/restore-executor.integration.spec.ts`.

Resultado: três suítes, 60 testes aprovados, incluindo os quatro casos novos. Checagem de tipos aprovada. Revisão independente do diff sem bloqueadores.

`pnpm test` completo também aprovado, com código de saída zero: 85 testes de repositório, 132 de contratos, 643 Web e 1.127 API (159 suítes); total de 1.987 testes. Build da API, formatação dos arquivos alterados, `verify-foundation` e `release-preflight` aprovados. Os erros sintéticos impressos por testes negativos da API não causaram falhas de suíte.

Ambiente local: Node 24.19.0 e pnpm 11.25.0, com aviso de divergência da versão fixada no repositório. A CI deve validar o novo SHA com Node 24.20.0 e pnpm 11.3.0; o resultado local não substitui esse gate nem os E2E e builds Docker da CI.

## Limites

O teste de falha comprova atomicidade do contador e de uma empresa representativa; não comprova todos os relacionamentos, concorrência de alocação, interrupção de processo ou homologação de servidor. Nenhuma rota, worker público, botão ou migração foi adicionado. Homologação operacional #159/#250 continua pendente; este incremento não concede GO para produção nem autorização de merge/deploy.
