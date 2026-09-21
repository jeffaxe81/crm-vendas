"""
Authentication middleware for CRM-VENDAS
Extracts and validates JWT tokens from requests
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.core.security import decode_token, extract_token_from_header
from app.core.exceptions import AuthenticationError
from typing import List


# Routes that don't require authentication
PUBLIC_ROUTES = [
    "/health",
    "/ready",
    "/live",
    "/api/v1/health",
    "/api/v1/ready",
    "/api/v1/live",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/docs",
    "/redoc",
    "/openapi.json"
]


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract and validate JWT tokens
    Populates request.state with user information
    """

    async def dispatch(self, request: Request, call_next):
        """Process request and extract authentication"""

        # Check if route is public
        if self._is_public_route(request.url.path):
            return await call_next(request)

        # Extract token from Authorization header
        authorization = request.headers.get("Authorization", "")
        token = extract_token_from_header(authorization)

        if not token:
            # For non-public routes without token, return 401
            return JSONResponse(
                status_code=401,
                content={
                    "error": "unauthorized",
                    "message": "Missing or invalid authorization token",
                    "error_code": "missing_token"
                }
            )

        # Validate token
        claims = decode_token(token, "access")

        if not claims:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "unauthorized",
                    "message": "Invalid or expired token",
                    "error_code": "invalid_token"
                }
            )

        # Populate request state with user information
        request.state.user_id = claims.get("sub")
        request.state.organization_id = claims.get("org_id")
        request.state.email = claims.get("email")
        request.state.role = claims.get("role")
        request.state.token_claims = claims
        request.state.authenticated = True

        # Continue to next middleware/route
        response = await call_next(request)
        return response

    @staticmethod
    def _is_public_route(path: str) -> bool:
        """Check if route is in public routes list"""
        # Exact match
        if path in PUBLIC_ROUTES:
            return True

        # Prefix match
        for public_route in PUBLIC_ROUTES:
            if path.startswith(public_route):
                return True

        return False
