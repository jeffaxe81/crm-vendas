# CRM Vendas — antecipação de quatro meses: checkpoint de execução

**Referência:** 23/10/2026, `main` @ `68d05dbb236669bc6eb4b09324961173d0347adb`.  
**Natureza:** quatro **blocos mensais nominais de escopo**, não quatro meses de horas trabalhadas nem uma promessa de prazo. O checkpoint registra somente entregas e pendências verificáveis, sem ampliar o GO operacional.

## Evidência de base

- PRs #285, #287, #288, #289 e #291: integradas à `main` em incrementos de proteção de backup e restauração interna.
- CI de `push/main` #39888480774 no commit exato `68d05dbb236669bc6eb4b09324961173d0347adb`: `completed/success`, jobs `verify` e `source_manifest` aprovados; artefato `crm-source-evidence-68d05dbb236669bc6eb4b09324961173d0347adb` (ID 12474181244), presente e não expirado na conferência.
- A PR #290 (`Ticket`/`TicketEvent`) permanece **draft**, com CI ainda não aprovada para merge na data deste checkpoint.
- A PR #292 adiciona regressão sintética de rollback diante de desaparecimento/substituição do destino; publicada, sem merge até aprovação de CI do HEAD exato.
- Dashboards #286/#283 e drafts históricos #245/#248/#254 permanecem **sem liberação**, bloqueados por #256 e pelo staging #255.
- Restore integral #250 e homologação #159 permanecem **abertos**. CI aprovada não significa servidor instalado, restauração real, rollback operacional ou aceite.

## Pacotes de trabalho dos quatro blocos

A legenda é **Concluído em código** somente quando o SHA e os testes foram aprovados; **Em CI**, **Em desenvolvimento** e **Bloqueado por ambiente/aceite** não equivalem à entrega final.

### Bloco 1 — Dados e segurança

**Resultado exigido:** grafo comercial, perfis, campos personalizados e `Ticket`/`TicketEvent`, preservando FKs, RLS e rollback. **Estado:** parcial; a base comercial está integrada, mas a PR #290 continua draft. **Gate:** CI PostgreSQL/RLS, round-trip de todas as políticas `REPLACE`, merge apenas após CI do HEAD e verificação de `push/main`.

### Bloco 2 — Restore transacional e backups

**Resultado exigido:** cópia preventiva, confirmação de sessão, fencing, retenção segura, revalidação física e falhas adversariais. **Estado:** parcial; código interno das PRs #285/#287/#288/#289/#291 integrado e regressões #292 pendentes. **Gate:** políticas especiais, capacidade e recuperação #250/#246; testes de timeout, rollback e anti-replay; sem endpoint público.

### Bloco 3 — Dashboards e qualidade

**Resultado exigido:** API read-only por tenant, volumes, insights, CSV e idiomas PT/EN/ES, além de acessibilidade e performance sintética. **Estado:** draft/bloqueado. **Gate:** liberação formal da #256 e staging #255 com três tenants, acesso/403, `no-store`, p50/p95 e testes de UI.

### Bloco 4 — Homologação e entrega operacional

**Resultado exigido:** SHA de candidato, TLS com CA confiável, login, funil, RLS no servidor, restore/rollback isolado e aceite. **Estado:** NO-GO operacional. **Gate:** evidências reais e aprovação explícita #159; a #250 controla RESTORE produtivo separadamente.

## Fila de execução com dependências

- [x] **A1 — Base de proteção de backup/restore:** integrar #285/#287/#288/#289/#291 e validar CI de `main` no SHA exato.
- [ ] **A2 — Prova adicional de rollback físico:** concluir CI, revisão do HEAD, merge da PR #292 e manifesto no novo SHA.
- [ ] **A3 — Chamados e eventos:** concluir PR #290, verificando a ordem das FKs e bloqueio de dependências de satisfação, outbox e contadores. O destino e o tenant com políticas não suportadas devem falhar antes de qualquer `DELETE`.
- [ ] **A4 — Políticas especiais:** inventariar e implementar apenas com testes negativos para identidade, sessão, credenciais, `PRESERVE_AND_REVOKE`, `MERGE_HIGH_WATER`, `RENEW_EXPIRED_TOKEN` e configuração raiz. Sem expor operações destrutivas.
- [ ] **B1 — Capacidade e recovery:** validar reservas/cotas de armazenamento, interrupção de I/O, arquivo órfão e espaço físico, sob #246/#250.
- [ ] **C1 — Dashboards:** resolver gate #256 antes de qualquer merge/deploy; testar staging #255 e regressões entre tenants com dados exclusivamente sintéticos.
- [ ] **D1 — Homologação de servidor:** coletar logs higienizados, CA/SAN HTTPS, login/CRUD, RLS cross-tenant, backup/restore isolados, rollback e aceite #159.
- [ ] **D2 — Decisão GO/NO-GO:** publicação/tag/produção dependem da aprovação operacional de um SHA candidato; não deduzir GO a partir do número de PRs ou percentual de CI.

## Painel de progresso verificável

A porcentagem é **somente do gate específico**: para uma execução GitHub `verify`, etapas aprovadas / etapas exigidas no mesmo run. Não extrapolar o valor para conclusão do produto.

- **Base automatizada da `main` `68d05db`:** 100% dos jobs obrigatórios concluídos naquele SHA.
- **`source_manifest` da mesma base:** aprovado, com artefato verificado.
- **PRs #290 e #292:** pendentes até CI e merge respectivos.
- **Dashboard staging #255 e segurança #256:** pendentes; testes locais não equivalem a homologação.
- **Restore integral #250 e homologação #159:** NO-GO, sem aceite operacional.

**Regra de acompanhamento:** registrar para cada incremento número da PR, HEAD, CI do HEAD, SHA da `main`, jobs `verify/source_manifest`, artefato e resultado do gate operacional separado. Evitar percentuais de meses sem um denominador previamente aprovado e não realizar alterações destrutivas em dados de produção.

## Ordem de revisão / rollback

O avanço de desenvolvimento não remove as restrições de branch, RLS e tenant. Se houver alteração concorrente na `main`, confirmar mergeabilidade, revalidar CI do SHA exato e suspender merge quando as evidências divergirem. Para dashboards, preservar drafts enquanto #256 bloquear integração. Para RESTORE, preservar ausência de rota/worker/botão público até #250 + #159.
