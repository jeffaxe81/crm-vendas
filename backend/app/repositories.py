"""
Database Repository Layer for CRM-VENDAS
Provides data access abstraction for database operations
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID
from typing import Optional
from app.models import Organization, User, UserRole


class OrganizationRepository:
    """Repository for Organization entity operations"""

    @staticmethod
    def create(
        db: Session,
        name: str,
        slug: str,
        description: Optional[str] = None
    ) -> Organization:
        """Create a new organization"""
        org = Organization(
            name=name,
            slug=slug,
            description=description,
            is_active=True
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    @staticmethod
    def get_by_id(db: Session, org_id: UUID) -> Optional[Organization]:
        """Get organization by ID"""
        return db.query(Organization).filter(Organization.id == org_id).first()

    @staticmethod
    def get_by_slug(db: Session, slug: str) -> Optional[Organization]:
        """Get organization by slug"""
        return db.query(Organization).filter(Organization.slug == slug).first()

    @staticmethod
    def get_active(db: Session, org_id: UUID) -> Optional[Organization]:
        """Get active organization by ID"""
        return db.query(Organization).filter(
            and_(Organization.id == org_id, Organization.is_active == True)
        ).first()


class UserRepository:
    """Repository for User entity operations"""

    @staticmethod
    def create(
        db: Session,
        organization_id: UUID,
        email: str,
        full_name: str,
        password_hash: str,
        role: UserRole = UserRole.VIEWER
    ) -> User:
        """Create a new user"""
        user = User(
            organization_id=organization_id,
            email=email,
            full_name=full_name,
            password_hash=password_hash,
            role=role,
            is_active=True,
            email_verified=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def get_by_id(db: Session, user_id: UUID) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email address"""
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_by_email_and_org(
        db: Session,
        email: str,
        organization_id: UUID
    ) -> Optional[User]:
        """Get user by email within specific organization"""
        return db.query(User).filter(
            and_(
                User.email == email,
                User.organization_id == organization_id
            )
        ).first()

    @staticmethod
    def get_active_by_email(db: Session, email: str) -> Optional[User]:
        """Get active user by email"""
        return db.query(User).filter(
            and_(User.email == email, User.is_active == True)
        ).first()

    @staticmethod
    def email_exists(db: Session, email: str) -> bool:
        """Check if email already exists"""
        return db.query(User).filter(User.email == email).first() is not None

    @staticmethod
    def update_last_login(db: Session, user_id: UUID) -> None:
        """Update last login timestamp"""
        from datetime import datetime
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.last_login = datetime.utcnow()
            db.commit()

    @staticmethod
    def update_password(db: Session, user_id: UUID, password_hash: str) -> bool:
        """Update user password"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.password_hash = password_hash
            db.commit()
            return True
        return False

    @staticmethod
    def verify_email(db: Session, user_id: UUID) -> bool:
        """Mark email as verified"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.email_verified = True
            db.commit()
            return True
        return False
