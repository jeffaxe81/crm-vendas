# CRM-Vendas — evidências de homologação 1.0/1.1

**Situação inicial: NO-GO operacional.** O CI do GitHub valida o código,
mas não comprova deploy, confiança TLS, backup restaurável ou uso real.

## 1. Conferir o host autorizado

No checkout **instalado** no servidor:

```bash
git rev-parse HEAD
pnpm release:preflight -- --json
sudo bash scripts/verificar-deploy.sh
```

O commit Git local não comprova sozinho que os containers foram montados
a partir dele. O operador também deve conferir a versão realmente implantada.

No GitHub Actions, localizar o evento `push/main` concluído com `success`
no mesmo SHA e o artifact `crm-source-evidence-<SHA>`.
Esse artifact só demonstra a origem do código, não do ambiente.

## 2. Verificar HTTPS e onboarding externamente

Na **outra máquina** da rede autorizada, com CA pública confiável:

```bash
export CRM_BASE_URL=https://192.168.40.84
export CRM_HTTP_URL=http://192.168.40.84
export CA_CERT=/caminho/ca-publica-confiavel.pem

bash scripts/smoke-externo-c12.sh
bash scripts/smoke-onboarding-1-1.sh
```

Exigir zero falhas e correspondência do hostname/IP com o certificado.
Não usar `curl -k` nem `--insecure`. Um HTTP 401 não comprova o
funcionamento da rota; exige teste autenticado em separado.

Com **contas sintéticas** e permissão de homologação, testar login/logout,
empresas, contatos, atividades, oportunidades, funil, persistência de dados,
wizard do primeiro ADMIN, tour individual de SELLER/VIEWER e autorização.
Comprovar também isolamento real de dois tenants e RLS.

A equipe responsável deve ensaiar restauração de backup numa **cópia
isolada**, demonstrar rollback compatível com as migrações, avaliar os
resultados de segurança e assinar o aceite operacional.

## 3. Indexar evidências reais

Copiar o modelo
[`crm-rc-evidence-template.json`](./crm-rc-evidence-template.json)
para um diretório **privado**, como `manifest.json`.

Substituir os três valores `SUBSTITUIR_...` pelos identificadores reais.
Cada controle começa com `status: "pending"`. Marcar `passed` apenas
quando o relatório correspondente for genuíno e estiver no caminho indicado,
sempre em arquivo distinto. O CLI bloqueia arquivos ausentes, repetidos,
fora do diretório e links simbólicos.

```bash
pnpm release:evidence:check -- --manifest /pasta/privada/manifest.json --sha "$(git rev-parse HEAD)"
```

São obrigatórios `--manifest` e `--sha` com o SHA exato.
`EVIDENCE_PRESENT_UNVERIFIED` significa somente que o índice local
passou na verificação de existência/formato. Não verifica conteúdo,
não autentica provas e retorna sempre `productionApproved: false`.

A aprovação real requer leitura dos relatórios, revisão de falhas,
identificação do operador e aceite formal. Sem isso, manter **NO-GO**.

Não anexar `.env`, senhas, tokens, cookies, chaves privadas, dumps de
banco ou dados pessoais. Não publicar evidências privadas no GitHub.
