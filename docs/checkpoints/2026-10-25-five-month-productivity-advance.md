# CRM-Vendas — antecipação de cinco meses: mobilidade e produtividade

Data de criação: 25/10/2026. Branch isolada: `feat/crm-five-month-export-productivity-20261025`.
Base: `main@4512cf187b0ffdf203f0002fae5b566f6270521e`.

## Interpretação do prazo

Cinco meses de antecipação foram transformados em **cinco frentes de produto**
originalmente escalonáveis entre outubro de 2026 e março de 2027. Os cinco
protótipos foram gravados na branch agora, mas isso **não equivale** a cinco
meses de trabalho concluídos, integração na `main`, homologação ou entrega em
produção.

### Frentes antecipadas

1. **Outubro a novembro de 2026 — Contatos:** exportação VCF dos contatos
   carregados, incluindo nome, cargo, e-mail e telefone.
2. **Novembro a dezembro de 2026 — Empresas:** exportação CSV das empresas
   visíveis, incluindo razão social, nome fantasia, documento e website.
3. **Dezembro de 2026 a janeiro de 2027 — Oportunidades:** exportação CSV
   de negociações carregadas com valores, previsão, vínculo e observações.
4. **Janeiro a fevereiro de 2027 — Atividades:** exportação ICS de prazos
   das tarefas e compromissos carregados.
5. **Fevereiro a março de 2027 — Agenda:** exportação ICS da página carregada,
   sem sincronização com provedores externos.

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
