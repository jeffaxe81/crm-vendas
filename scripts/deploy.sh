#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
BACKUP_DIR="backups"
SKIP_BACKUP=0
SKIP_BOOTSTRAP=0
SKIP_BUILD=0
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Uso:
  ./scripts/deploy.sh [opções]

Opções:
  --env-file ARQUIVO   Arquivo de ambiente (padrão: .env)
  --backup-dir DIR     Diretório de backups SQL (padrão: backups)
  --no-backup          Não gerar backup antes da migration
  --skip-bootstrap     Não executar o bootstrap do primeiro administrador
  --no-build           Reutilizar imagens Docker já existentes
  --check-only         Validar host, ambiente e Compose sem alterar serviços
  -h, --help           Mostrar esta ajuda
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy][aviso] %s\n' "$*" >&2
}

die() {
  printf '[deploy][erro] %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --env-file)
      (($# >= 2)) || die "--env-file exige um caminho."
      ENV_FILE="$2"
      shift 2
      ;;
    --backup-dir)
      (($# >= 2)) || die "--backup-dir exige um caminho."
      BACKUP_DIR="$2"
      shift 2
      ;;
    --no-backup)
      SKIP_BACKUP=1
      shift
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      shift
      ;;
    --no-build)
      SKIP_BUILD=1
      shift
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Opção desconhecida: $1"
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "Docker não está instalado."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não está disponível."

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  die "$ENV_FILE foi criado. Configure-o e execute o deploy novamente."
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_DB:?Defina POSTGRES_DB em $ENV_FILE}"
: "${POSTGRES_USER:?Defina POSTGRES_USER em $ENV_FILE}"
: "${POSTGRES_PASSWORD:?Defina POSTGRES_PASSWORD em $ENV_FILE}"
: "${JWT_ACCESS_SECRET:?Defina JWT_ACCESS_SECRET em $ENV_FILE}"
: "${REFRESH_TOKEN_PEPPER:?Defina REFRESH_TOKEN_PEPPER em $ENV_FILE}"
: "${WEB_ORIGIN:?Defina WEB_ORIGIN em $ENV_FILE}"
: "${NEXT_PUBLIC_API_BASE_URL:?Defina NEXT_PUBLIC_API_BASE_URL em $ENV_FILE}"

[[ "$POSTGRES_PASSWORD" != "axes" ]] || die "Troque POSTGRES_PASSWORD=axes antes de implantar."
[[ "$JWT_ACCESS_SECRET" != local-only-* ]] || die "Substitua JWT_ACCESS_SECRET de desenvolvimento."
[[ "$REFRESH_TOKEN_PEPPER" != local-only-* ]] || die "Substitua REFRESH_TOKEN_PEPPER de desenvolvimento."

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  : "${BOOTSTRAP_ORG_NAME:?Defina BOOTSTRAP_ORG_NAME em $ENV_FILE}"
  : "${BOOTSTRAP_ORG_SLUG:?Defina BOOTSTRAP_ORG_SLUG em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_EMAIL:?Defina BOOTSTRAP_ADMIN_EMAIL em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_NAME:?Defina BOOTSTRAP_ADMIN_NAME em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_PASSWORD:?Defina BOOTSTRAP_ADMIN_PASSWORD em $ENV_FILE ou use --skip-bootstrap}"
fi

if [[ "$WEB_ORIGIN" == *"localhost"* || "$NEXT_PUBLIC_API_BASE_URL" == *"localhost"* ]]; then
  warn "WEB_ORIGIN/NEXT_PUBLIC_API_BASE_URL ainda apontam para localhost."
  warn "Para acesso remoto, informe o IP ou DNS do servidor em $ENV_FILE."
fi

COMPOSE=(docker compose --env-file "$ENV_FILE")
"${COMPOSE[@]}" config --quiet

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "Configuração válida; nenhuma alteração foi feita."
  exit 0
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Construindo imagens API e Web..."
  "${COMPOSE[@]}" build --pull api web
fi

log "Subindo PostgreSQL..."
"${COMPOSE[@]}" up -d --wait postgres

if [[ "$SKIP_BACKUP" -eq 0 ]]; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR" 2>/dev/null || true

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="$BACKUP_DIR/${POSTGRES_DB}-${timestamp}.sql"
  backup_tmp="${backup_file}.tmp"

  log "Gerando backup antes da migration: $backup_file"
  "${COMPOSE[@]}" exec -T postgres     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$backup_tmp"
  chmod 600 "$backup_tmp" 2>/dev/null || true
  mv "$backup_tmp" "$backup_file"
fi

log "Aplicando migrations Prisma..."
"${COMPOSE[@]}" run --rm --no-deps api   ./node_modules/.bin/prisma migrate deploy

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  log "Criando/atualizando organização e administrador inicial..."
  "${COMPOSE[@]}" run --rm --no-deps     -e BOOTSTRAP_ORG_NAME     -e BOOTSTRAP_ORG_SLUG     -e BOOTSTRAP_ADMIN_EMAIL     -e BOOTSTRAP_ADMIN_NAME     -e BOOTSTRAP_ADMIN_PASSWORD     api node dist/scripts/bootstrap-admin.js
fi

log "Subindo API e Web..."
"${COMPOSE[@]}" up -d --wait api web

if command -v curl >/dev/null 2>&1; then
  api_port="${API_PORT:-3001}"
  health_url="http://127.0.0.1:${api_port}/api/v1/health"
  log "Validando health check: $health_url"
  curl --fail --silent --show-error     --retry 10 --retry-delay 2 --retry-connrefused     "$health_url" >/dev/null
else
  warn "curl não encontrado; o health do Docker Compose foi validado."
fi

"${COMPOSE[@]}" ps

log "Implantação concluída."
log "Web: $WEB_ORIGIN"
log "API: $NEXT_PUBLIC_API_BASE_URL"
