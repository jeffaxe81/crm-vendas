"""
Custom exceptions for CRM-VENDAS
Provides structured error handling across the application
"""

from typing import Optional


class ApplicationError(Exception):
    """Base application error"""

    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[dict] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(ApplicationError):
    """Request validation error"""
    def __init__(self, message: str, error_code: str = "validation_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 400, details)


class AuthenticationError(ApplicationError):
    """Authentication failure"""
    def __init__(self, message: str, error_code: str = "authentication_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 401, details)


class AuthorizationError(ApplicationError):
    """Authorization failure (insufficient permissions)"""
    def __init__(self, message: str, error_code: str = "authorization_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 403, details)


class NotFoundError(ApplicationError):
    """Resource not found"""
    def __init__(self, message: str, error_code: str = "not_found", details: Optional[dict] = None):
        super().__init__(message, error_code, 404, details)


class ConflictError(ApplicationError):
    """Resource conflict (e.g., duplicate)"""
    def __init__(self, message: str, error_code: str = "conflict", details: Optional[dict] = None):
        super().__init__(message, error_code, 409, details)


class RateLimitError(ApplicationError):
    """Rate limit exceeded"""
    def __init__(self, message: str, error_code: str = "rate_limit", details: Optional[dict] = None):
        super().__init__(message, error_code, 429, details)


class DatabaseError(ApplicationError):
    """Database operation error"""
    def __init__(self, message: str, error_code: str = "database_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 500, details)


class ExternalServiceError(ApplicationError):
    """External service call error"""
    def __init__(self, message: str, error_code: str = "external_service_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 502, details)


class ConfigurationError(ApplicationError):
    """Configuration/setup error"""
    def __init__(self, message: str, error_code: str = "configuration_error", details: Optional[dict] = None):
        super().__init__(message, error_code, 500, details)


class PermissionError(ApplicationError):
    """Permission denied"""
    def __init__(self, message: str, error_code: str = "permission_denied", details: Optional[dict] = None):
        super().__init__(message, error_code, 403, details)
