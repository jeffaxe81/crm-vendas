# Recuperação protegida local

A API disponibiliza capacidades, histórico e execução em `/api/v1/admin/recovery`. Todos os endpoints exigem sessão humana de Superusuário; restore/exclusão também exigem senha vigente, frase exata e prévia recente vinculada à sessão. A interface aparece na administração de backups. `RECOVERY_EXECUTION_ENABLED=false` é o padrão, inclusive no Compose. Configurar armazenamento exige `BACKUP_DIRECTORY` privado e chave base64 de32bytes persistida fora do repositório.

A homologação destrutiva usa banco sintético separado. Nunca verificar restore ou exclusão contra o banco do CRM em uso. Sem armazenamento configurado ou sem execução habilitada, a API recusa a operação. O histórico fica disponível para conferir resultados após perda da conexão; operações interrompidas não repetem alterações automaticamente. Após sucesso, todas as sessões da empresa são revogadas e o operador deve entrar novamente.

A cópia preventiva usa o mesmo ID da operação, é criptografada e verificada antes de substituir dados e permanece protegida. O catálogo reserva conservadoramente `BACKUP_MAX_BYTES + 36` bytes antes da publicação. Uma falha incerta mantém a reserva; não apagar arquivos nem liberar reservas manualmente para contornar quota. O histórico tenta reconhecer cópias publicadas de operações interrompidas e promove somente objetos autenticados. Alterações e auditoria revertem juntas se a transação falhar.

A exclusão operacional preserva identidade, configurações, credenciais, backups, auditoria e registros protegidos. Tickets exigidos por e-mails preservados e a cadeia de referências desses tickets permanecem; a prévia mostra as contagens finais. E-mails pendentes passam a revisão manual. Restore recusa um alvo que exclua tickets ainda referenciados pela caixa de saída. Nunca retomar envios antigos automaticamente após recuperação.

O domínio externo fica para depois. O acesso local continua em `127.0.0.1`; a integração real com Gmail/Microsoft365 depende dos aplicativos OAuth e credenciais correspondentes. A configuração local ou testes com simuladores não comprovam autorização real dos provedores.
