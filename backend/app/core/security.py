"""
Security utilities for CRM-VENDAS
Handles JWT token generation/validation and password hashing
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import os

import bcrypt
import jwt

# JWT Configuration
DEFAULT_JWT_SECRET = "your-secret-key-change-in-production"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_EXPIRATION = int(os.getenv("JWT_EXPIRATION", "3600"))  # 1 hour
JWT_REFRESH_EXPIRATION = 7 * 24 * 60 * 60  # 7 days
JWT_RESET_EXPIRATION = 60 * 60  # 1 hour

# Token types — a token of one type is never accepted where another is expected
TOKEN_ACCESS = "access"
TOKEN_REFRESH = "refresh"
TOKEN_RESET = "password_reset"

BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))


def ensure_secure_config() -> None:
    """Refuse to start outside development with the placeholder JWT secret."""
    environment = os.getenv("ENVIRONMENT", "development")
    if environment not in ("development", "test") and JWT_SECRET == DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET must be set to a strong random value outside development"
        )


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        # Malformed hash stored in the database
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _encode(payload: Dict[str, Any]) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(
    user_id: str,
    organization_id: str,
    email: str,
    role: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create JWT access token"""
    now = _now()
    expire = now + (expires_delta or timedelta(seconds=JWT_ACCESS_EXPIRATION))
    return _encode({
        "sub": user_id,
        "org_id": organization_id,
        "email": email,
        "role": role,
        "exp": expire,
        "iat": now,
        "type": TOKEN_ACCESS,
    })


def create_refresh_token(user_id: str, organization_id: str) -> str:
    """Create JWT refresh token"""
    now = _now()
    return _encode({
        "sub": user_id,
        "org_id": organization_id,
        "exp": now + timedelta(seconds=JWT_REFRESH_EXPIRATION),
        "iat": now,
        "type": TOKEN_REFRESH,
    })


def create_password_reset_token(user_id: str, password_hash: str) -> str:
    """
    Create a single-purpose password reset token.

    The token embeds a fingerprint of the current password hash, so it stops
    working as soon as the password is changed (single use).
    """
    now = _now()
    return _encode({
        "sub": user_id,
        "pwd": password_fingerprint(password_hash),
        "exp": now + timedelta(seconds=JWT_RESET_EXPIRATION),
        "iat": now,
        "type": TOKEN_RESET,
    })


def password_fingerprint(password_hash: str) -> str:
    """Short, non-reversible fingerprint of a stored password hash"""
    # The bcrypt hash already contains a random salt; its tail is enough to
    # detect a change without exposing the hash itself.
    return password_hash[-10:]


def decode_token(token: str, token_type: str = TOKEN_ACCESS) -> Optional[Dict[str, Any]]:
    """Decode and validate JWT token; returns claims or None if invalid"""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError:
        return None

    if payload.get("type") != token_type:
        return None

    return payload


def extract_token_from_header(authorization: str) -> Optional[str]:
    """Extract JWT token from 'Authorization: Bearer <token>' header"""
    if not authorization:
        return None

    parts = authorization.split()

    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]
