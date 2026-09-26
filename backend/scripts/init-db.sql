-- CRM-VENDAS Database Initialization Script
-- Runs once, when the PostgreSQL container volume is first created.
--
-- Only database-wide prerequisites live here. Tables, enums, indexes and
-- development seed data are owned by Alembic (backend/alembic/versions) and
-- are applied by `alembic upgrade head` when the backend container starts.
-- Keeping a single source of truth avoids drift between this file and the
-- migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE SCHEMA IF NOT EXISTS crm_core AUTHORIZATION CURRENT_USER;

-- Disposable database used by the backend test suite (pytest).
-- It is dropped/recreated freely by the tests; never store real data there.
SELECT 'CREATE DATABASE ' || quote_ident(current_database() || '_test')
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = current_database() || '_test'
)\gexec
