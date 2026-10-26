# Plano de recuperação protegida

Spec: ../specs/2026-10-25-recovery-orchestration-design.md.
Base: main11643ed6. Implementações independentes de quota/expurgo/OAuth em outras branches; integrar antes de gate final.

1. Regressões de configurações raiz e referências preservadas; completar executor interno sem perda de identidade.
2. Contratos/API de capacidades, prévia/executar restauração e exclusão operacional com flag desligada por padrão e confirmação sem senha persistida.
3. Reserva durável e catálogo preventivo recuperável, usando as funções transacionais da frente de cotas.
4. UI com confirmação, resultado e histórico, PT/EN/ES; não ativar flag no deploy normal.
5. Homologação sintética, revisão e CI do pacote integrado; deploy local com backup/reversão e evidências separadas. TLS/domínio e conexão/envio real ficam adiados por instrução do usuário.
