# F4.3-03B2 — Vault offline de origens inbound (antecipação controlada)

**Situação do incremento: implementação em PR; não habilitada operacionalmente.**
Issue de referência: #132. O serviço é somente biblioteca backend para futuras
integrações. Não há controller, webhook público, SMTP/IMAP, recepção, ou reuso
automático dessas chaves pelo `InboundSourceVerifier`.

## Garantias implantadas no banco

- `inbound_email_sources.route_key` é globalmente único; owner e source nunca
  podem ser alterados ou excluídos, impedindo que o alias passe a outro tenant.
- `enabled=FALSE` é requisito de SQL, não só valor default; tentativa de
  ativação por aplicação ou SQL deve falhar. Uma ativação futura exige migração,
  revisão de segurança e homologação explícita.
- `inbound_email_source_keys` mantém vários IDs por alias, nunca reutiliza ou
  sobrescreve ID/chave; revogação é irreversível, com timestamp.
- Segredos são cifrados por AES-256-GCM com chave separada
  (`INBOUND_EMAIL_SOURCE_ENCRYPTION_KEY`) e AAD contendo
  tenant/route/key; o serviço não possui método de leitura de plaintext.
- Ambas tabelas têm RLS `ENABLE/FORCE`, política de tenant, guarda de
  manutenção e vínculo composto tenant/route para chaves.
- Cadastro/rotação/revogação são transações com autorização ADMIN, CAS
  e eventos de auditoria sem segredos.
- API/EmailModule não possuem provider ativo, e o `DisabledEmailProvider`
  continua ligado.

## Backup, restore e credenciais

**Política explícita de inventário:** ambas tabelas novas usam SQL nativo e
não têm modelos Prisma, e por isso **não entram no schema exportável de
snapshots** e não podem ser inseridas automaticamente no
`TENANT_DATA_REGISTRY` de modelos Prisma. São metadados/credenciais
de segurança, com política `EXCLUDE` para backup da organização. A
restauração de um tenant exige nova vinculação e provisionamento autorizado
das origens; jamais transportar ciphertext/chave para outro tenant ou
exportar o segredo como JSON de backup. Backups físicos completos do banco
requerem proteção de volume, segregação de chave e gestão externa da
recuperação. Essa política precisa ser revisada antes de qualquer novo
exportador de tabelas SQL nativas.

## Aceite do incremento

- Migração aplica no CI de PostgreSQL de testes.
- Teste com papel restrito valida FORCE RLS, isolamento e alias único global.
- Rotação concorrente usa versão CAS; revogação e immutable binding falham
  fechado inclusive quando acessados diretamente via SQL.
- Cifra + AAD são inspecionados no teste sem expor segredos em logs/auditoria.
- Pipeline completo lint, format, typecheck, testes, E2E e imagens verde no SHA.

## Antecipação planejada de 4 semanas (não equivale a tempo decorrido)

1. **Bloco 1 (antecipado agora):** inventário de origens, cifragem e RLS.
2. **Bloco 2:** versionamento, rotação, revogação e concorrência por tenant.
3. **Bloco 3:** configuração rápida 1.2 por permissões com testes de UI,
   sem ativação de integrações externas.
4. **Bloco 4:** estabilização e roteiro de homologação, com prova real
   de servidor, isolamento, backup/restore e aceite do operador.

Os blocos 1/2 deste incremento somente podem ser considerados concluídos
depois do CI e do merge. Os blocos 3/4 e o GO operacional continuam futuros;
não antecipar artificialmente aprovação de produção.
