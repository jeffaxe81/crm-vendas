# CRM Vendas — oito blocos de antecipação técnica

**Data de preparação:** 21/10/2026.
**Origem:** `main` em `613b3908d8195651d748b8d6397ad0f82fa74f2b`, após a PR #273.
**Interpretação:** oito frentes nominalmente semanais executadas como incrementos em uma sessão;
não representam oito semanas transcorridas, operação homologada ou cronograma futuro.
**Destino:** PR contra `main`; CI e merge devem ser registrados depois de confirmados.

## Frentes e evidências de implementação

1. **Semana 1 — formato de snapshot:** rejeitar conteúdo não-objeto,
   UUID de tenant inválido e registros com estruturas inesperadas.
2. **Semana 2 — PKs:** verificar presença e unicidade das chaves primárias
   declaradas no metadata Prisma antes de percorrer dependências.
3. **Semana 3 — PK composta:** cobrir `TicketProtocolCounter`,
   duplicidades e componentes de chave ausentes.
4. **Semana 4 — contagens:** bloquear contagens negativas, fracionárias,
   infinitas e inteiros fora da faixa segura.
5. **Semana 5 — regressões de prévia:** confirmar que valores numéricos
   inválidos e tipos inesperados não viram zero silenciosamente.
6. **Semana 6 — identidade preservada:** rejeitar associações com tenant
   incorreto, usuários duplicados e coleções incompletas.
7. **Semana 7 — PostgreSQL/RLS:** provar proteção contra escrita cruzada e
   preservação do contador de protocolo após restore comercial.
8. **Semana 8 — gates de entrega:** registrar código, SHA, CI da PR,
   `push/main`, manifesto e dependências operacionais NO-GO.

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
