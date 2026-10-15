# Registro de homologação operacional — CRM-Vendas

**Data de abertura:** 2026-10-15  
**Referência:** issues #159 e #142; decisão de desenvolvimento #211; PR de recuperação de backups #210.  
**Baseline de código:** `d646cc37c2e1fd08a387081b3317bfb5bbee3847`.

## Resultado e alcance da decisão

**Status: HOMOLOGAÇÃO DOCUMENTAL REGISTRADA; HOMOLOGAÇÃO OPERACIONAL EM AMBIENTE REAL PENDENTE (NO-GO para afirmar aceite de produção).**

A autorização expressa do responsável permite prosseguir no desenvolvimento e adiar a coleta/apresentação de evidências práticas. Essa autorização **não representa execução ou aprovação** de testes que ainda não foram realizados no ambiente real.

## Checklist de rastreabilidade

| Critério                                                                   | Estado                | Evidência ou requisito de fechamento                                     |
| -------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| Aprovação condicional do desenvolvimento                                   | APROVADO / REGISTRADO | PR #211, integrada na main                                               |
| CI pós-merge do baseline                                                   | APROVADO              | Actions run #38740669781: verify e source_manifest SUCCESS, no SHA acima |
| Homologação HTTPS/TLS e cadeia do certificado no endereço real             | PENDENTE              | URL, emissão/cadeia do certificado, evidência de conexão                 |
| Login/logout, criação de usuário, recuperação de acesso e RBAC             | PENDENTE              | Roteiro executado com contas de teste                                    |
| Fluxo comercial completo e Quick Setup/tour no primeiro acesso             | PENDENTE              | Roteiro executado                                                        |
| Isolamento multiempresa / RLS e auditoria                                  | PENDENTE              | Testes positivos e negativos com duas organizações                       |
| Backup agendado, interrompido, retomado, retenção e integridade            | PENDENTE              | Execução no destino configurado; acompanhar PR #210                      |
| Restauração isolada, aprovação explícita de operação destrutiva e rollback | PENDENTE              | Execução segura, dados reconciliados e resultado do rollback             |
| Observabilidade, operação Docker/Nginx, persistência e recursos            | PENDENTE              | Logs/healthcheck e verificação operacional                               |
| Aceite para produção / GO operacional                                      | NÃO CONCEDIDO         | Preencher evidências e obter decisão explícita posterior                 |

## Procedimento de homologação posterior

1. Identificar ambiente, versão implantada, SHA, data, responsável, URL e janela de testes. Nunca registrar senhas, tokens ou segredos neste arquivo.
2. Executar smoke test de HTTPS/health/login e fluxo comercial completo, incluindo wizard/tour.
3. Testar segregação entre duas organizações e perfil sem privilégios (RLS/RBAC), inclusive logs/auditoria.
4. Executar backup, simulação de interrupção, retomada, retenção e integridade; verificar controles contra worker obsoleto.
5. Restaurar **somente em ambiente isolado**, com confirmação explícita e snapshot preventivo; testar rollback e reconciliação de dados.
6. Anexar evidências técnicas à issue #159 ou relatório de homologação; registrar falhas em issues separadas.
7. Registrar a decisão de GO/NO-GO com responsável, data, SHA, ambiente e itens ressalvados. Não substituir esta seção por sucesso presumido.

## Registro de fechamento documental

O **registro de homologação operacional está formalizado no código**, permitindo pesquisa histórica por "homologação operacional", "NO-GO", "RLS", "backup" e "rollback". A atividade de documentação é considerada concluída após o merge deste arquivo. **A execução/homologação prática continua aberta**; não deve ser encerrada até os testes reais e decisão de GO.

**Alterações futuras:** editar este documento via PR, preservando histórico Git, e referenciar a issue #159.
