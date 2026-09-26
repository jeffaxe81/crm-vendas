"""Unit tests: password hashing, JWT helpers, RBAC dependency, config guard"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import security
from app.core.permissions import require_roles
from app.middleware import AuthenticationMiddleware
from app.models import UserRole


def test_hash_and_verify_password():
    hashed = security.hash_password("s3nh@Forte")
    assert hashed != "s3nh@Forte"
    assert security.verify_password("s3nh@Forte", hashed)
    assert not security.verify_password("outra", hashed)


def test_verify_password_with_malformed_hash():
    assert security.verify_password("x", "not-a-bcrypt-hash") is False


@pytest.mark.parametrize(
    "header,expected",
    [
        ("Bearer abc", "abc"),
        ("bearer abc", "abc"),
        ("", None),
        ("Token abc", None),
        ("Bearer", None),
        ("Bearer a b", None),
    ],
)
def test_extract_token_from_header(header, expected):
    assert security.extract_token_from_header(header) == expected


def test_decode_token_checks_type():
    access = security.create_access_token("u", "o", "e@x.com", "admin")
    assert security.decode_token(access, security.TOKEN_ACCESS)["sub"] == "u"
    assert security.decode_token(access, security.TOKEN_REFRESH) is None


def test_decode_token_rejects_wrong_signature():
    import jwt

    forged = jwt.encode(
        {"sub": "u", "type": "access", "exp": security._now().timestamp() + 60},
        "another-secret-with-at-least-32-bytes",
        algorithm="HS256",
    )
    assert security.decode_token(forged) is None


def test_ensure_secure_config_blocks_default_secret(monkeypatch):
    monkeypatch.setattr(security, "JWT_SECRET", security.DEFAULT_JWT_SECRET)
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError):
        security.ensure_secure_config()

    monkeypatch.setenv("ENVIRONMENT", "development")
    security.ensure_secure_config()  # allowed in development


# ── RBAC ───────────────────────────────────────────────────────────────────

@pytest.fixture()
def rbac_client():
    app = FastAPI()
    app.add_middleware(AuthenticationMiddleware)

    @app.get("/api/v1/admin-only")
    def admin_only(claims=Depends(require_roles(UserRole.ADMIN))):
        return {"ok": True, "role": claims["role"]}

    @app.get("/api/v1/sales")
    def sales(claims=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP))):
        return {"ok": True}

    @app.get("/api/v1/health")
    def public_with_dependency(claims=Depends(require_roles(UserRole.ADMIN))):
        return {"ok": True}

    return TestClient(app)


def _token(role: str) -> dict:
    t = security.create_access_token("11111111-1111-1111-1111-111111111111", "o", "e@x.com", role)
    return {"Authorization": f"Bearer {t}"}


@pytest.mark.parametrize(
    "role,admin_status,sales_status",
    [
        ("admin", 200, 200),
        ("manager", 403, 200),
        ("sales_rep", 403, 200),
        ("viewer", 403, 403),
    ],
)
def test_role_matrix(rbac_client, role, admin_status, sales_status):
    assert rbac_client.get("/api/v1/admin-only", headers=_token(role)).status_code == admin_status
    assert rbac_client.get("/api/v1/sales", headers=_token(role)).status_code == sales_status


def test_rbac_dependency_without_authentication_returns_401(rbac_client):
    # Public route (middleware skips auth) but the dependency still demands it
    assert rbac_client.get("/api/v1/health").status_code == 401


def test_cors_preflight_is_not_blocked(rbac_client):
    resp = rbac_client.options("/api/v1/admin-only")
    assert resp.status_code != 401
