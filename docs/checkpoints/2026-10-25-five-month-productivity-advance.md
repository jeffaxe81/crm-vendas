# CRM-Vendas — antecipação de cinco meses: mobilidade e produtividade

Data de criação: 25/10/2026. Branch isolada: `feat/crm-five-month-export-productivity-20261025`.
Base: `main@4512cf187b0ffdf203f0002fae5b566f6270521e`.

## Interpretação do prazo

Cinco meses de antecipação foram transformados em **cinco frentes de produto**
originalmente escalonáveis entre outubro de 2026 e março de 2027. Os cinco
protótipos foram gravados na branch agora, mas isso **não equivale** a cinco
meses de trabalho concluídos, integração na `main`, homologação ou entrega em
produção.

| Ciclo planejado | Frente | Candidato implementado agora | Situação |
| --- | --- | --- | --- |
| 1: out/2026–nov/2026 | Portabilidade de contatos | Exportar os contatos carregados em arquivo VCF/vCard 3.0, com nome, cargo, e-mail e telefone | Código isolado; sem testes |
| 2: nov/2026–dez/2026 | Dados comerciais de empresas | Exportar as empresas visíveis em CSV UTF-8 com razão social, nome fantasia, documento e website | Código isolado; sem testes |
| 3: dez/2026–jan/2027 | Produtividade do funil | Exportar as oportunidades carregadas em CSV com valores, previsão, tipo de vínculo e observações | Código isolado; sem testes |
| 4: jan/2027–fev/2027 | Mobilidade de atividades | Exportar prazos de tarefas/compromissos da tela atual em calendário ICS | Código isolado; sem testes |
| 5: fev/2027–mar/2027 | Portabilidade da agenda | Exportar página de agenda carregada em ICS, sem integração ou sincronização externa | Código isolado; sem testes |

## Contrato técnico do candidato

- Usuário **precisa clicar** em Exportar. Não há download automático, transmissão
  externa, tarefa agendada, escrita no backend ou sincronização com calendários.
- Nenhuma rota API, banco, migration, regra de acesso ou RLS é alterada.
- Exportações operam apenas sobre dados autorizados já carregados nas views.
  Contatos, empresas, atividades e oportunidades consultam em geral 20 registros
  por página; agenda consulta 100 por página. **Não exporta toda a base**.
- Empresas: CSV respeita os filtros locais que já existiam na `main`. Os
  outros CSV/VCF/ICS representam os registros retornados para a tela atual.
- CSV possui BOM UTF-8, valores citados, escape de aspas e neutralização de
  células iniciadas por sinal de fórmula para reduzir riscos de CSV injection.
- VCF inclui somente canais de e-mail e telefone explicitamente disponíveis no
  registro, não histórico, senhas, IDs internos ou campos customizados.
- ICS utiliza `dueAt` como início. Como o CRM **não armazena duração** neste
  contexto, define blocos **provisórios** de 30 min para tarefas e 60 min para
  compromissos, com `STATUS:TENTATIVE`. Não envia convites nem define
  participantes. Reimportações devem ser conferidas para evitar duplicações.
- Os arquivos gerados podem conter dados pessoais/comerciais. A proteção,
  retenção e o compartilhamento após o download dependem das políticas de
  privacidade e autorização do cliente/organização. É necessário avaliar
  governança de exportações e eventuais trilhas de auditoria antes da produção.

## Próximos gates dos cinco meses

1. Reconciliação com a PR #307 (filtros de produtividade) e outras alterações
   atuais da `main`, evitando duplicidades e conflitos.
2. Validação de compatibilidade VCF/CSV/ICS e round-trip em ambientes descartáveis.
3. Verificação das permissões de download e da governança LGPD, inclusive
   arquivos locais com contatos e valores comerciais.
4. Testes unitários, integração, navegação acessível e testes E2E **em ciclo
   posterior**; verificar formatação, lint, tipos e builds de produção.
5. Homologação com operação real, aceite por frente e rollback. Sem GO
   operacional até fechamento dos gates já pendentes de release do CRM.

## Status factual

- **5/5 frentes codificadas como candidatos** nesta branch.
- **0/5 homologadas**; **0/5 implantadas**.
- Pedido anterior preservado: nenhuma suíte de testes foi criada ou executada
  manualmente nesta implementação. Se o GitHub iniciar workflows automáticos,
  seus resultados deverão ser tratados de forma separada.
- PR deve permanecer **draft** e **não ser mesclada** automaticamente.
