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
case "$CRM_HTTP_URL" in http://*) ;; *) echo "CRM_HTTP_URL deve começar com http://" >&2; exit 2 ;; esac
# Um teste de homologação não pode passar ignorando a confiança TLS.
[[ -n "$CA_CERT" ]] || { echo "[FALHA] CA_CERT obrigatório para validar TLS; nenhum teste executado" >&2; exit 2; }
[[ -f "$CA_CERT" && -r "$CA_CERT" ]] || { echo "[FALHA] CA_CERT ausente ou ilegível" >&2; exit 2; }
opts=(--cacert "$CA_CERT")

echo "== Smoke test externo CRM — Ciclo 12 =="
http_code=$(code --head "$CRM_HTTP_URL")
if [[ "$http_code" == 301 || "$http_code" == 308 ]]; then
  location=$(curl --silent --head --max-time 12 "$CRM_HTTP_URL" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="location:" { print $2; exit }')
  expected_redirect="${CRM_BASE_URL%/}/"
  [[ "${location%/}/" == "$expected_redirect" ]] && pass "HTTP redireciona para o CRM HTTPS esperado ($http_code)" || fail "Redirecionamento inesperado (origem HTTPS divergente)"
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

code_trusted=$(code "${opts[@]}" "$CRM_BASE_URL/")
[[ "$code_trusted" == 200 ]] && pass "Certificado TLS validado com a CA informada" || fail "Falha de confiança TLS / hostname ou IP"

warn "Login autenticado e persistência de sessão exigem teste manual autorizado"
warn "Iframe NEO exige validação pelo navegador e liberação de frame-ancestors na origem Dígitro"
warn "Regressão comercial/administrativa exige CI completo e roteiro funcional"
printf 'Resumo: %s falha(s), %s pendência(s)\n' "$failures" "$warnings"
(( failures == 0 ))
