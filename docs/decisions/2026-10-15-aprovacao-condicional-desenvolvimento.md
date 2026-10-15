# Decisão de desenvolvimento — 15/10/2026

**Origem:** autorização expressa do responsável pelo projeto na conversa: prosseguir sem exigir evidências operacionais agora e registrar a aprovação no repositório para validação prática futura.

**Tipo de decisão:** APROVAÇÃO CONDICIONAL DE CONTINUIDADE DO DESENVOLVIMENTO E INTEGRAÇÃO DO CÓDIGO.

## Escopo

- CRM-Vendas: conclusão do Quick Setup, consistência de snapshots, recuperação de backups e evolução da restauração.
- PR #209: integrada à main, sujeita à verificação pós-merge.
- PR #208: integração autorizada após compatibilidade com main e gates técnicos.
- PR #210 / issue #207: integração autorizada somente quando a correção demonstrar integridade e proteção contra operações concorrentes, com testes automatizados verdes.
- Homologação prática do ambiente, RLS com usuários reais, HTTPS/CA, restore/rollback e aceite operacional: **PENDENTES, A EXECUTAR POSTERIORMENTE**.

## Interpretação da aprovação

A aprovação dispensa a apresentação imediata de relatórios ou evidências operacionais para continuar o desenvolvimento. Ela **não** significa que testes inexistentes tenham passado, que o ambiente tenha sido homologado ou que haja GO para produção. O resultado dos pipelines GitHub Actions deve continuar sendo registrado fielmente. Preservar backups, dados, controles de segurança, auditabilidade e branch protections. Não forçar merge com CI falho.

## Critério posterior de conclusão

Registrar SHA efetivamente implantado e executar testes de login e fluxo comercial, TLS/CA confiável, isolamento entre empresas (RLS), interrupção/retomada de backup, restauração isolada e rollback. Se falhar, manter ou retornar a NO-GO operacional e abrir correções rastreáveis.

**Status da decisão:** desenvolvimento aprovado condicionalmente; validação operacional pendente.
