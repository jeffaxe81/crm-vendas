"""
Authentication API endpoints for CRM-VENDAS
Handles user registration, login, token refresh, and password reset
"""

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.permissions import get_current_claims
from app.repositories import UserRepository
from uuid import UUID
from app.services import AuthenticationService
from app.core.exceptions import (
    ValidationError,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ApplicationError
)

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


# ═════════════════════════════════════════════════════════════════════════════
# Request/Response Models
# ═════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    """User registration request"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 chars)")
    full_name: str = Field(..., min_length=2, description="User full name")
    organization_name: Optional[str] = Field(None, description="Create new organization")
    organization_slug: Optional[str] = Field(None, description="Organization slug")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@example.com",
                "password": "SecurePassword123",
                "full_name": "John Doe",
                "organization_name": "Acme Corp"
            }
        }


class LoginRequest(BaseModel):
    """User login request"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@example.com",
                "password": "SecurePassword123"
            }
        }


class RefreshTokenRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str = Field(..., description="Valid refresh token")

    class Config:
        json_schema_extra = {
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
        }


class ResetPasswordRequest(BaseModel):
    """Password reset request"""
    email: EmailStr = Field(..., description="User email")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@example.com"
            }
        }


class ConfirmResetRequest(BaseModel):
    """Confirm password reset with token"""
    reset_token: str = Field(..., description="Password reset token")
    new_password: str = Field(..., min_length=8, description="New password")

    class Config:
        json_schema_extra = {
            "example": {
                "reset_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "new_password": "NewPassword123"
            }
        }


class UserResponse(BaseModel):
    """User response model"""
    id: str = Field(..., description="User ID")
    email: str = Field(..., description="User email")
    full_name: str = Field(..., description="User full name")
    role: str = Field(..., description="User role")
    organization_id: str = Field(..., description="Organization ID")


class AuthResponse(BaseModel):
    """Authentication response with tokens"""
    user: UserResponse
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(default=3600, description="Access token expiration in seconds")


class AccessTokenResponse(BaseModel):
    """New access token response"""
    access_token: str = Field(..., description="New JWT access token")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(default=3600)


# ═════════════════════════════════════════════════════════════════════════════
# Authentication Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(
    request_data: RegisterRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    Register a new user with optional organization creation

    **User Registration Flow:**
    1. Validate email format and password strength
    2. Check if email already exists
    3. Create new organization (if organization_name provided)
    4. Hash password with bcrypt
    5. Create user record in database
    6. Generate JWT access and refresh tokens

    **Returns:**
    - User information
    - Access token (1 hour expiration)
    - Refresh token (7 days expiration)
    """
    try:
        result = AuthenticationService.register_user(
            db=db,
            email=request_data.email,
            password=request_data.password,
            full_name=request_data.full_name,
            organization_name=request_data.organization_name,
            organization_slug=request_data.organization_slug
        )
        return result
    except (ValidationError, ConflictError, NotFoundError, ApplicationError) as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "error": e.error_code,
                "message": e.message
            }
        )


@router.post("/login", response_model=AuthResponse)
async def login(
    request_data: LoginRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    User login with email and password

    **Login Flow:**
    1. Find active user by email
    2. Verify password against stored hash
    3. Check organization is active
    4. Update user last_login timestamp
    5. Generate JWT tokens

    **Returns:**
    - User information
    - Access token (1 hour expiration)
    - Refresh token (7 days expiration)
    """
    try:
        result = AuthenticationService.login(
            db=db,
            email=request_data.email,
            password=request_data.password
        )
        return result
    except (AuthenticationError, ApplicationError) as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "error": e.error_code,
                "message": e.message
            }
        )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    request_data: RefreshTokenRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    Refresh access token using refresh token

    **Refresh Flow:**
    1. Validate refresh token
    2. Extract user and org IDs from token claims
    3. Verify user and organization still exist and are active
    4. Generate new access token

    **Returns:**
    - New access token (1 hour expiration)
    - Refresh token remains valid (can reuse)
    """
    try:
        result = AuthenticationService.refresh_access_token(
            db=db,
            refresh_token=request_data.refresh_token
        )
        return result
    except (AuthenticationError, ApplicationError) as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "error": e.error_code,
                "message": e.message
            }
        )


@router.get("/me", response_model=UserResponse)
async def me(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db)
) -> dict:
    """Return the authenticated user's profile (requires a valid access token)"""
    user = UserRepository.get_by_id(db, UUID(claims["sub"]))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail={"error": "user_inactive", "message": "User no longer active"}
        )
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "organization_id": str(user.organization_id)
    }


@router.post("/logout")
async def logout(request: Request) -> dict:
    """
    User logout (invalidates tokens on client side)

    Note: JWT tokens are stateless. Client should discard tokens.
    In production, implement token blacklist for immediate revocation.
    """
    return {
        "message": "Logged out successfully",
        "success": True
    }


@router.post("/reset-password-request")
async def request_password_reset(
    request_data: ResetPasswordRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    Request password reset (sends reset token via email)

    **Security:**
    - Always returns success even if email not found (prevents user enumeration)
    - In production, sends reset token via email only
    - Reset token has 1 hour expiration
    """
    try:
        result = AuthenticationService.reset_password_request(
            db=db,
            email=request_data.email
        )
        return result
    except ApplicationError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "error": e.error_code,
                "message": e.message
            }
        )


@router.post("/reset-password")
async def confirm_password_reset(
    request_data: ConfirmResetRequest,
    db: Session = Depends(get_db)
) -> dict:
    """
    Confirm password reset with reset token

    **Password Reset Flow:**
    1. Validate reset token
    2. Validate new password strength
    3. Hash new password with bcrypt
    4. Update user password in database
    5. Invalidate token
    """
    try:
        result = AuthenticationService.reset_password(
            db=db,
            reset_token=request_data.reset_token,
            new_password=request_data.new_password
        )
        return result
    except (ValidationError, AuthenticationError, NotFoundError, ApplicationError) as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={
                "error": e.error_code,
                "message": e.message
            }
        )


@router.post("/verify-email")
async def verify_email(
    email_token: str,
    db: Session = Depends(get_db)
) -> dict:
    """
    Verify user email address (stub for future implementation)

    **Future Implementation:**
    - Validate email verification token
    - Mark email as verified in database
    - Update user email_verified flag
    """
    return {
        "message": "Email verification feature coming soon",
        "success": False
    }
