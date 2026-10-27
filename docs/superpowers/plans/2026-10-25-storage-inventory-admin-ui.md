# Plano da consulta administrativa do inventário

Spec: `../specs/2026-10-25-storage-inventory-admin-ui-design.md`.
Base: main `8f1454d6c4c4bc2e78e8b07c57df829a3c5e3748`.

1. Acrescentar regressões de contrato e interface; observar falhas antes da implementação.
2. Criar `StorageGlobalInventorySchema` em contracts e exportar seu tipo. Validar marcadores read-only, UUIDs, contadores não negativos e bytes inteiros em string.
3. Criar seção de consulta manual em `global-storage-inventory-view.tsx`, protegendo ciclo de vida da sessão e paginando tabelas localmente em lotes de 20.
4. Integrar ao painel de backups existente, registrar textos PT/EN/ES e validar regressões, tipos e formatação.
5. Revisão independente do diff, corrigir achados materiais por regressão e publicar candidato com CI do SHA exato. Integração conforme autorização de continuidade em main; implantação e aceite operacional permanecem separados.

Revisão: acesso somente Superusuário, ausência de requisições automáticas/queries, estado antigo após troca de sessão, precisão dos bytes, relatório parcial/indisponível e paginação sem novas consultas.
