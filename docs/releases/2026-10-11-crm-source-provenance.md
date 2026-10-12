# CRM 1.0 — Evidência automática do código da main

O workflow `.github/workflows/ci.yml` gera um arquivo JSON de evidências
**somente em `push` para `main`**, em um job separado que depende do
sucesso integral de `verify` (migrações de teste, lint, testes, E2E e
construção local de imagens Docker). Esse job realiza um **novo checkout
limpo** do SHA exato, sem persistir credenciais Git. Não reutiliza o
diretório modificado por geração de código, testes ou build.

## Conteúdo

- SHA exato do commit e da árvore Git verificados no checkout.
- Identificação do repositório, branch `main`, tentativa e link do CI.
- SHA-256 do `pnpm-lock.yaml`, `compose.yaml`, workflow de CI e Dockerfiles.
- Classificação explícita `SOURCE_ONLY_NOT_A_RELEASE`, sem afirmar publicação
  das imagens, digest de registro, implantação ou aceite operacional.

O arquivo é retido como artifact `crm-source-evidence-<SHA>` pelo GitHub
Actions por 30 dias. A criação ocorre **após** o sucesso do job `verify`,
mas antes da conclusão do workflow. Somente o status `success` do
run no mesmo SHA prova que a verificação e a publicação do artefato no
próprio GitHub Actions passaram.

## Limites e critérios para release

O manifesto é evidência de **origem do código**, não um atestado
criptográfico assinado nem prova de execução do ambiente instalado.

O release Go/No-Go permanece **NO-GO** até comprovação externa da
confiança TLS, login e navegação do CRM, dados/RLS, backup/restauração,
rollback, revisão independente de segurança e aceite operacional
(documentação em `docs/releases/2026-10-11-crm-rc-fasttrack-go-no-go.md`).

Imagens geradas pelo CI **não foram publicadas** em registry por este
incremento; não confundir Docker image ID local com digest imutável de
imagem publicada. Nenhum token, cookie, senha, e-mail de usuário ou
identificador pessoal é inserido no manifesto. Não cria tag/release
nem habilita `EmailProvider`.
