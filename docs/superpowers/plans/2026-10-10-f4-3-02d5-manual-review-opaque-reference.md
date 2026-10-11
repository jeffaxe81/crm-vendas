# F4.3-02D5 — saneamento de referências na reconciliação manual

Base: F4.3-02D4 (#124). Data: 10/10/2026.

## Achado

O endpoint `POST /admin/email/manual-review/:id/resolve` e o serviço correspondente aceitavam `evidenceReference` com `:`, `/` e `#`, permitindo URLs e identificadores com caminho dentro do registro de auditoria. Isso contradizia a premissa de armazenar apenas uma referência **opaca**, não links ou material potencialmente sensível.

## Correção

- Constante única `EMAIL_MANUAL_REVIEW_REFERENCE_PATTERN`, compartilhada entre o schema Zod do controller e a validação do service.
- Apenas identificadores de **8 a 96 caracteres**: primeiro alfanumérico e restantes letras, números, ponto, sublinhado ou hífen.
- Não aceita URLs, endereços de e-mail, barras, dois-pontos, fragmentos, espaços ou caracteres de controle.
- A rejeição ocorre antes de qualquer mutação do outbox e antes de inserir audit log.
- IDs opacos anteriormente usuais com hífen continuam aceitos; valores de testes convertidos para formato opaco. Referências antigas permanecem preservadas nos registros imutáveis existentes.

## Segurança operacional

Não há alteração nas decisões `CONFIRMED_ACCEPTED` e `CONFIRMED_NOT_ACCEPTED`, status, permissões ADMIN/tenant, idempotência, agendamento ou transporte. `EmailModule` continua com `DisabledEmailProvider`; nenhuma mensagem é enviada.

A integração depende da cadeia #117–#124 e exige CI integral, revisão e merge controlado. O simulador não comprova homologação externa de relay.
