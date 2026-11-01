# C3 — Loss Reason Completion — Plano TDD

1. RED API: LOST sem motivo falha; LOST com motivo deve persistir.
2. GREEN schema/migration + contrato + service.
3. RED Web: mover para LOST exige campo de motivo.
4. GREEN Web: diálogo/formulário mínimo e envio do motivo.
5. Cobertura adversarial: motivo em OPEN/WON rejeitado; cross-tenant e versionamento preservados.
6. Documentação/checkpoint/changelog.
7. Gate integral: frozen install, Prisma generate/deploy, verify, E2E, Compose, Docker.
8. Somente após GREEN: relatório, checkpoint e aprovação para merge.
