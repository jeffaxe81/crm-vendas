# Modelo de Dados e Documentação de API

## Modelo de dados conceitual

| Entidade     | Propósito                                         | Relações principais                                                                       |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Usuário      | Identidade, credenciais locais e perfil de acesso | Possui login único, hash de senha, conta ativa, perfil e autoria de ações comerciais      |
| Cliente      | Pessoa ou empresa gerenciada comercialmente       | Possui contatos, interações, atividades e oportunidades                                   |
| Contato      | Pessoa vinculada opcionalmente a uma empresa      | Pertence a um cliente do tipo empresa                                                     |
| Oportunidade | Negociação comercial no funil                     | Pertence a um cliente, possui atividades e interações, e preserva situação ativa/inativa  |
| Atividade    | Tarefa ou compromisso operacional                 | Pode referenciar cliente e oportunidade e preserva situação ativa/inativa                 |
| Interação    | Evento do relacionamento comercial                | Pode referenciar cliente e oportunidade, registra autor e preserva situação ativa/inativa |
| Auditoria    | Rastro de alteração relevante                     | Registra ator, ação, entidade e identificador afetado                                     |

## Contratos de API internos

As operações do MVP serão expostas como procedimentos tRPC protegidos, com validação de entrada no servidor. As listas aceitam paginação, pesquisa, ordenação e filtros quando aplicáveis.

| Módulo        | Procedimentos previstos                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| dashboard     | resumo; atividades pendentes; oportunidades recentes                                                                           |
| clients       | listar; criar; atualizar; inativar; listar contatos paginados e filtráveis; criar contato; atualizar contato; inativar contato |
| opportunities | listar; criar; atualizar; mover etapa; resumo do funil                                                                         |
| activities    | listar; criar; atualizar situação                                                                                              |
| interactions  | listar por vínculo; criar                                                                                                      |
| audit         | listar eventos recentes                                                                                                        |
| auth          | consultar configuração inicial; criar primeiro administrador; login local; consultar sessão; encerrar sessão                   |

## C3.4 — Fundação do funil comercial

A implementação incremental da C3.4 introduz duas entidades persistentes e isoladas por organização:

- `Pipeline`: identifica um funil comercial ativo e mantém nome normalizado único por organização;
- `PipelineStage`: representa uma etapa ordenada do funil, vinculada ao mesmo `organization_id` do pipeline pai.

As etapas padrão seguem a RN-07: Prospecção, Qualificação, Proposta, Negociação, Ganha e Perdida. As quatro primeiras usam classificação `OPEN`, Ganha usa `WON` e Perdida usa `LOST`.

As tabelas `pipelines` e `pipeline_stages` usam PostgreSQL Row-Level Security com `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`. O contexto de organização é definido pela aplicação de forma transacional em `app.current_organization_id`; ausência de contexto falha fechada.

Contratos REST implementados nesta etapa:

- `GET /api/v1/pipelines`: lista os funis ativos visíveis à organização autenticada com etapas ativas ordenadas por posição;
- `POST /api/v1/pipelines/default`: garante de forma idempotente o funil padrão da organização. A operação é restrita a `ADMIN` e `MANAGER` e registra auditoria somente na criação efetiva.

A C3.4 não inclui editor de etapas, reordenação customizável nem CRUD completo de oportunidades. Esses comportamentos permanecem para incrementos posteriores do domínio comercial.

## Autenticação local

O CRM utiliza somente **login e senha locais**. A senha é persistida apenas como hash, e a sessão é um cookie HTTP assinado e de duração limitada. O primeiro acesso permite criar o administrador inicial; após essa etapa, o acesso ocorre exclusivamente por credenciais próprias do CRM. O fluxo OAuth e suas referências operacionais foram removidos do servidor e do cliente.

## Evolução planejada

Os contratos acima representam somente a Fase 1. Interfaces e operações de atendimento, integrações, automação e inteligência artificial permanecem deliberadamente fora da implementação atual e serão projetadas em módulos próprios nas fases previstas do roadmap.
