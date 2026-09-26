"""
Role-based access control (RBAC) helpers for CRM-VENDAS.

Usage in a router:

    @router.delete("/things/{id}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
    async def delete_thing(...): ...

The AuthenticationMiddleware has already validated the JWT and populated
request.state; these dependencies only read from it.
"""

from typing import Callable, Dict, Any

from fastapi import HTTPException, Request

from app.models import UserRole


def get_current_claims(request: Request) -> Dict[str, Any]:
    """Return the authenticated user's token claims or raise 401"""
    if not getattr(request.state, "authenticated", False):
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Authentication required"},
        )
    return request.state.token_claims


def require_roles(*roles: UserRole) -> Callable[[Request], Dict[str, Any]]:
    """Dependency factory: allow only users whose role is in `roles`"""
    allowed = {r.value for r in roles}

    def _dependency(request: Request) -> Dict[str, Any]:
        claims = get_current_claims(request)
        if claims.get("role") not in allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "forbidden",
                    "message": "Insufficient permissions for this operation",
                },
            )
        return claims

    return _dependency
