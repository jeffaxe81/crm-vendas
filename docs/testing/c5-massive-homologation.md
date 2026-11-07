# CRM — campanha ampliada de homologação C5

**Escopo:** branch `feat/c5-knowledge-completion-20261103`, PR #334. Não é execução em produção.

## Matriz de testes

| Frente | Exercício | Evidência |
| --- | --- | --- |
| Unidade / propriedades | NOTE, LINK, DOCUMENT, validação de URL, base64, nome de arquivo, UUID, paginação e atualizações | `scripts/homologation/contract-campaign.cjs` |
| Caixa-preta HTTP | 128 POSTs deliberadamente inválidos, oito filtros inválidos e duas requisições sem sessão; verificar que não persistem registros | `apps/api/src/knowledge/knowledge.integration.spec.ts` |
| Concorrência | 32 POSTs, em lotes de 8; integridade dos IDs, duas páginas de resultados e isolamento de outra organização | `apps/api/src/knowledge/knowledge.integration.spec.ts` |
| Segurança E2E | Organizações distintas, PRIVATE, leitura/edição/exclusão cruzada, download, conteúdo binário, upload com path traversal e autenticação obrigatória | `tests/e2e/knowledge-blackbox.spec.ts` |
| Navegador E2E | Login, NOTE/LINK/DOCUMENT, recarga e download | `tests/e2e/knowledge-hub.spec.ts` |
| Recuperação | Snapshot criptografado, SHA-256, retorno dos bytes, restauração SQL, colisões e adulteração | `apps/api/src/data-management/knowledge-backup-objects.spec.ts` e `backup.integration.spec.ts` |

## Campanha de 100 milhões de propriedades

Cada iteração executa realmente a validação de um contrato Zod e verifica o resultado esperado. São **16 classes de invariantes** e entradas parametrizadas por gerador pseudorrandômico determinístico. O programa aloca índices globais disjuntos entre 16 shards e falha na primeira divergência. Um checksum permite reproduzir lotes.

```bash
pnpm install --frozen-lockfile
pnpm --filter @axes/contracts build
node scripts/homologation/contract-campaign.cjs --total 160000 --seed 20261107
```

A integração contínua executa 160.000 casos adicionais em cada PR. Para a execução completa de **100.000.000 casos**, utilizar o workflow `C5 100M deterministic property homologation`. O workflow pode ser executado manualmente ou mediante alteração do arquivo de acionamento `scripts/homologation/run-100m.txt`. Ele divide o total entre 16 runners e publica `campaign-0.json` a `campaign-15.json`.

O verificador `scripts/homologation/verify-campaign.cjs` exige índices contíguos, somatório exato, SHA idêntico, cobertura das 16 variantes e zero falhas. Somente após a conclusão do job de resumo o total pode ser descrito como executado e aprovado.

**Importante:** 100 milhões de iterações de propriedades **não** equivalem a 100 milhões de requisições HTTP, uploads, sessões reais nem fluxos de navegador independentes. Os indicadores devem discriminar essas categorias. Não declarar execução apenas por possuir o script ou iniciar o workflow.

## Critérios de aprovação

1. Mesmo SHA aprovado em formatação, lint, tipagem, suites de repositório, contratos, Web, API 1/2 e 2/2, E2E e builds Docker.
2. Nenhuma fuga entre organizações; PRIVATE só para autor; tentativas inválidas não persistem.
3. Sem alterações de produção; usar dados sintéticos, credenciais de CI e banco descartável.
4. Evidência explícita da quantidade **efetivamente executada** e não apenas do total solicitado.
5. Teste de restore/rollback, HTTPS com CA, RLS e auditoria no servidor real, conforme issue #159, antes de declarar GO operacional.

A homologação operacional não é automaticamente obtida mesmo após a campanha massiva passar. Qualquer erro reabre a frente correspondente e exige novo teste no SHA corrigido.
