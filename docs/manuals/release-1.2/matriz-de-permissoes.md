# Matriz de Permissões — Release 1.2

Fonte de verdade: RBAC do backend. Este documento é explicativo e não substitui o código de autorização.

| Permissão | ADMIN | MANAGER | SELLER | VIEWER |
| --- | :---: | :---: | :---: | :---: |
| `organization.manage` | ✓ | — | — | — |
| `user.manage` | ✓ | — | — | — |
| `audit.read` | ✓ | — | — | — |
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

## Interpretação para a configuração rápida

### ADMIN

Vê todas as etapas, inclusive organização, usuários e controles administrativos.

### MANAGER

Vê somente configuração e uso comercial. Não vê administração da organização, usuários ou auditoria.

### SELLER

Recebe configuração orientada à execução comercial. Embora hoje possua tecnicamente as mesmas permissões comerciais do MANAGER, a experiência deve privilegiar tarefas operacionais.

### VIEWER

Recebe apenas orientação de consulta e preferências pessoais; nenhuma etapa que altere dados deve ser exibida.

## Regra de implementação

O wizard da Release 1.2 deve obter permissões da sessão autenticada e derivar sua navegação delas. Não deve confiar apenas no nome do perfil para autorizar uma ação.
