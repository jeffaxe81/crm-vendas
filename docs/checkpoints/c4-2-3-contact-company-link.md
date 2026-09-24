# Checkpoint — C4.2.3 Vínculo de contatos importados a empresas

Data: 23/09/2026
Branch: `feat/c4-2-3-contact-company-link`
Base: C4.2.2 (`docs/checkpoints/c4-2-2-contact-import.md`)
Status: implementada, validada localmente pelo gate completo e integrada à `develop`.

## Construído

- nova coluna opcional `companyDocument` no CSV de contatos;
- `CompaniesService.findByDocuments`: resolve documentos normalizados (trim + minúsculas) para empresas ativas do tenant, dentro de `withTenant`;
- preview mostra a empresa encontrada (`company: { id, legalName }`) ou o erro da linha:
  - `Nenhuma empresa cadastrada com o documento informado.`
  - `O documento informado corresponde a mais de uma empresa.` (bases legadas com documento repetido)
  - `Sem permissão para vincular contatos a empresas (company.write).`
- a confirmação cria o vínculo `company_contacts` (não principal) na mesma transação do contato e dos canais, com auditoria `company.contact_linked`; o resultado traz `companyId`;
- vincular exige `company.write` além de `contact.write`, igual ao endpoint manual `POST /companies/:companyId/contacts/:contactId`;
- a tabela de preview da tela de Contatos ganhou a coluna **Empresa**.

## Evidência de testes (local, banco limpo)

- lint, typecheck e `format:check`: OK (exceto `.github/workflows/ci.yml`, CRLF preexistente);
- API: 39 suítes / 147 testes (3 unitários e 1 de integração novos, incluindo isolamento entre tenants);
- web 44/44; contratos 25/25; `test:repo` 6/6; build OK; E2E 4/4.

## Decisões preservadas

- sem criação automática de empresa quando o documento não existe;
- sem vínculo principal automático (`isPrimary = false`); o rótulo do vínculo fica vazio;
- sem migration nova.

## Próximo passo

Com a C4.2 — Importação concluída, o próximo bloco da Fase 2 é **Produtos** (catálogo). Ele exige modelo de dados novo (migration Prisma e regeneração do client), que precisa ser feito num ambiente com acesso a `binaries.prisma.sh` (máquina local ou CI). O escopo (campos do produto, preço, vínculo com oportunidades) precisa de definição de produto antes do design.
