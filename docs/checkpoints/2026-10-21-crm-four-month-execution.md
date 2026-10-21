# CRM Vendas — execução acelerada em quatro blocos (checkpoint 21/10/2026)

> Documento de execução: quatro meses **nominais de roadmap**, não quatro meses efetivamente trabalhados ou entregues. A conclusão é comprovada por PR + testes + CI do SHA + homologação quando aplicável.

## Base verificada

- `main`: `d2f8c8d9b27dcd2c501f435815b8096aa471ed9d` (merge #260).
- #261 e #260 integradas; #262 aberta, branch `feat/restore-roles-permissions-20261020` **9 commits à frente e 0 atrás** de `main`, com mudanças em quatro arquivos de restore/testes.
- Dashboards #245/#248/#254 abertos, ainda sujeitos a Gate 0 #256 e QA #255.
- Restore #250 não é recurso liberado ao usuário: faltam cobertura completa, cópia preventiva validada, políticas especiais e orquestração. Homologação #159 pendente.
- Este documento não afirma que CI foi executada nesta sessão, nem valida servidor/produção.

## Bloco 1 — Fechar segurança do executor interno

**Escopo:** concluir revisão e CI de #262; garantir `Role` e `RolePermission`, preservando rollback e RLS.

**Critérios de aceite:**
1. Diff limitado e revisão de FKs; validar `withMaintenance`, RepeatableRead e política de rejeição pré-destrutiva.
2. Teste PostgreSQL com role restrito **sem BYPASSRLS**, tenant de origem/destino sintéticos, referência estrangeira e colisão de unicidade.
3. CI `verify` e `source_manifest` no SHA exato, artefatos rastreáveis.
4. **Nenhuma** rota, UI ou worker público habilitado. Sem merge se gates falharem.

**Estado:** implementação proposta em #262; aceite pendente.

## Bloco 2 — Integridade funcional de restauração

**Escopo:** novos incrementos delimitados para `Ticket` e `TicketEvent`, seguidos por políticas especiais identificadas em #250.

**Critérios de aceite:**
1. Confirmar dependências, ordem de deleção/reinserção e referências a filas/SLA/usuários.
2. Testar round-trip, snapshot vazio, referência inexistente, cross-tenant, exclusão de registros novos e rollback tardio.
3. Permanecer fail-closed até os modelos restantes e políticas especiais estarem completos.
4. Não expor restauração, mesmo após CI verde dos incrementos parciais.

**Estado:** planejamento, sem commit de implementação atribuído a este checkpoint.

## Bloco 3 — Cópia preventiva, confirmação e dashboards

**Escopo:** implementar backup preventivo íntegro e recuperável, orquestração atômica e confirmação privilegiada; preparar homologação de dashboards sem violar #256.

**Critérios de aceite:**
1. Bloqueio exclusivo, capacidade, catálogo persistente e validação real de backup antes de qualquer mutação.
2. Anti-replay, expiração, vinculação de sessão, revisão de privilégios, confirmação explícita e trilha de auditoria; rollback comprovado.
3. Dashboards mantidos sem disponibilização até aprovação de MFA/break-glass, retenção e 403 em staging para credenciais vedadas.
4. Ensaios de falha de processo, integridade de AES-GCM/manifesto, RLS e regressão geral em PostgreSQL.

**Estado:** dependências abertas #250/#256.

## Bloco 4 — Homologação e decisão operacional

**Escopo:** QA controlado (#255, #159), evidências de infraestrutura, fluxos funcionais e GO/NO-GO por versão.

**Critérios de aceite:**
1. Staging isolado com múltiplos tenants sintéticos, perfil PostgreSQL restrito, HTTPS/DNS e cenários end-to-end.
2. Validar importação, agenda, relatórios, exportações, chamados, filas, SLA, interações, backup e restauração com evidências.
3. Exigir CI do SHA exato, smoke funcional, roteiro de rollback e aceite formal dos responsáveis.
4. Nenhum deploy, merge bloqueado ou GO automático apenas por um plano ou testes locais.

**Estado:** a executar em ambiente autorizado.

## Painel rastreável da execução

| Entrega | Desenvolvimento | CI no SHA | Homologação |
|---|---|---|---|
| #262 perfis/permissões restore | PR aberta | Não confirmado neste checkpoint | Pendente |
| Ticket / TicketEvent restore | Planejado | Não executado | Pendente |
| Cópia preventiva e orquestração | Planejado | Não executado | Pendente |
| Dashboards #245/#248/#254 | PRs abertas | Não confirmado neste checkpoint | Bloqueado por #256 |
| GO operacional #159 | Não aplicável | Não equivale a GO | Pendente |

Não atribuir porcentagem de implementação sem baseline verificável de critérios aceitos; mostrar por tarefa `concluído / em revisão / bloqueado / pendente`. Qualquer entrega precisa de SHA, link CI e evidências do ambiente específico.
