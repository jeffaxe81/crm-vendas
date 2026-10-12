# Matriz de permissões — referência para a Release 1.2

**Fonte de verdade:** `apps/api/src/authorization/permissions.ts`, na `main` de 12/10/2026. A autorização deve consultar a sessão e ser validada pelo backend; este documento não substitui o código.

## VIEWER — apenas leitura

- `company.read`
- `contact.read`
- `opportunity.read`
- `activity.read`
- `knowledge.read`
- `product.read`
- `territory.read`
- `ticket.read`

## SELLER — leitura e operação comercial

Possui **todas** as permissões de VIEWER, mais:

- `company.write`
- `contact.write`
- `opportunity.write`
- `opportunity.move`
- `activity.write`
- `knowledge.write`
- `territory.write`
- `ticket.write`

## MANAGER — gestão comercial

Possui **todas** as permissões de SELLER, mais:

- `pipeline.manage`
- `reports.read`
- `product.write`
- `support.manage`

**MANAGER e SELLER não são equivalentes no backend atual.**

## ADMIN — administração completa

Possui **todas** as permissões de MANAGER, mais:

- `organization.manage`
- `user.manage`
- `audit.read`
- `integration.manage`
- `integration.read`

## Interpretação

Uma permissão do backend não garante que exista tela, integração ativa ou homologação do módulo na versão instalada. VIEWER não pode editar dados. A Configuração Rápida 1.2 é **planejada**; o wizard futuro deve derivar etapas da sessão autenticada e não confiar somente no nome do perfil.
