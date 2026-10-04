# CRM-F001 — Comunicação integrada com NEO Interact

Status: implementada e validada automaticamente; homologação externa pendente.

A entrega incorpora no CRM o iframe de comunicação baseado no Dispatch D-006, com configuração por ambiente, controle de acesso por `ticket.read`, carregamento sob demanda e preservação do iframe durante a navegação. O logout remove o iframe. O NEO mantém autenticação própria.

## Validação adicional — 03/10/2026

Foram acrescentados 25 casos de teste para variações da origem do CRM, configuração vazia ou malformada, portas distintas, mensagens inválidas e limites de dimensões.

Os testes reproduziram quatro falhas na comparação textual de origens. A correção compara origens normalizadas por `URL.origin`, rejeitando o próprio CRM mesmo com barra final, hostname em maiúsculas, porta HTTPS padrão ou espaços. Uma origem do CRM malformada também torna a configuração indisponível.

| Verificação                         | Resultado                            |
| ----------------------------------- | ------------------------------------ |
| `pnpm --filter @axes/web test`      | 177 testes aprovados, em 39 arquivos |
| `pnpm --filter @axes/web typecheck` | Aprovada                             |
| `pnpm --filter @axes/web build`     | Build de produção aprovado           |

A suíte também cobre origem e janela do remetente, carregamento, timeout e recarga, redimensionamento, permissões, manutenção do iframe entre seções e remoção no logout.

## Pendências de homologação

Docker não está instalado no ambiente de execução; os testes de Compose não podem ser concluídos aqui. Não foi executado teste visual em navegador real. Login no NEO, cookies, CSP, áudio/vídeo e continuidade de chamadas precisam ser verificados no ambiente autorizado. O runtime disponível usa Node 24.19.0; o projeto declara Node 24.20.x.

Consulte [configuração e roteiro de homologação](crm-communication-iframe.md).
