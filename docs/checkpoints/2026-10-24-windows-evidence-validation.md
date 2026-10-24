# Validação de evidências no Windows — 24/10/2026

Base local: `8174111c211859299aeb2462c9ecde8aa9ac2edc`, candidato da PR #299.
Branch: `fix/real-evidence-validation`.

## Correções

- Rejeita datas inexistentes normalizadas por `Date.parse` e horário `24:00:00`.
- Rejeita responsável `to_be_assigned` com espaços extras.
- Usa o separador nativo ao verificar os limites das pastas de evidências, tanto na criação quanto na leitura. No Windows, o leitor aceitava um arquivo existente fora da pasta do manifesto; a criação aceitava uma pasta não permitida dentro do checkout.
- Corrige os falsos positivos do teste de isolamento do RESTORE em caminhos Windows.

## Evidência local

Node 24.19.0, pnpm 11.3.0, Windows e Git Bash. O projeto exige Node 24.20.x; esta execução não substitui a CI Linux.

- Cinco casos de datas/responsável falharam antes da correção e passaram depois.
- O novo teste de leitura fora da pasta falhou com `EVIDENCE_PRESENT_UNVERIFIED` antes da correção e passou exigindo `NO_GO` depois.
- O teste existente que recusa criação em pasta não permitida passou após corrigir o separador.
- 21 testes direcionados passaram após a formatação.
- Prettier dos seis arquivos alterados e `git diff --check` passaram.
- Dependências instaladas com `pnpm install --frozen-lockfile`.
- Rodada final de repositório: **102 testes, 87 passaram, 15 falharam**. Executada sequencialmente com Git Bash e variáveis locais de teste para a configuração Compose.
- Manifesto permanece `TRACKING_ONLY_NO_GO`, com quatro controles pendentes e `productionApproved: false`.

## Falhas remanescentes da rodada final

Limitações confirmadas: links simbólicos (`EPERM`), permissões POSIX (modo 438 em vez de 448) e onze timeouts de Bash. As duas divergências restantes nos scripts de onboarding e grep precisam de reprodução em Linux antes de qualquer conclusão sobre regressão.

1. `onboarding smoke probes health and auth guards`
2. `rejects traversal and symbolic links`
3. `generated index is private, bound to checkout, and always NO-GO`
4. `external smoke accepts matching HTTPS origin with explicit CA`
5. `external smoke blocks a foreign redirect hostname`
6. `external smoke blocks a different port or HTTP redirect`
7. `external smoke rejects an untrusted TLS certificate`
8. `external smoke rejects plain HTTP 200 without a redirect`
9. `external smoke rejects HTTP 200 printed before a curl transport failure`
10. `external smoke rejects partial security headers after a curl failure`
11. `external smoke rejects duplicate redirect Location headers`
12. `external smoke rejects redirect HTTP status if curl later fails`
13. `external smoke rejects a changed HTTP status with a matching Location`
14. `external smoke supports separate HTTP and HTTPS ports on the same host`
15. `bundle inspection fails closed on grep read or execution errors`

Log local completo: `../repo-tests-final.log` relativo ao checkout; não é evidência de homologação operacional.

## Validação Linux concluída

Em 24/10/2026, a suíte de repositório foi executada em uma cópia temporária no filesystem Linux do Ubuntu/WSL, usando Node **24.20.0** e Playwright **1.62.1**. O runtime oficial do Node teve seu SHA-256 conferido com o arquivo `SHASUMS256.txt` da mesma distribuição. O checkout foi criado sem conversão para CRLF e recebeu os mesmos seis arquivos alterados da branch local.

Comando: `node --test tests/*.test.mjs`, com variáveis locais de teste para a interpolação do Compose.

Resultado: **102 testes, 102 aprovados, zero falhas, zero ignorados**, duração de 17,15 segundos. Todos os 15 casos que falharam na rodada Windows passaram no Linux, inclusive os testes de links simbólicos, permissões POSIX, onboarding, HTTPS e grep.

A revisão independente dos seis arquivos de código/teste não encontrou problemas. A revisão não substituiu a execução dos testes registrada acima.

Não foram executados testes completos da API/Web, homologação de servidor, push, merge ou deploy neste incremento. A validação cobre a suíte de repositório; a CI integral continua necessária antes da integração. O controle de produção permanece NO-GO.
