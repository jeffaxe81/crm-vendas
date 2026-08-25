# Regras de Negócio e Critérios de Aceite

## Regras de negócio

| ID | Regra |
|---|---|
| RN-01 | Clientes, contatos, oportunidades, atividades e interações não devem ser apagados fisicamente pelo fluxo do MVP; a inativação preserva o histórico. |
| RN-02 | Uma oportunidade deve estar associada a exatamente um cliente ativo. |
| RN-03 | Uma atividade pode estar vinculada a um cliente, uma oportunidade ou aos dois. |
| RN-04 | Cada interação e cada evento de auditoria deve registrar o usuário responsável e a data de execução. |
| RN-05 | O valor estimado de oportunidade não pode ser negativo. |
| RN-06 | Apenas administradores podem executar ações administrativas de usuários; demais permissões serão evoluídas sem alterar o núcleo do domínio. |
| RN-07 | Estágios padrão do funil são Prospecção, Qualificação, Proposta, Negociação, Ganha e Perdida, configuráveis em evolução futura. |

## Critérios de aceite do incremento

| Item | Critério de aceite |
|---|---|
| Clientes | É possível criar pessoa ou empresa, localizar pela busca, editar os dados e inativar sem perda de histórico. |
| Contatos | É possível cadastrar contato e vinculá-lo a uma empresa ativa. |
| Interações | É possível registrar e visualizar eventos da linha do tempo com autor identificável. |
| Atividades | É possível criar tarefa ou compromisso, definir prazo, prioridade e situação, e concluir a atividade. |
| Oportunidades | É possível criar oportunidade, informar valor e data prevista, e alterar a etapa do funil. |
| Painel | O usuário visualiza suas pendências, oportunidades e somatórios básicos. |
| Auditoria | Ações principais geram evento consultável com autor e data. |
| Oportunidades | É possível editar cliente associado, título, valor estimado, previsão e etapa sem perder o histórico de auditoria. |
