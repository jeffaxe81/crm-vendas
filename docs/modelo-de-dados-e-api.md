# Modelo de Dados e Documentação de API

## Modelo de dados conceitual

| Entidade | Propósito | Relações principais |
|---|---|---|
| Usuário | Identidade, credenciais locais e perfil de acesso | Possui login único, hash de senha, conta ativa, perfil e autoria de ações comerciais |
| Cliente | Pessoa ou empresa gerenciada comercialmente | Possui contatos, interações, atividades e oportunidades |
| Contato | Pessoa vinculada opcionalmente a uma empresa | Pertence a um cliente do tipo empresa |
| Oportunidade | Negociação comercial no funil | Pertence a um cliente, possui atividades e interações, e preserva situação ativa/inativa |
| Atividade | Tarefa ou compromisso operacional | Pode referenciar cliente e oportunidade e preserva situação ativa/inativa |
| Interação | Evento do relacionamento comercial | Pode referenciar cliente e oportunidade, registra autor e preserva situação ativa/inativa |
| Auditoria | Rastro de alteração relevante | Registra ator, ação, entidade e identificador afetado |

## Contratos de API internos

As operações do MVP serão expostas como procedimentos tRPC protegidos, com validação de entrada no servidor. As listas aceitam paginação, pesquisa, ordenação e filtros quando aplicáveis.

| Módulo | Procedimentos previstos |
|---|---|
| dashboard | resumo; atividades pendentes; oportunidades recentes |
| clients | listar; criar; atualizar; inativar; listar contatos paginados e filtráveis; criar contato; atualizar contato; inativar contato |
| opportunities | listar; criar; atualizar; mover etapa; resumo do funil |
| activities | listar; criar; atualizar situação |
| interactions | listar por vínculo; criar |
| audit | listar eventos recentes |
| auth | consultar configuração inicial; criar primeiro administrador; login local; consultar sessão; encerrar sessão |

## Autenticação local

O CRM utiliza somente **login e senha locais**. A senha é persistida apenas como hash, e a sessão é um cookie HTTP assinado e de duração limitada. O primeiro acesso permite criar o administrador inicial; após essa etapa, o acesso ocorre exclusivamente por credenciais próprias do CRM. O fluxo OAuth e suas referências operacionais foram removidos do servidor e do cliente.

## Evolução planejada

Os contratos acima representam somente a Fase 1. Interfaces e operações de atendimento, integrações, automação e inteligência artificial permanecem deliberadamente fora da implementação atual e serão projetadas em módulos próprios nas fases previstas do roadmap.
