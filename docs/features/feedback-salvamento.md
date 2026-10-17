# Confirmação visual de salvamento

Padrão comum de interface aprovado pelo responsável em 16/10/2026:

| Estado             | Apresentação                                                     |
| ------------------ | ---------------------------------------------------------------- |
| Pronto             | Rótulo original de salvar                                        |
| Em execução        | Indicador de carregamento, “Salvando…” e botão desabilitado      |
| Sucesso confirmado | Verde, “✓ Salvo!” por três segundos e mensagem de confirmação    |
| Erro               | Mensagem, indicação de falha e possibilidade de tentar novamente |

A mensagem usa uma região de status para leitores de tela. Cor não é a única
indicação. O indicador respeita a preferência de movimento reduzido. O bloqueio
local impede cliques simultâneos no mesmo salvamento; não substitui idempotência
ou validação no servidor. Nenhuma operação é repetida automaticamente.

## Primeira entrega

Empresas (criar/editar), produtos (criar/editar), contatos, canais, histórico,
campos customizados de contatos, perfil de usuários, identidade visual,
preferências pessoais, configuração NEO, preferência de provedor de e-mail,
agendamento de backup, wizard inicial e etapas da Configuração Rápida.

Nos cadastros que já fechavam o formulário após salvar, o fechamento foi
preservado e uma mensagem de sucesso permanece na página. Falha mantém os
valores preenchidos e a mensagem original de erro. Escolher arquivo de logo,
restaurar um rascunho ou importar preferências locais não confirma salvamento.

O provedor de preferências agora informa explicitamente se houve sucesso;
uma falha capturada internamente não pode ser interpretada como salvamento.
A confirmação de cada operação só acontece após o retorno de sucesso da API
(e validação do contrato, onde já existia).

Outros fluxos, como itens de oportunidades, cotas, SLA e webhooks, ainda usam
os controles anteriores. Este incremento não altera suas regras de negócio.

## Validação

Regressões adicionadas para espera de confirmação, bloqueio de clique duplicado,
confirmação por três segundos e nova tentativa após erro. Testes, build e
validação visual não executados nesta tarefa, conforme orientação vigente.
Verificação estática de TypeScript do Web (`tsc --noEmit`) aprovada.
Sem deploy ou aceite operacional. Confirmar os fluxos antes da implantação.
