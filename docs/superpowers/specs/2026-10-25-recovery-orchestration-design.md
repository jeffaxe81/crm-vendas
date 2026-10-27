# Recuperação e exclusão operacional protegidas

Pedido: implementar as pendências confirmadas do CRM; integração em main e deploy local previamente autorizados. Domínio/TLS externo adiado explicitamente pelo usuário.

## Fluxo

Completar o fluxo de recuperação com API/UI de Superusuário usando os gates internos existentes: prévia vinculada a sessão/fingerprint/checksum, senha vigente e frase exata, bloqueio exclusivo por empresa, cópia preventiva criptografada/verificada e substituição/auditoria/revogação em uma transação. A senha não é persistida em job, logs ou auditoria. A execução é síncrona e limitada pelo timeout; um registro durável identifica resultado/interrupção, mas não permite reexecutar alterações após falha sem nova senha.

Exclusão operacional é um fluxo separado de confirmação que remove apenas as categorias operacionais registradas, preservando identidade, configurações, backups, credenciais e histórico de segurança. Dependências preservadas incompatíveis impedem a operação antes de excluir dados. Não é expurgo automático nem mecanismo de liberar quota.

## Escolhas

Reutilizar a transação interna revisada é preferível a um novo executor paralelo. Fila com senha gravada é rejeitada. A rota terá flag de execução desativada por padrão; habilitação em laboratório sintético permite verificar o comportamento completo sem habilitar operações destrutivas no CRM em execução ou declarar aprovação de produção.

A cópia preventiva recebe reserva conservadora de capacidade antes do lock exclusivo; a reserva e o registro PENDING sobrevivem ao rollback do banco quando já houver objeto físico. Apenas após validação do arquivo o catálogo COMPLETED assume a cobrança. Nunca excluir automaticamente o arquivo ou liberar capacidade incerta. O resultado e o histórico permitem conferir sucesso após perda de conexão.

## Controles

Sessão humana Superusuário revalidada, rate limit transacional de confirmação, frase própria para cada operação, prévia vigente e não reutilizada, isolamento RLS, nenhuma senha em payload persistente, nenhum efeito antes de cópia válida, rollback tardio integral e preservação de outra empresa. Restore mantém identidade/slug/ativação da empresa e aplica configurações não sensíveis; associações e credenciais atuais são preservadas.

## Verificação

PostgreSQL sintético independente, casos 401/403/flag desligada, senha errada, prévia expirada/repetida/alterada, alvo inválido, quota, duas empresas, cópia preventiva recuperável, falha depois de exclusões, interrupção e ausência de replay automático. UI PT/EN/ES e CI integral. Domínio e envio real OAuth continuam adiados.
