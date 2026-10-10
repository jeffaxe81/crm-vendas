# F4.3-02B2B — Relay HTTPS controlado e reconciliação de entregas incertas

Data: 10/10/2026. Base funcional: F4.3-02B2A (PR #118, dependente da PR #117).

## Entrega

- `HttpsEmailRelayProvider` implementa o contrato de envio para um **relay HTTPS confiável**, sem registrar o adaptador no `EmailModule`. `DisabledEmailProvider` continua como configuração padrão.
- O endpoint é configurado apenas no servidor com URL HTTPS, hostname explicitamente permitido, sem IP, porta alternativa, credenciais na URL, parâmetros ou fragmentos. Requisição POST, sem redirects, timeout delimitado e token Bearer.
- A chave de idempotência é o hash SHA-256 do evento. Uma repetição deve produzir a mesma chave; o relay precisa manter deduplicação persistente e devolver o mesmo `messageId` para a mesma chave.
- Aceitação HTTP 200/201/202 com identificador válido é **aceitação pelo relay**, não entrega na caixa de entrada.
- Erro de rede, timeout, 5xx, redirect ou aceitação com corpo inválido geram `DELIVERY_UNKNOWN` e estado terminal `MANUAL_REVIEW`; não existe retry automático nesses casos.
- Leases `PROCESSING` expirados também são colocados em `MANUAL_REVIEW`, pois o processo anterior pode ter enviado a mensagem antes da queda.
- Persistem os estados de rejeição explícita e a política de até cinco tentativas para erros que não significam aceitação incerta.
- O adaptador rejeita `SATISFACTION_REQUEST` até haver regra de consentimento, opt-in por tenant e trilha de auditoria.

## Barreiras para habilitar em produção

1. Contrato testado com relay real, com idempotência **durável** mesmo em reinício, timeout, retransmissão e resposta perdida.
2. Configuração de envio por organização, autorização administrativa e origem de credencial segura.
3. Procedimento operacional para consultar o provedor e reconciliar `MANUAL_REVIEW` sem duplicar mensagens.
4. Segurança de rede: egress somente para hostname permitido, validação de TLS e proteção contra DNS indevido.
5. Limites de concorrência, métricas, auditoria e rastreio do envio.
6. Gate separado de consentimento e privacidade antes de qualquer pesquisa CSAT.

## Cenários de teste

- Configuração inválida, URL HTTP, IP, usuário/senha em URL, parâmetros, porta alternativa e cabeçalho injetável.
- Requisição correta com chave idempotente estável e timeout, retorno de aceite sem confundir com entrega.
- Falha de rede, HTTP 5xx, redirecionamento e recibo inválido como `DELIVERY_UNKNOWN`.
- Resposta 4xx explícita classificada como rejeição, e bloqueio de CSAT.
- Banco PostgreSQL com RLS: lease expirado e resultado ambíguo não são automaticamente reenviados.

## Dependências e merge

PR #117 → PR #118 → esta microentrega. Enquanto não houver aprovação independente, todas permanecem abertas e **nenhuma deve ser mesclada na main**. Mesmo após merge, o envio continua desativado até ativação administrativa deliberada.
