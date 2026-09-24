"""Seed development data including default organization

Revision ID: 002_20260921_000100
Revises: 001_20260921_000000
Create Date: 2026-09-21 00:01:00.000000

"""
import os

from alembic import op
import sqlalchemy as sa
from uuid import uuid4
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_20260921_000100'
down_revision = '001_20260921_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert seed data for development (skipped when ENVIRONMENT=production)"""
    if os.getenv("ENVIRONMENT", "development") == "production":
        return

    # Generate consistent UUIDs for seed data
    dev_org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    dev_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

    # Create development organization
    op.execute(
        f"""
        INSERT INTO crm_core.organizations (id, name, slug, description, is_active)
        VALUES ('{dev_org_id}'::uuid, 'Development Org', 'development-org', 'Default organization for development and testing', true)
        ON CONFLICT (slug) DO NOTHING
        """
    )

    # Create default development user: demo@example.com / demo1234
    demo_password_hash = '$2b$12$9YL/uV.tS1bnFvs.QWeBNeoVTWyBjxURuKAtvVr6OtPFeSXoKlqoa'  # bcrypt(12) of 'demo1234'

    op.execute(
        f"""
        INSERT INTO crm_core.users (
            id, organization_id, email, full_name, password_hash,
            role, is_active, email_verified
        ) VALUES (
            '{dev_user_id}'::uuid,
            '{dev_org_id}'::uuid,
            'demo@example.com',
            'Demo User',
            '{demo_password_hash}',
            'admin',
            true,
            true
        )
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    """Remove seed data"""
    op.execute("DELETE FROM crm_core.users WHERE email = 'demo@example.com'")
    op.execute("DELETE FROM crm_core.organizations WHERE slug = 'development-org'")
