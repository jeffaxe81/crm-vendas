# CRM-Vendas 1.0 — índice de evidências da versão candidata

Esta verificação **não libera produção**. Ela reduz o risco de declarar um
Go/No-Go sem arquivos de evidência de homologação. A checagem é local, sem
rede, sem leitura do conteúdo das evidências e sem qualquer alteração no
servidor ou nos bancos de dados.

## Preparar o índice

1. Use um diretório privado, fora do Git, para evidências de homologação:

   ```bash
   mkdir -p rc-evidence/evidence
   cp docs/releases/rc-1-0-evidence.example.json rc-evidence/manifest.json
   ```

2. Quando a versão candidata estiver integrada, informe no manifesto
   `candidate.sha` e `candidate.ciHeadSha` com **o mesmo SHA completo
   do commit da main**. Confirme manualmente no GitHub Actions que
   `ciRunUrl` aponta para um run `push` com resultado `success`
   naquele mesmo SHA. Esse programa **não consulta nem autentica o GitHub**.
3. Execute no servidor homologado `scripts/verificar-deploy.sh`,
   e de máquina da rede execute `scripts/smoke-externo-c12.sh` com
   `CRM_BASE_URL` e `CA_CERT` confiável; siga o roteiro em
   `docs/releases/2026-10-11-crm-rc-fasttrack-go-no-go.md`.
4. Documente as verificações reais de login/persistência, fluxo
   comercial, isolamento entre organizações, backup/restauração e rollback
   em ambiente isolado. Anexe revisão independente de segurança e aceite
   operacional. Os nove arquivos ficam sob `rc-evidence/evidence/`.
   **Nunca inclua tokens, cookies, senhas nem dados pessoais**.
5. Altere o status de cada item para `passed` **somente** depois de
   completar o teste real correspondente.

## Conferir a documentação reunida

```bash
pnpm release:evidence:check --manifest rc-evidence/manifest.json \
  --sha "$(git rev-parse HEAD)"
```

A saída JSON distingue:

- `NO_GO`: falta item, documento, identificador de CI ou SHA coerente.
  Código de saída **1** (ou **2** para argumento `--sha` inválido).
- `EVIDENCE_PRESENT_UNVERIFIED`: arquivos declarados existem e
  satisfazem os requisitos básicos. Código de saída **0**, mas
  **NÃO significa GO**. Uma pessoa responsável ainda precisa validar
  conteúdo, autenticidade, ambiente, alcance, revisão, consentimento,
  rollback e decisão final.

O utilitário impede evidências vazias, arquivos simbólicos,
traversal de diretórios e arquivos maiores que 2 MiB. Evidências devem
ser arquivos locais normais, relativos ao diretório do manifesto.
Não anexe ou versione a pasta privada `rc-evidence/` no repositório.

A verificação não prova operação correta, presença de CA válida,
sucesso real do CI, restauração de dados ou aprovação por pessoa
independente; essas etapas continuam obrigatórias e são registradas
separadamente na issue #142. **`productionApproved` é sempre
`false`, independentemente do resultado**.

O envio de e-mails externos continua desabilitado na versão mínima.
