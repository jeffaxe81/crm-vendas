# CRM Vendas — oito blocos de antecipação técnica

**Data de preparação:** 21/10/2026.
**Origem:** `main` em `613b3908d8195651d748b8d6397ad0f82fa74f2b`, após a PR #273.
**Interpretação:** oito frentes nominalmente semanais executadas como incrementos em uma sessão;
não representam oito semanas transcorridas, operação homologada ou cronograma futuro.
**Destino:** PR contra `main`; CI e merge devem ser registrados depois de confirmados.

## Frentes e evidências de implementação

| Semana lógica | Entrega de engenharia | Prova prevista |
| --- | --- | --- |
| 1 | Preflight rejeita snapshot não-objeto, UUID inválido e linhas primitivas/nulas/arrays | Testes parametrizados de formato |
| 2 | Preflight valida presença e unicidade de PKs declaradas no schema Prisma | Duplicidades de Company, Ticket, TicketEvent e Membership |
| 3 | Verificação de PK composta e falha de campos ausentes antes de referências | TicketProtocolCounter repetido ou sem year |
| 4 | Prévia de modelos não suportados rejeita contagens negativas, fracionárias e não finitas | Bloqueios com `RESTORE_TARGET_INVALID` |
| 5 | Suíte de regressão de prévia com inteiros inseguros e valores não numéricos | Nenhum valor inválido é interpretado como zero |
| 6 | Validação de identidade por tenant: coleções obrigatórias, IDs únicos, associações no tenant alvo | Provas unitárias de membership falso e User duplicado |
| 7 | Banco PostgreSQL com usuário restrito: tentativa de escrita em outro tenant e preservação de `TicketProtocolCounter` após restore comercial | Integração RLS e regra de high-water |
| 8 | Critérios de merge, rastreabilidade SHA e runbook NO-GO | `verify` no SHA da PR + `verify`/`source_manifest` no SHA `push/main` |

## Invariantes de segurança

- Apenas reforço de validação e testes; `restoreTenantSnapshot` permanece uma primitiva
  **interna**, não exposta por API, job nem botão de produção.
- `Ticket`/`TicketEvent` ainda estão fora de `RESTORE_MODELS`; não habilitar
  restauração enquanto faltarem dependências de `EmailOutbox`, pesquisas de satisfação,
  contadores e fechamento de FKs.
- `TicketSatisfactionSurvey` usa `RENEW_EXPIRED_TOKEN` e
  `TicketProtocolCounter` usa `MERGE_HIGH_WATER`, nunca REPLACE implícito.
- Não alterar login, superusuário, MFA, permissões, retenção, expurgo, bases reais ou esquema.
- Cópia preventiva verificável, confirmação vinculada à sessão, auditoria e rollback
  permanecem gates obrigatórios na #250 e #159.
- **GO produção: NÃO**. CI verde prova integridade de código, não homologação operacional.

## Evidências de fechamento (preencher a partir do GitHub, não estimar)

- [ ] PR criada; URL e HEAD registrado
- [ ] `verify` da PR aprovado no HEAD exato
- [ ] PR integrada à `main` com SHA e árvore verificados
- [ ] `push/main` `verify` aprovado no SHA final
- [ ] `push/main` `source_manifest` aprovado e artefato de origem existente
- [ ] Pendências e decisão NO-GO atualizadas na issue #250
- [ ] Homologação de servidor e aceite operacional continuam pendentes em #159

## Comandos para diagnóstico no ambiente de testes

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @axes/api test --runInBand restore-reference-check.spec.ts
pnpm --filter @axes/api test --runInBand restore-identity-check.spec.ts
# Suite de integração e role RLS requerem Postgres migrado e ambiente de CI.
pnpm verify
```

Os números de testes e resultados somente devem ser declarados após
a pipeline concluir. Nenhum teste contra produção foi solicitado ou executado.
