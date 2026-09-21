"""Middleware components for CRM-VENDAS"""

from app.middleware.auth import AuthenticationMiddleware

__all__ = ["AuthenticationMiddleware"]
