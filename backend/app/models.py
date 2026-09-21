"""
SQLAlchemy ORM Models for CRM-VENDAS
Defines database schema for multi-tenant SaaS application
"""

from datetime import datetime
from uuid import uuid4
from sqlalchemy import (
    Column, String, UUID, DateTime, Boolean, Text,
    Integer, ForeignKey, Index, Enum, func, JSON
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum

Base = declarative_base()


class Organization(Base):
    """Organization model for multi-tenant isolation"""
    __tablename__ = "organizations"
    __table_args__ = (
        Index('idx_organizations_slug', 'slug'),
        Index('idx_organizations_created_at', 'created_at'),
    )

    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="organization", cascade="all, delete-orphan")


class UserRole(str, enum.Enum):
    """User roles for role-based access control"""
    ADMIN = "admin"
    MANAGER = "manager"
    SALES_REP = "sales_rep"
    VIEWER = "viewer"


class User(Base):
    """User model with organization relationship"""
    __tablename__ = "users"
    __table_args__ = (
        Index('idx_users_organization_id', 'organization_id'),
        Index('idx_users_email', 'email'),
        Index('idx_users_created_at', 'created_at'),
    )

    id = Column(UUID, primary_key=True, default=uuid4)
    organization_id = Column(UUID, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    email = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="users")


class AuditLog(Base):
    """Audit log model for compliance and tracking"""
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index('idx_audit_logs_organization_id', 'organization_id'),
        Index('idx_audit_logs_user_id', 'user_id'),
        Index('idx_audit_logs_action', 'action'),
        Index('idx_audit_logs_created_at', 'created_at'),
    )

    id = Column(UUID, primary_key=True, default=uuid4)
    organization_id = Column(UUID, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    action = Column(String(50), nullable=False)  # e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
    entity_type = Column(String(50), nullable=False)  # e.g., 'user', 'contact', 'deal'
    entity_id = Column(UUID, nullable=False)
    changes = Column(JSON, nullable=True)  # Track what changed
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="audit_logs")
