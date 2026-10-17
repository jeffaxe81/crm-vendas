# Integração da PR #218 com a main

Revisão independente estática: sem achados Critical/Important na autorização,
isolamento por empresa, renovação de sessão, branding, tour e feedback.
Conflitos resolvidos preservando as funcionalidades das PRs #222–#225.
Metadados de backup e cliente Prisma regenerados para o schema combinado.
A fixture de snapshot de organização inclui os novos campos de idioma.

Resultados locais finais em 16/10/2026:

- Contratos: 132/132 testes aprovados.
- Web: 625/625 testes aprovados, incluindo os 300 dirigidos às PRs anteriores.
- API unitária (sem integration.spec.ts): 469/469 testes, 67 suítes aprovadas.
- TypeScript do Web e build da API aprovados.
- Build de produção do Next.js aprovado.

A primeira regressão de integração expôs metadados de backup desatualizados e
fixture sem os campos de idioma; ambos foram corrigidos. Os testes do menu
localizado foram adaptados para abrir o grupo Comercial antes de procurar
seus itens. O teste de widgets ocultos agora admite a consulta de idioma,
continuando a rejeitar consultas aos widgets ocultos.

Incluída tradução nos componentes recentes de tour flutuante e confirmação
de salvamento, mantendo mensagens e comportamento em pt-BR no padrão.

Não foi executada integração PostgreSQL/RLS neste executor, nem deploy ou
homologação no servidor. O banco da instalação precisa receber a migration
20261016041000_tenant_language antes da API que usa os campos novos.
Conferir o nome da migration em apps/api/prisma/migrations ao atualizar.
