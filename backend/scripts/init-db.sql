-- CRM-VENDAS Database Initialization Script
-- Runs automatically when PostgreSQL container starts
-- Creates schema, extensions, and basic tables

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schema for CRM core entities
CREATE SCHEMA IF NOT EXISTS crm_core;

-- Create organizations table (multi-tenant root)
CREATE TABLE IF NOT EXISTS crm_core.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create indexes for organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON crm_core.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON crm_core.organizations(created_at);

-- Create enum for user roles
DO $$ BEGIN
    CREATE TYPE crm_core.user_role AS ENUM ('admin', 'manager', 'sales_rep', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create users table (with organization relationship)
CREATE TABLE IF NOT EXISTS crm_core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES crm_core.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role crm_core.user_role NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON crm_core.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON crm_core.users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON crm_core.users(created_at);

-- Create audit_logs table for compliance and tracking
CREATE TABLE IF NOT EXISTS crm_core.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES crm_core.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES crm_core.users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON crm_core.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON crm_core.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON crm_core.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON crm_core.audit_logs(created_at);

-- Insert development organization
INSERT INTO crm_core.organizations (id, name, slug, description, is_active)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Development Org',
    'development-org',
    'Default organization for development and testing',
    true
) ON CONFLICT (slug) DO NOTHING;

-- Insert demo user (password: demo1234)
-- Hash: $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5YmMxSUmGEJiq
INSERT INTO crm_core.users (
    id, organization_id, email, full_name, password_hash,
    role, is_active, email_verified
)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'demo@example.com',
    'Demo User',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5YmMxSUmGEJiq',
    'admin',
    true,
    true
) ON CONFLICT DO NOTHING;

-- Grant schema access to user
GRANT USAGE ON SCHEMA crm_core TO vendas_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA crm_core TO vendas_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA crm_core TO vendas_user;
