# Manual de MANAGER — planejamento 1.2

O MANAGER administra a **operação comercial** de sua organização, mas não gerencia organização, usuários, auditoria ou credenciais de integração.

## Roteiro de preparação

1. Revise empresas, contatos e vinculações; verifique duplicidades.
2. Organize as etapas do funil usando `pipeline.manage`, conforme a interface disponível.
3. Revise oportunidades e distribuição operacional com os controles permitidos.
4. Consulte relatórios (`reports.read`) e padronize o acompanhamento.
5. Organize produtos (`product.write`) e a gestão do atendimento (`support.manage`), quando os módulos estiverem disponíveis.
6. Oriente a equipe sobre atividades, históricos, tags e campos comerciais.

## Limites de autorização

MANAGER dispõe das permissões comerciais de SELLER **e também** `pipeline.manage`, `reports.read`, `product.write` e `support.manage`. Não possui `organization.manage`, `user.manage`, `audit.read`, `integration.manage` ou `integration.read`.

É incorreto afirmar que MANAGER e SELLER são equivalentes no backend atual; as diferenças precisam ser respeitadas no futuro wizard. Consulte a matriz de permissões.

**Estado:** roteiro documental; não valida o funcionamento das telas em servidor real.
