# HTTP Security Headers Baseline — Design

## Intent

Avançar a issue #69 com um baseline automatizado de headers no Nginx sem introduzir CSP/COOP que possa quebrar OAuth, iframe ou integrações existentes.

## Goals

- tornar regressão dos headers atuais testável;
- adicionar uma Permissions-Policy mínima para capacidades não utilizadas neste corte;
- preservar HSTS, nosniff, SAMEORIGIN e referrer policy;
- preservar TLS 1.2/1.3 e redirect HTTP→HTTPS.

## Chosen policy

Adicionar somente `Permissions-Policy: geolocation=(), payment=(), usb=()`. Microfone e câmera ficam fora da política para não bloquear futuras funções de voz/vídeo. CSP e COOP ficam fora desta frente porque exigem inventário completo de origens e fluxo OAuth.

## Non-goals

- não alterar CORS;
- não adicionar rate limiting nesta mesma PR;
- não declarar scan OWASP executado;
- não alterar comportamento de iframe ou OAuth.

## Acceptance

Teste de contrato falha se qualquer header obrigatório, TLS 1.2/1.3, redirect HTTPS ou a nova Permissions-Policy desaparecerem/afrouxarem.
