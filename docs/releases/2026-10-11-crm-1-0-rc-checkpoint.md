# CRM-Vendas 1.0 — checkpoint do corte RC de 11/10/2026

> **Resultado: RC 11/10 BLOQUEADA / NÃO EMITIDA.** Este documento registra um checkpoint de evidências, não uma homologação ou autorização de implantação.

## Linha de base auditável

- Repositório: `jeffaxe81/crm-vendas`; branch: `main`.
- HEAD observado em 11/10/2026: `8866d00c8738419c0412b23ca8d7f4683d372498` (merge da PR #139).
- Gate **pós-merge** da `main`: [Actions 38144496211](https://github.com/jeffaxe81/crm-vendas/actions/runs/38144496211) — `push`, `completed/success` no mesmo SHA. Isso comprova o gate automatizado executado no código-fonte, **não** o funcionamento do servidor privado.
- A última release publicada encontrada no momento do checkpoint foi `v0.6.1-release-manus` (15/09/2026); não há registro de release `CRM 1.0 RC` publicado neste checkpoint.
- Escopo mínimo da RC, conforme [issue #142](https://github.com/jeffaxe81/crm-vendas/issues/142): funcionalidades comerciais já integradas, sem envio externo de e-mails nem dependência da cadeia OAuth.

## Evidências e pendências do corte

| Gate | Estado em 11/10/2026 | Evidência exigida para promover |
| --- | --- | --- |
| CI integrado à `main` | **APROVADO** para o HEAD acima | Link do run e SHA imutável |
| Testes automatizados do workflow | **APROVADOS pelo CI** | Preservar relatórios e artefatos do run |
| Artefato de RC versionado e digest imutável | **NÃO COMPROVADO** | Versão/commit/digest, imagens ou pacote rastreáveis |
| Implantação e migrações em ambiente de homologação | **NÃO COMPROVADO** | Evidência da migração, role RLS e plano de reversão |
| Smoke HTTPS/API e autenticação no servidor real | **NÃO COMPROVADO** | Saída de `scripts/smoke-externo-c12.sh` com CA validada e `scripts/verificar-deploy.sh` |
| Regressão funcional guiada no navegador | **NÃO COMPROVADA fora do CI** | Empresas, contatos, funil, agenda, relatórios, tickets e webhooks |
| Teste de isolamento entre empresas | **CI aprovado; homologação específica não comprovada** | Evidência de tentativas cross-tenant negadas com role restrito |
| Backup/restore e rollback em ambiente isolado | **NÃO COMPROVADO** | Restauração demonstrada, verificação de dados e ensaio de reversão |
| Revisão final de segurança/LGPD e aceite de release | **NÃO COMPROVADOS** | Responsável, data, escopo, riscos residuais e aceite |

`NÃO COMPROVADO` significa ausência de evidência no checkpoint, não necessariamente falha de implementação. Nenhuma chave, token, cookie ou endereço de remetente deve ser incluído nos anexos de homologação.

## OAuth e provedores de e-mail ficam fora desta RC mínima

As PRs [#140](https://github.com/jeffaxe81/crm-vendas/pull/140) (cofre), [#141](https://github.com/jeffaxe81/crm-vendas/pull/141) (sessão/nonce), [#143](https://github.com/jeffaxe81/crm-vendas/pull/143) (verificador OIDC offline) e [#144](https://github.com/jeffaxe81/crm-vendas/pull/144) (JWKS fixo) seguem abertas e encadeadas: `#140 → #141 → #143 → #144`.

- O CI da #140 passou ([run 38146374239](https://github.com/jeffaxe81/crm-vendas/actions/runs/38146374239)); **sem review independente registrado**.
- O estado das demais PRs e a CI devem ser reconsultados pelo SHA exato antes de qualquer merge, inclusive ao mudar a base empilhada.
- A cadeia **não** entrega callback OAuth autenticado, troca de código, conexão Gmail/Graph, revogação remota nem envio externo.
- `DisabledEmailProvider` deve permanecer como transporte efetivo até validação da identidade/remetente, consentimentos, proteção contra duplicidade, homologação externa e liberação específica.

## Execução para destravar o corte

1. Manter congelado o escopo opcional. Separar defeitos bloqueadores de integrações que não fazem parte da RC mínima.
2. Produzir e identificar o artefato da `main` com SHA, tag candidata e digest, sem chamar a tag de aprovada antes do gate.
3. Executar migrações + smoke externo e registrar somente resultados reais do ambiente de homologação; seguir `docs/testing/c12-homologacao-pos-merge.md`.
4. Exercitar restore/rollback e cenários de isolamento RLS com base de teste; não executar operações destrutivas no ambiente operacional.
5. Colher revisão final de segurança/LGPD e aceite rastreável antes de publicar a RC.
6. Revisar OAuth em PRs separados, com aprovação **por outra pessoa** e CI atualizado a cada etapa de merge na `main`.

**Decisão de hoje:** manter a `main` aprovada como baseline e o rótulo `CRM 1.0 RC` não emitido; registrar o motivo na issue #142. Não inferir homologação pelo sucesso do Actions ou pelos commits.
