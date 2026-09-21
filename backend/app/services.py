"""
Business Logic Services for CRM-VENDAS Authentication
Handles user registration, login, token management, and password reset
"""

from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta
from app.models import User, Organization, UserRole
from app.repositories import UserRepository, OrganizationRepository
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.core.exceptions import (
    ApplicationError,
    AuthenticationError,
    ValidationError,
    ConflictError,
    NotFoundError
)


class AuthenticationService:
    """Service for authentication operations"""

    @staticmethod
    def register_user(
        db: Session,
        email: str,
        password: str,
        full_name: str,
        organization_name: Optional[str] = None,
        organization_slug: Optional[str] = None
    ) -> Dict:
        """
        Register a new user with organization

        Args:
            db: Database session
            email: User email
            password: User password (plain text)
            full_name: User full name
            organization_name: Name of organization (optional, creates new if provided)
            organization_slug: Slug for organization (optional)

        Returns:
            Dict with user and auth tokens

        Raises:
            ValidationError: If email or password invalid
            ConflictError: If email already exists
        """
        # Validate email format
        if "@" not in email or len(email) < 5:
            raise ValidationError("Invalid email format", "invalid_email")

        # Validate password strength
        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters", "weak_password")

        # Check if email already exists
        if UserRepository.email_exists(db, email):
            raise ConflictError("Email already registered", "email_exists")

        # Create organization if not provided
        if organization_name:
            # Create new organization
            org_slug = organization_slug or organization_name.lower().replace(" ", "-")
            organization = OrganizationRepository.create(
                db,
                name=organization_name,
                slug=org_slug
            )
        else:
            # Use development organization
            organization = OrganizationRepository.get_by_slug(db, "development-org")
            if not organization:
                raise NotFoundError("Default organization not found", "org_not_found")

        # Hash password
        password_hash = hash_password(password)

        # Create user
        user = UserRepository.create(
            db,
            organization_id=organization.id,
            email=email,
            full_name=full_name,
            password_hash=password_hash,
            role=UserRole.ADMIN if organization_name else UserRole.VIEWER
        )

        # Generate tokens
        access_token = create_access_token(
            user_id=str(user.id),
            organization_id=str(organization.id),
            email=user.email,
            role=user.role.value
        )

        refresh_token = create_refresh_token(
            user_id=str(user.id),
            organization_id=str(organization.id)
        )

        return {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "organization_id": str(organization.id)
            },
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 3600
        }

    @staticmethod
    def login(db: Session, email: str, password: str) -> Dict:
        """
        Authenticate user with email and password

        Args:
            db: Database session
            email: User email
            password: User password

        Returns:
            Dict with user and auth tokens

        Raises:
            AuthenticationError: If credentials invalid
        """
        # Find active user
        user = UserRepository.get_active_by_email(db, email)
        if not user:
            raise AuthenticationError("Invalid email or password", "invalid_credentials")

        # Verify password
        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password", "invalid_credentials")

        # Get organization
        organization = OrganizationRepository.get_by_id(db, user.organization_id)
        if not organization or not organization.is_active:
            raise AuthenticationError("Organization inactive", "org_inactive")

        # Update last login
        UserRepository.update_last_login(db, user.id)

        # Generate tokens
        access_token = create_access_token(
            user_id=str(user.id),
            organization_id=str(organization.id),
            email=user.email,
            role=user.role.value
        )

        refresh_token = create_refresh_token(
            user_id=str(user.id),
            organization_id=str(organization.id)
        )

        return {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "organization_id": str(organization.id)
            },
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 3600
        }

    @staticmethod
    def refresh_access_token(db: Session, refresh_token: str) -> Dict:
        """
        Generate new access token from refresh token

        Args:
            db: Database session
            refresh_token: Valid refresh token

        Returns:
            Dict with new access token

        Raises:
            AuthenticationError: If token invalid or expired
        """
        # Decode refresh token
        claims = decode_token(refresh_token, "refresh")

        if not claims:
            raise AuthenticationError("Invalid or expired refresh token", "invalid_refresh_token")

        user_id = UUID(claims.get("sub"))
        organization_id = UUID(claims.get("org_id"))

        # Verify user still exists and is active
        user = UserRepository.get_by_id(db, user_id)
        if not user or not user.is_active:
            raise AuthenticationError("User no longer active", "user_inactive")

        # Verify organization still exists and is active
        organization = OrganizationRepository.get_by_id(db, organization_id)
        if not organization or not organization.is_active:
            raise AuthenticationError("Organization inactive", "org_inactive")

        # Create new access token
        access_token = create_access_token(
            user_id=str(user.id),
            organization_id=str(organization.id),
            email=user.email,
            role=user.role.value
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": 3600
        }

    @staticmethod
    def reset_password_request(db: Session, email: str) -> Dict:
        """
        Request password reset (sends reset token)

        Args:
            db: Database session
            email: User email

        Returns:
            Dict with reset token (in production, would send via email)
        """
        user = UserRepository.get_active_by_email(db, email)

        # Always return success for security (don't reveal if email exists)
        if not user:
            return {
                "message": "If email exists, password reset link sent",
                "success": True
            }

        # Create reset token (short-lived, 1 hour)
        reset_token = create_access_token(
            user_id=str(user.id),
            organization_id=str(user.organization_id),
            email=user.email,
            role="reset_password",
            expires_delta=timedelta(hours=1)
        )

        # In production, send reset_token via email
        # For now, return it in response (development only)
        return {
            "message": "If email exists, password reset link sent",
            "success": True,
            "reset_token": reset_token  # Remove in production!
        }

    @staticmethod
    def reset_password(db: Session, reset_token: str, new_password: str) -> Dict:
        """
        Reset password using reset token

        Args:
            db: Database session
            reset_token: Valid reset token
            new_password: New password

        Returns:
            Dict with success message

        Raises:
            ValidationError: If password invalid
            AuthenticationError: If token invalid
        """
        # Validate new password
        if len(new_password) < 8:
            raise ValidationError("Password must be at least 8 characters", "weak_password")

        # Decode reset token
        claims = decode_token(reset_token, "access")

        if not claims or claims.get("role") != "reset_password":
            raise AuthenticationError("Invalid or expired reset token", "invalid_reset_token")

        user_id = UUID(claims.get("sub"))

        # Update password
        password_hash = hash_password(new_password)
        success = UserRepository.update_password(db, user_id, password_hash)

        if not success:
            raise NotFoundError("User not found", "user_not_found")

        return {
            "message": "Password reset successfully",
            "success": True
        }
