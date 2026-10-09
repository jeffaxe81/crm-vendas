#!/usr/bin/env bash
# C12-02: smoke tests externos e não destrutivos para a implantação HTTPS.
# Executar de uma máquina da rede, não exige acesso SSH ao servidor.
set -uo pipefail
CRM_BASE_URL="${CRM_BASE_URL:-https://192.168.40.84}"
CRM_HTTP_URL="${CRM_HTTP_URL:-http://192.168.40.84}"
CA_CERT="${CA_CERT:-}"
failures=0
warnings=0

pass() { printf '[OK] %s\n' "$*"; }
fail() { printf '[FALHA] %s\n' "$*"; failures=$((failures+1)); }
warn() { printf '[PENDENTE] %s\n' "$*"; warnings=$((warnings+1)); }
code() { curl --silent --show-error --output /dev/null --max-time 12 --write-out '%{http_code}' "$@" 2>/dev/null || true; }
case "$CRM_BASE_URL" in https://*) ;; *) echo "CRM_BASE_URL deve começar com https://" >&2; exit 2 ;; esac
opts=(--insecure)
if [[ -n "$CA_CERT" ]]; then
  [[ -f "$CA_CERT" ]] || { echo "CA_CERT não encontrado" >&2; exit 2; }
  opts=(--cacert "$CA_CERT")
else
  warn "CA_CERT não informado; a verificação funcional ignora confiança TLS. Distribua a CA para homologação completa."
fi

echo "== Smoke test externo CRM — Ciclo 12 =="
http_code=$(code --head "$CRM_HTTP_URL")
if [[ "$http_code" == 301 || "$http_code" == 308 ]]; then
  location=$(curl --silent --head --max-time 12 "$CRM_HTTP_URL" 2>/dev/null | tr -d '\r' | grep -i '^location:' | head -1 || true)
  [[ "$location" == *"https://"* ]] && pass "HTTP redireciona para HTTPS ($http_code)" || fail "Redirecionamento não aponta para HTTPS"
else
  fail "HTTP retornou $http_code (esperado 301 ou 308)"
fi

home_code=$(code "${opts[@]}" "$CRM_BASE_URL/")
[[ "$home_code" == 200 ]] && pass "Frontend HTTPS responde 200" || fail "Frontend HTTPS retornou $home_code"

health_code=$(code "${opts[@]}" "$CRM_BASE_URL/api/v1/health")
[[ "$health_code" == 200 ]] && pass "API /api/v1/health responde 200" || fail "API /api/v1/health retornou $health_code"

headers=$(curl --silent --head --max-time 12 "${opts[@]}" "$CRM_BASE_URL/" 2>/dev/null | tr -d '\r' || true)
grep -qi '^strict-transport-security:' <<< "$headers" && pass "HSTS presente" || fail "HSTS ausente"
grep -qi '^x-content-type-options: *nosniff' <<< "$headers" && pass "X-Content-Type-Options presente" || fail "X-Content-Type-Options ausente"

if [[ -n "$CA_CERT" ]]; then
  code_trusted=$(code --cacert "$CA_CERT" "$CRM_BASE_URL/")
  [[ "$code_trusted" == 200 ]] && pass "Certificado TLS validado com CA informada" || fail "Falha de confiança TLS / hostname ou IP"
fi

warn "Login autenticado e persistência de sessão exigem teste manual autorizado"
warn "Iframe NEO exige validação pelo navegador e liberação de frame-ancestors na origem Dígitro"
warn "Regressão comercial/administrativa exige CI completo e roteiro funcional"
printf 'Resumo: %s falha(s), %s pendência(s)\n' "$failures" "$warnings"
(( failures == 0 ))
