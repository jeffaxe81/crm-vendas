# Retomada de backup interrompido — issue #207 / PR #210

## Comportamento

O lease dura 60 segundos e é renovado a cada 15 segundos durante exportação e
armazenamento. Somente o worker e a tentativa que ainda possuem o lease podem
alterar o catálogo, registrar checkpoint ou concluir a operação. A validação
da posse e a escrita do catálogo compartilham uma transação curta que bloqueia
a linha da operação. O snapshot RepeatableRead não escreve no catálogo e não
mantém esse bloqueio durante a exportação.

Após interrupção, o worker pode retomar o mesmo identificador nos estados
PENDING/RUNNING. Se o arquivo imutável já foi publicado, precisa passar por
autenticação AES-GCM, validação da organização, esquema, contagens e checksum
antes de ser adotado. Uma disputa EEXIST também valida e adota o vencedor;
nunca substitui seus bytes. Existência de arquivo, sozinha, não comprova sucesso.

Rejeição ou falha do heartbeat cancela os próximos passos. Renovações pendentes
são aguardadas antes de checkpoint, retenção, conclusão e saída do processamento.
Uma exclusão de retenção já confirmada no banco conclui a remoção idempotente
do arquivo; cancelamento impede iniciar a exclusão do próximo candidato.

Arquivo inválido ou incompatível encerra a operação em FAILED sob o mesmo
fencing, com auditoria `data_operation.failed`, preservando o objeto para análise.
Isso permite que a próxima solicitação prossiga. Os códigos terminais explícitos
são BACKUP_INVALID, BACKUP_SCHEMA_UNSUPPORTED, BACKUP_VERSION_UNSUPPORTED,
BACKUP_ORGANIZATION_MISMATCH, BACKUP_TOO_LARGE e BACKUP_ATTACHMENT_ADAPTER_REQUIRED.
Falhas de I/O permanecem transitórias: o catálogo registra FAILED e a operação
pode ser retomada após expiração do lease. Não converter indisponibilidade de
disco/permissão em diagnóstico de corrupção.

## Evidência e limites

O CI RED [38760393189](https://github.com/jeffaxe81/crm-vendas/actions/runs/38760393189)
reproduziu cinco falhas em PostgreSQL com RLS: adoção após PENDING e RUNNING,
worker obsoleto rebaixando catálogo concluído e ausência de serialização nas
duas escritas terminais. Os outros 391 testes passaram nessa execução.
Testes adicionais cobrem heartbeat, corrida de publicação, conteúdo inválido,
cancelamento, limpeza após commit e avanço da fila após falha definitiva.
A aprovação final deve usar o CI do último SHA da PR e, após merge, o CI e o
manifesto de origem do mesmo SHA da main.

Este incremento não entrega restauração integral, exclusão manual nem limpeza
destrutiva pela interface. A homologação operacional continua pendente na issue
#159; CI de desenvolvimento não comprova implantação no servidor. Antecipação
de cinco semanas é a meta solicitada, sem economia de prazo comprovada aqui.
