# Gate 0 — Dashboard Read-only: pacote de prontidão

Data: 2026-10-22  
PR candidata: #283  
Branch: `feat/dashboard-consolidation-current-main-20261022`  
SHA técnico validado antes deste documento: `d91b60b8eac6ada0fe2254c671f33505df3ad12a`  
Gate técnico: run #1740 / `39859979619` — **GREEN**

> Este documento organiza a homologação e as aprovações. Ele **não** substitui staging real, QA, validação jurídica ou autorização de produção.

## 1. Evidência já automatizada

A CI do candidato comprova:

- sessão humana autenticada e permissão `reports.read` para dashboards;
- bloqueio de API keys e sessões superuser nos endpoints de dashboard;
- rejeição de query parameters usados para tentar sobrescrever tenant;
- `organizationId` derivado exclusivamente do principal autenticado;
- acesso ao banco via contexto tenant/RLS;
- resposta HTTP com `Cache-Control: private, no-store`;
- UI requisitando dados com `cache: "no-store"`;
- exportação CSV apenas de agregados e proteção contra formula injection;
- smoke read-only preparado para múltiplos tenants;
- regressão automatizada do repositório e build de imagens.

Esses itens são **evidência técnica**, não homologação operacional.

## 2. Política proposta de break-glass

Acesso privilegiado de emergência deve obedecer simultaneamente:

1. **MFA obrigatório** para a identidade humana solicitante.
2. **Segundo aprovador humano** diferente do solicitante.
3. **Motivo obrigatório** com ticket/incidente associado.
4. **Escopo mínimo**: somente tenant e ação estritamente necessários.
5. **Expiração automática curta**; referência operacional proposta: até 30 minutos, ajustável somente por decisão formal.
6. **Sem bypass silencioso** de RLS, guards de dashboard ou trilha de auditoria.
7. **Proibição de API key ou sessão superuser** para leitura dos dashboards de tenant.
8. **Auditoria obrigatória** contendo solicitante, aprovador, motivo, tenant, início, expiração e término.
9. **Revogação antecipada** assim que a intervenção terminar.
10. **Revisão pós-incidente** para todo uso de break-glass.

### Estado

- política técnica proposta: **PRONTA PARA APROVAÇÃO**;
- aprovação de Segurança/Operação: **PENDENTE**;
- MFA e segundo aprovador devem ser comprovados em staging antes de GO.

## 3. Homologação de staging — três tenants sintéticos

Pré-condições:

- ambiente de staging isolado;
- DNS e HTTPS válidos;
- ingress/proxy configurado;
- três organizações sintéticas A/B/C;
- usuários humanos sintéticos com `reports.read`;
- credenciais efêmeras;
- nenhuma informação real de cliente.

Executar o smoke read-only existente:

```bash
node scripts/dashboard-staging-smoke.mjs
```

Registrar para cada execução:

- commit/SHA;
- ambiente;
- tenant A/B/C;
- resultado HTTP;
- contagens esperadas e observadas;
- nova consulta do tenant A após B/C para detectar vazamento de contexto;
- responsável e data.

**Não registrar tokens, cookies ou payloads sensíveis.**

## 4. Evidência de no-store via proxy/ingress

Para catálogo e volume, validar a resposta percebida pelo cliente externo do staging, não somente a API interna.

Critério:

```text
Cache-Control: private, no-store
```

Registrar headers completos com valores sensíveis removidos.

Falha se:

- proxy remover ou substituir `no-store`;
- resposta apresentar cache público;
- tenant anterior reaparecer após troca de sessão.

## 5. Evidência RLS

No staging:

- papel da aplicação não pode ser superuser;
- papel da aplicação não pode possuir `BYPASSRLS`;
- tenant A não pode observar agregados B/C;
- tenant B não pode observar A/C;
- tenant C não pode observar A/B;
- tentativa de override de tenant por query deve ser rejeitada.

Registrar apenas IDs sintéticos/anonimizados e resultados agregados.

## 6. Performance — metodologia sem SLA inventado

Popular dados sintéticos em três patamares por tenant:

- 100 registros;
- 1.000 registros;
- 10.000 registros.

Para cada patamar, registrar:

- número de amostras;
- p50;
- p95;
- taxa de erro;
- CPU e memória de API/banco;
- plano/consulta problemática, se houver;
- versão/recursos do ambiente.

**Não definir aprovação por tempo de resposta sem limite previamente acordado pelos responsáveis.**

## 7. Matriz de UX/QA

Validar no mínimo:

- desktop;
- viewport mobile;
- teclado sem mouse;
- foco visível;
- leitor de tela para títulos, controles e tabela;
- PT-BR;
- EN;
- ES;
- refresh;
- exportação CSV;
- troca de sessão/tenant sem flash de dados anteriores.

Resultados devem ser anexados à issue #255.

## 8. Regressão backup/restore

Dashboards são read-only e não podem alterar:

- criação de backup;
- retenção;
- expurgo;
- catálogo de backups;
- operações de restore.

Gate de dashboard **não autoriza restore destrutivo**. As regras NO-GO próprias de backup/restore permanecem independentes.

## 9. Retenção e privacidade

Aprovação formal deve responder:

- quais agregados podem aparecer no dashboard;
- período máximo/mínimo de retenção aplicável;
- como exclusão/expurgo por tenant afeta agregados;
- se exportação CSV obedece às mesmas regras;
- responsáveis jurídico/privacidade e data de aceite.

Estado: **PENDENTE DE APROVAÇÃO HUMANA**.

## 10. Registro de decisão

Antes de liberar merge/deploy, preencher:

| Item                     | Responsável | Evidência              | Estado   |
| ------------------------ | ----------- | ---------------------- | -------- |
| Break-glass/MFA          | A definir   | staging + aprovação    | PENDENTE |
| 403 API key/superuser    | A definir   | staging                | PENDENTE |
| RLS 3 tenants            | A definir   | smoke/evidência        | PENDENTE |
| no-store ingress/proxy   | A definir   | headers staging        | PENDENTE |
| Retenção/privacidade     | A definir   | aceite formal          | PENDENTE |
| Performance              | A definir   | p50/p95/erros/recursos | PENDENTE |
| Mobile/desktop/a11y/i18n | A definir   | relatório QA           | PENDENTE |
| Backup/restore regressão | A definir   | relatório QA           | PENDENTE |
| Rollback                 | A definir   | procedimento validado  | PENDENTE |
| Janela de implantação    | A definir   | mudança aprovada       | PENDENTE |

## 11. Regra de GO

Somente considerar Gate 0 aprovado quando:

- issue #255 estiver concluída com evidências reais;
- issue #256 estiver concluída com aprovações formais;
- PR #283 estiver atualizada sobre a `main` vigente;
- CI do SHA final estiver verde;
- rollback e janela de implantação estiverem registrados.

Até lá: **NO-GO para deploy e merge do dashboard consolidado**.
