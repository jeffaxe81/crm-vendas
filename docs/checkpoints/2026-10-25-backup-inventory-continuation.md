# Continuidade do inventário global de backups

## Base e diagnóstico

Retomada da PR #306 (`a147840e`) em branch isolada, com merge sem conflitos da main `8d968722`. O CI original 40158878126 falhou em Lint source porque o teste ESM importava `@jest/globals` sem declarar sua dependência direta. A API agora declara a versão 29.7.0, já presente no lockfile, sem trocar versões ou dependências de produção.

## Revisão e correções

Revisão independente não encontrou falhas críticas nos controles de filesystem, RLS ou autorização. Encontrou duas inconsistências de diagnóstico, tratadas juntas: contagem por tenant omitindo objetos ilegíveis e ausência do alerta de estado para objeto ilegível com catálogo DELETED. A contagem física agora atribui essas entradas ao tenant, enquanto bytes desconhecidos continuam fora dos totais; ambas as anomalias são relatadas sem seguir symlinks.

Uma regressão PostgreSQL com UUID symlink reproduziu a divergência antes da alteração e passou após a correção. O inventário continua somente leitura, apenas para sessão humana Superusuário, sem caminhos físicos ou nomes inesperados na resposta.

## Verificação neste checkpoint

- TypeScript da API passou após a declaração da dependência e geração do Prisma no worktree.
- Três suítes específicas passaram: 16 testes de armazenamento, inventário/RLS e autorização HTTP.
- PostgreSQL 18 de laboratório separado, porta local 5543, dados sintéticos e papel sem superusuário/BYPASSRLS. O banco do deploy na porta 5432 não foi usado.
- A primeira execução da suíte completa foi interrompida para corrigir os achados antes de uma nova execução integral. Não é contabilizada como aprovação.
- O resultado completo do SHA candidato deve ser consultado nos checks da PR. Homologação de produção, volumetria, enforcement de cotas e restore continuam independentes.

Nenhum teste de exclusão/restauração foi executado sobre o banco do CRM publicado; esta continuidade não realiza deploy.
