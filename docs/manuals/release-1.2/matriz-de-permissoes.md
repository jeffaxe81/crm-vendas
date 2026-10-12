# Matriz de permissões — referência para a Release 1.2

**Fonte de verdade:** `apps/api/src/authorization/permissions.ts`, na `main` de 12/10/2026. Uma permissão não prova disponibilidade de interface ou homologação no servidor. Não implementar autorização a partir desta tabela documental.

| Permissão | ADMIN | MANAGER | SELLER | VIEWER |
| --- | :---: | :---: | :---: | :---: |
| `organization.manage` | ✓ | — | — | — |
| `user.manage` | ✓ | — | — | — |
| `audit.read` | ✓ | — | — | — |
| `reports.read` | ✓ | ✓ | — | — |
| `pipeline.manage` | ✓ | ✓ | — | — |
| `company.read` | ✓ | ✓ | ✓ | ✓ |
| `company.write` | ✓ | ✓ | ✓ | — |
| `contact.read` | ✓ | ✓ | ✓ | ✓ |
| `contact.write` | ✓ | ✓ | ✓ | — |
| `opportunity.read` | ✓ | ✓ | ✓ | ✓ |
| `opportunity.write` | ✓ | ✓ | ✓ | — |
| `opportunity.move` | ✓ | ✓ | ✓ | — |
| `activity.read` | ✓ | ✓ | ✓ | ✓ |
| `activity.write` | ✓ | ✓ | ✓ | — |
| `knowledge.read` | ✓ | ✓ | ✓ | ✓ |
| `knowledge.write` | ✓ | ✓ | ✓ | — |
| `product.read` | ✓ | ✓ | ✓ | ✓ |
| `product.write` | ✓ | ✓ | — | — |
| `territory.read` | ✓ | ✓ | ✓ | ✓ |
| `territory.write` | ✓ | ✓ | ✓ | — |
| `ticket.read` | ✓ | ✓ | ✓ | ✓ |
| `ticket.write` | ✓ | ✓ | ✓ | — |
| `support.manage` | ✓ | ✓ | — | — |
| `integration.manage` | ✓ | — | — | — |
| `integration.read` | ✓ | — | — | — |

MANAGER dispõe também de `reports.read`, `pipeline.manage`, `product.write` e `support.manage`, que não fazem parte de SELLER. VIEWER é somente leitura. Futuros wizards devem consultar a permissão real da sessão; nenhuma etapa pode conceder acesso ou ativar integração externa.
