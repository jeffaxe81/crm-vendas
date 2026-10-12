# Guias por perfil — planejamento da Release 1.2

**Estado: documentação de planejamento, não funcionalidade publicada.** O wizard e o tour **1.1** já estão no código da `main`, mas aguardam homologação operacional no servidor. A **Configuração Rápida 1.2** é uma evolução futura.

Os manuais são orientações de uso conforme as permissões do backend em `apps/api/src/authorization/permissions.ts`:

| Perfil  | Guia                        | Destinação                                               |
| ------- | --------------------------- | -------------------------------------------------------- |
| ADMIN   | [Administrador](./admin.md) | Organização, usuários e gestão comercial                 |
| MANAGER | [Gestor](./manager.md)      | Supervisão comercial, pipeline, relatórios e atendimento |
| SELLER  | [Vendedor](./seller.md)     | Operação comercial sem administração                     |
| VIEWER  | [Consulta](./viewer.md)     | Leitura sem alteração dos dados                          |

Veja a [matriz técnica de permissões](./matriz-de-permissoes.md).

A interface só deve apresentar ações autorizadas pela sessão; a permissão no backend não garante que exista uma tela ou integração ativa na versão instalada. Para a versão efetivamente implantada, consulte o administrador e o registro de homologação.
