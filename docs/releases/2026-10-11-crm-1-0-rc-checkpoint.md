# CRM-Vendas 1.0 — checkpoint do corte RC de 11/10/2026

> **Resultado: RC 11/10 BLOQUEADA / NÃO EMITIDA.**
> Este documento é um checkpoint de evidências, não uma homologação.

## Linha de base auditável

- Repositório: `jeffaxe81/crm-vendas`; branch `main`.
- HEAD observado em 11/10/2026:
  `8866d00c8738419c0412b23ca8d7f4683d372498` (merge #139).
- Gate pós-merge da `main`:
  [Actions 38144496211](https://github.com/jeffaxe81/crm-vendas/actions/runs/38144496211).
  Evento `push`, estado `completed/success` no mesmo SHA.
- A última release publicada observada foi `v0.6.1-release-manus`
  (15/09/2026). Não foi identificada uma release `CRM 1.0 RC`.
- Escopo mínimo da RC: funcionalidades comerciais já integradas,
  sem envio externo de e-mails nem dependência de OAuth.
  Referência: [issue #142](https://github.com/jeffaxe81/crm-vendas/issues/142).

O CI pós-merge comprova verificações no código-fonte, **não** o
funcionamento do servidor privado ou o aceite da release.

## Gates e evidências do corte

- **APROVADO:** CI da `main` no HEAD identificado acima.
- **APROVADO PELO CI:** testes, build e validações contidos no workflow;
  conservar logs e relatórios do run.
- **NÃO COMPROVADO:** versão e digest imutável do artefato de RC.
- **NÃO COMPROVADO:** migrações e role RLS no ambiente de homologação.
- **NÃO COMPROVADO:** smoke HTTPS/API e autenticação no servidor real.
- **NÃO COMPROVADO FORA DO CI:** regressão de empresas, contatos,
  funis, agenda, relatórios, chamados e webhooks.
- **SEM EVIDÊNCIA ESPECÍFICA DE HOMOLOGAÇÃO:** tentativa cross-tenant
  negada com role restrito, além dos testes automatizados existentes.
- **NÃO COMPROVADO:** ensaio de backup/restauração e rollback em
  ambiente isolado.
- **NÃO COMPROVADO:** revisão final de segurança/LGPD e aceite de release.

`NÃO COMPROVADO` indica ausência de evidência neste checkpoint,
não necessariamente falha de implementação. Não incluir senhas,
tokens, cookies ou remetentes reais em anexos de homologação.

## OAuth e provedores de e-mail fora da RC mínima

As PRs [#140](https://github.com/jeffaxe81/crm-vendas/pull/140),
[#141](https://github.com/jeffaxe81/crm-vendas/pull/141),
[#143](https://github.com/jeffaxe81/crm-vendas/pull/143) e
[#144](https://github.com/jeffaxe81/crm-vendas/pull/144) seguem
abertas e encadeadas: `#140 → #141 → #143 → #144`.

- A #140 passou no
  [CI 38146374239](https://github.com/jeffaxe81/crm-vendas/actions/runs/38146374239).
  Não havia revisão independente registrada no checkpoint.
- Reconsultar o CI e HEAD exato das PRs empilhadas após alterar bases.
  O sucesso de uma branch ancestral não homologa suas dependentes.
- A cadeia ainda não disponibiliza callback OAuth autenticado,
  troca de código, conexão Gmail/Graph ou envio externo.
- `DisabledEmailProvider` deve continuar ativo até validação de
  remetente, consentimentos, proteção contra duplicidade,
  revisão de segurança e homologação externa.

## Execução para destravar o corte

1. Congelar o escopo opcional e corrigir apenas defeitos bloqueadores.
2. Gerar artefato rastreável da `main`: SHA, tag candidata e digest.
3. Validar migrações e smoke no ambiente de homologação. Utilizar
   `docs/testing/c12-homologacao-pos-merge.md` e os scripts
   `scripts/smoke-externo-c12.sh` e `scripts/verificar-deploy.sh`.
4. Ensaiar recuperação e rollback em base de testes, sem executar
   ações destrutivas em produção.
5. Colher revisão de segurança/LGPD e aceite rastreável da release.
6. Revisar OAuth separadamente, com revisão **por outra pessoa**
   e CI atualizado antes de cada merge ordenado na `main`.

**Decisão do checkpoint:** preservar a `main` como baseline com
CI aprovado e **não emitir** a `CRM 1.0 RC` até haver evidências
dos demais gates. A [issue #142](https://github.com/jeffaxe81/crm-vendas/issues/142)
registra o bloqueio.
