# CRM-Vendas — coleta de evidências para GO/NO-GO

**Situação inicial: NO-GO operacional.** O CI de GitHub Actions valida código, não comprova implantação, certificado, banco restaurável ou uso da interface.

## 1. Fixar a versão realmente instalada

No **host de homologação autorizado**, após identificar qual checkout e containers estão em execução:

```bash
cd /caminho/do/crm-vendas
git rev-parse HEAD
pnpm release:preflight -- --json
sudo bash scripts/verificar-deploy.sh
```

O commit de `git rev-parse HEAD` **não comprova sozinho** que os containers foram construídos desse commit. O operador deve verificar também a correspondência das imagens e da configuração realmente implantadas; preservar a evidência dessa verificação.

Na página GitHub Actions, confira manualmente uma execução `push/main` com `completed/success` para o **mesmo SHA** e o artifact `crm-source-evidence-<SHA>`. O manifesto publicado é **apenas de origem do código**, não de imagem implantada, e expira após o prazo de retenção.

## 2. Testes externos e autenticação

De outra máquina da rede com a CA **pública e confiável** disponibilizada pelo operador (nunca uma chave privada):

```bash
CRM_BASE_URL=https://192.168.40.84 \
CRM_HTTP_URL=http://192.168.40.84 \
CA_CERT=/caminho/ca-publica-confiavel.pem \
bash scripts/smoke-externo-c12.sh

CRM_BASE_URL=https://192.168.40.84 \
CA_CERT=/caminho/ca-publica-confiavel.pem \
bash scripts/smoke-onboarding-1-1.sh
```

O resultado esperado é **zero falhas**, com hostname/IP correspondente ao SAN do certificado. Não usar `curl -k` ou `--insecure`. Um status 401 de rota não autenticada não prova que a funcionalidade opera; ainda requer ensaio com sessões autorizadas.

O responsável executará **com contas de teste**: login/logout, empresa, contato, atividade, oportunidade, funil, persistência após relogin, wizard do ADMIN fundador, tour de SELLER/VIEWER, negativas de autorização e isolamento real entre dois tenants (RLS). Anotar falhas sem exportar senhas, cookies, JWT ou dados pessoais.

Separadamente: restaurar um backup em **ambiente isolado**, demonstrar plano de rollback compatível com schema/migrações, registrar avaliação de segurança e aceite operacional. Não restaurar banco real em produção como teste.

## 3. Indexar as provas sem atribuir GO automaticamente

Prepare um diretório privado de evidências, com **um arquivo diferente por gate**:

- `serverDiagnostics`
- `httpsTrustedCa`
- `loginSession`
- `commercialFlow`
- `tenantIsolation`
- `backupRestore`
- `rollbackDrill`
- `securityReview`
- `operationalApproval`

Crie `manifest.json` com este formato; mantenha `pending` até o operador concluir de verdade cada prova:

```json
{
  "schemaVersion": 1,
  "candidate": {
    "sha": "<SHA_REAL_INSTALADO_DE_40_CARACTERES>",
    "ciHeadSha": "<MESMO_SHA_CONFIRMADO_NO_CI>",
    "ciEvent": "push",
    "ciConclusion": "success",
    "ciRunUrl": "https://github.com/jeffaxe81/crm-vendas/actions/runs/<ID_REAL>"
  },
  "evidence": {
    "serverDiagnostics": { "status": "pending", "file": "evidence/diagnostico.txt" },
    "httpsTrustedCa": { "status": "pending", "file": "evidence/tls.txt" },
    "loginSession": { "status": "pending", "file": "evidence/login.txt" },
    "commercialFlow": { "status": "pending", "file": "evidence/crm.txt" },
    "tenantIsolation": { "status": "pending", "file": "evidence/rls.txt" },
    "backupRestore": { "status": "pending", "file": "evidence/restore.txt" },
    "rollbackDrill": { "status": "pending", "file": "evidence/rollback.txt" },
    "securityReview": { "status": "pending", "file": "evidence/seguranca.txt" },
    "operationalApproval": { "status": "pending", "file": "evidence/aceite.txt" }
  }
}
```

Os nomes acima são sugestões. Cada arquivo deve existir, ser regular e não ser um link simbólico. Em cada item só registrar `status: "passed"` depois de anexar **evidência genuína, distinta e saneada**.

Execute:

```bash
pnpm release:evidence:check -- --manifest /diretorio/privado/manifest.json --sha "$(git rev-parse HEAD)"
```

O utilitário exige `--manifest` **e** `--sha`. Um resultado `EVIDENCE_PRESENT_UNVERIFIED` informa apenas que as referências locais passaram nas validações **de formato e existência**; não verifica conteúdo, não autentica as provas e **sempre** retorna `productionApproved: false`. A decisão humana de GO exige leitura e conferência efetiva dos relatórios, revisão das falhas, identificação do responsável e aceite. Resultados sem anexos reais são `NO_GO`.

Não colocar `.env`, dumps, tokens, chaves, dados pessoais ou credenciais nos relatórios. Nunca publicar o diretório privado de evidências em um repositório público.
