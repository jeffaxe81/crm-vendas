# Manuais PDF - CRM-Vendas

**Base do conteúdo:** `5412654ba274f063281aa3d177f1da2d3838e159` (12/10/2026).
**Situação:** referência de documentação versionada no Git. Não atesta execução ou aceitação no servidor.

Os oito manuais abaixo são arquivos PDF binários rastreados nesta pasta:

- [01-Manual-Administrador-ADMIN.pdf](./01-Manual-Administrador-ADMIN.pdf)
- [02-Manual-Gestor-MANAGER.pdf](./02-Manual-Gestor-MANAGER.pdf)
- [03-Manual-Vendedor-SELLER.pdf](./03-Manual-Vendedor-SELLER.pdf)
- [04-Manual-Consulta-VIEWER.pdf](./04-Manual-Consulta-VIEWER.pdf)
- [05-Matriz-Permissoes-RBAC.pdf](./05-Matriz-Permissoes-RBAC.pdf)
- [06-Primeiro-Acesso-Wizard-Tour-1-1.pdf](./06-Primeiro-Acesso-Wizard-Tour-1-1.pdf)
- [07-Configuracao-Rapida-Release-1-2.pdf](./07-Configuracao-Rapida-Release-1-2.pdf)
- [08-Manual-Homologacao-Operacao.pdf](./08-Manual-Homologacao-Operacao.pdf)

**Também:** [manual da coletânea completa](./00-Coletanea-Manuais-CRM-Vendas.pdf) (conjunto dos oito manuais).

## Notas de escopo

- Perfil ADMIN, MANAGER, SELLER e VIEWER seguem `apps/api/src/authorization/permissions.ts`.
- Primeiro acesso 1.1: wizard e tour integrados ao código, ainda pendentes de homologação operacional.
- Configuração Rápida 1.2: recurso planejado, não liberado.
- Habilitação externa de e-mails: ainda desativada; requer credenciais, consentimento e homologação.
- Não utilizar a documentação para declarar o CRM apto para produção.

## Fontes Markdown

- `docs/manuals/release-1.2/admin.md`
- `docs/manuals/release-1.2/manager.md`
- `docs/manuals/release-1.2/seller.md`
- `docs/manuals/release-1.2/viewer.md`
- `docs/manuals/release-1.2/matriz-de-permissoes.md`
- `docs/releases/crm-1-1-onboarding-tour.md`
- `docs/releases/1.2-configuracao-rapida.md`
- `docs/releases/crm-1-1-homologacao.md`

Origem e PDFs devem ser atualizados conjuntamente após mudanças de comportamento do CRM.
