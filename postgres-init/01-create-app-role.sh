#!/bin/sh
# Creates (or updates) the restricted, non-superuser role the running API
# connects as. The default POSTGRES_USER (superuser) is reserved for schema
# migrations — superusers have BYPASSRLS by nature, which silently disables
# every RLS tenant-isolation policy in the schema.
#
# Runs in two contexts:
#   1. docker-entrypoint-initdb.d — first init of an empty data volume
#      (local socket, no PGHOST).
#   2. the `db-bootstrap` service in compose.yaml — on EVERY `docker compose up`
#      (PGHOST=postgres, PGPASSWORD=<superuser password>).
#
# It is idempotent: the role is created if missing and its password is always
# re-synchronised with APP_DB_PASSWORD. Without this, changing APP_DB_PASSWORD
# after the volume exists leaves the API with "password authentication failed
# for user axes_app" → unhealthy → web never starts → Nginx 502.
set -e

: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

# Protects against a password read from a CRLF (Windows) .env file.
APP_DB_PASSWORD=$(printf '%s' "$APP_DB_PASSWORD" | tr -d '\r')

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" <<-'EOSQL'
  SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
    :'app_user'
  )
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')\gexec

  SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password')\gexec

  SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')\gexec
  SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user')\gexec
  SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user')\gexec
  SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'app_user')\gexec
  SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'app_user')\gexec
EOSQL

echo "app role '${APP_DB_USER}' ready (password synchronised)"
