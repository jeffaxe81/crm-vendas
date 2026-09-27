-- F4.1: credenciais de API para consumo maquina-a-maquina.
--
-- Esta tabela NAO tem RLS, pelo mesmo motivo de "users" e
-- "organization_memberships": a credencial precisa ser resolvida pelo
-- hash da chave ANTES de sabermos a organizacao (equivalente a resolver
-- o usuario pelo e-mail no login). Isolamento por tenant e garantido a
-- nivel de aplicacao (todo acesso pos-autenticacao filtra explicitamente
-- por organization_id) e coberto por testes adversariais dedicados.

CREATE TABLE "integration_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "key_prefix" VARCHAR(12) NOT NULL,
  "scopes" VARCHAR(64)[] NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_used_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_credentials_key_hash_key" UNIQUE ("key_hash"),
  CONSTRAINT "integration_credentials_name_not_blank_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "integration_credentials_scopes_not_empty_check" CHECK (cardinality("scopes") > 0)
);

CREATE UNIQUE INDEX "integration_credentials_id_organization_key"
  ON "integration_credentials"("id", "organization_id");
CREATE INDEX "integration_credentials_org_active_idx"
  ON "integration_credentials"("organization_id", "is_active");

ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_revoked_by_fkey"
  FOREIGN KEY ("revoked_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
