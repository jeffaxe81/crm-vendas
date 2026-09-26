"""Authentication endpoints (S1-05): register, login, refresh, me, logout, reset"""

from datetime import timedelta


from app.core import security
from tests.conftest import DEMO_EMAIL, DEMO_PASSWORD, auth_header

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
ME = "/api/v1/auth/me"
LOGOUT = "/api/v1/auth/logout"
RESET_REQUEST = "/api/v1/auth/reset-password-request"
RESET_CONFIRM = "/api/v1/auth/reset-password"


def _register(client, **overrides):
    payload = {
        "email": "ana@acme.com",
        "password": "SenhaForte123",
        "full_name": "Ana Souza",
        "organization_name": "Acme Vendas",
    }
    payload.update(overrides)
    return client.post(REGISTER, json=payload)


# ── Login ──────────────────────────────────────────────────────────────────

def test_login_with_seeded_demo_user(demo_tokens):
    assert demo_tokens["user"]["email"] == DEMO_EMAIL
    assert demo_tokens["user"]["role"] == "admin"
    assert demo_tokens["token_type"] == "bearer"
    claims = security.decode_token(demo_tokens["access_token"], security.TOKEN_ACCESS)
    assert claims["org_id"] == demo_tokens["user"]["organization_id"]


def test_login_is_case_insensitive_on_email(client):
    resp = client.post(LOGIN, json={"email": "DEMO@Example.com", "password": DEMO_PASSWORD})
    assert resp.status_code == 200


def test_login_wrong_password(client):
    resp = client.post(LOGIN, json={"email": DEMO_EMAIL, "password": "wrong-pass"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_credentials"


def test_login_unknown_user_gives_same_error(client):
    resp = client.post(LOGIN, json={"email": "nobody@example.com", "password": "whatever1"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_credentials"


def test_login_rejects_invalid_email_payload(client):
    resp = client.post(LOGIN, json={"email": "not-an-email", "password": "x"})
    assert resp.status_code == 422


def test_login_inactive_organization(client, db):
    from app.models import Organization

    _register(client)
    org = db.query(Organization).filter_by(slug="acme-vendas").one()
    org.is_active = False
    db.commit()

    resp = client.post(LOGIN, json={"email": "ana@acme.com", "password": "SenhaForte123"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "org_inactive"


# ── Register ───────────────────────────────────────────────────────────────

def test_register_creates_org_and_admin(client):
    resp = _register(client)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["role"] == "admin"
    assert body["access_token"] and body["refresh_token"]


def test_register_without_org_joins_dev_org_as_viewer(client, demo_tokens):
    resp = _register(client, email="joao@acme.com", organization_name=None)
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["role"] == "viewer"
    assert body["user"]["organization_id"] == demo_tokens["user"]["organization_id"]


def test_register_without_org_is_blocked_in_production(client, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    resp = _register(client, email="joao@acme.com", organization_name=None)
    assert resp.status_code == 400
    assert resp.json()["error"] == "organization_required"


def test_register_duplicate_email(client):
    assert _register(client).status_code == 201
    resp = _register(client, email="ANA@acme.com", organization_name="Outra Org")
    assert resp.status_code == 409
    assert resp.json()["error"] == "email_exists"


def test_register_duplicate_org_slug(client):
    assert _register(client).status_code == 201
    resp = _register(client, email="bia@acme.com")
    assert resp.status_code == 409
    assert resp.json()["error"] == "org_slug_exists"


def test_register_weak_password_rejected_by_schema(client):
    resp = _register(client, password="curta")
    assert resp.status_code == 422


def test_registered_user_can_login(client):
    _register(client)
    resp = client.post(LOGIN, json={"email": "ana@acme.com", "password": "SenhaForte123"})
    assert resp.status_code == 200


# ── Protected routes / me / logout ─────────────────────────────────────────

def test_me_requires_token(client):
    resp = client.get(ME)
    assert resp.status_code == 401


def test_me_returns_profile(client, demo_tokens):
    resp = client.get(ME, headers=auth_header(demo_tokens["access_token"]))
    assert resp.status_code == 200
    assert resp.json()["email"] == DEMO_EMAIL


def test_me_rejects_refresh_token(client, demo_tokens):
    resp = client.get(ME, headers=auth_header(demo_tokens["refresh_token"]))
    assert resp.status_code == 401
    assert resp.json()["error_code"] == "invalid_token"


def test_me_rejects_malformed_header(client, demo_tokens):
    resp = client.get(ME, headers={"Authorization": demo_tokens["access_token"]})
    assert resp.status_code == 401


def test_me_rejects_expired_token(client, demo_tokens):
    u = demo_tokens["user"]
    expired = security.create_access_token(
        u["id"], u["organization_id"], u["email"], u["role"],
        expires_delta=timedelta(seconds=-5),
    )
    resp = client.get(ME, headers=auth_header(expired))
    assert resp.status_code == 401


def test_me_for_deactivated_user(client, db, demo_tokens):
    from app.models import User

    user = db.query(User).filter_by(email=DEMO_EMAIL).one()
    user.is_active = False
    db.commit()
    resp = client.get(ME, headers=auth_header(demo_tokens["access_token"]))
    assert resp.status_code == 401


def test_logout(client, demo_tokens):
    resp = client.post(LOGOUT, headers=auth_header(demo_tokens["access_token"]))
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── Refresh ────────────────────────────────────────────────────────────────

def test_refresh_returns_new_access_token(client, demo_tokens):
    resp = client.post(REFRESH, json={"refresh_token": demo_tokens["refresh_token"]})
    assert resp.status_code == 200
    new_token = resp.json()["access_token"]
    assert client.get(ME, headers=auth_header(new_token)).status_code == 200


def test_refresh_rejects_access_token(client, demo_tokens):
    resp = client.post(REFRESH, json={"refresh_token": demo_tokens["access_token"]})
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_refresh_token"


def test_refresh_rejects_garbage(client):
    resp = client.post(REFRESH, json={"refresh_token": "not.a.jwt"})
    assert resp.status_code == 401


def test_refresh_rejects_non_uuid_subject(client):
    token = security._encode({
        "sub": "not-a-uuid", "org_id": "x", "type": security.TOKEN_REFRESH,
        "exp": security._now() + timedelta(minutes=5),
    })
    resp = client.post(REFRESH, json={"refresh_token": token})
    assert resp.status_code == 401


def test_refresh_rejects_mismatched_organization(client, demo_tokens):
    other_org = _register(client).json()["user"]["organization_id"]
    token = security.create_refresh_token(demo_tokens["user"]["id"], other_org)
    resp = client.post(REFRESH, json={"refresh_token": token})
    assert resp.status_code == 401
    assert resp.json()["error"] == "user_inactive"


def test_refresh_for_inactive_organization(client, db, demo_tokens):
    from app.models import Organization

    org = db.query(Organization).filter_by(slug="development-org").one()
    org.is_active = False
    db.commit()
    resp = client.post(REFRESH, json={"refresh_token": demo_tokens["refresh_token"]})
    assert resp.status_code == 401
    assert resp.json()["error"] == "org_inactive"


# ── Password reset ─────────────────────────────────────────────────────────

def test_reset_request_unknown_email_does_not_leak(client):
    resp = client.post(RESET_REQUEST, json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert "reset_token" not in resp.json()


def test_reset_token_hidden_outside_development(client, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    resp = client.post(RESET_REQUEST, json={"email": DEMO_EMAIL})
    assert resp.status_code == 200
    assert "reset_token" not in resp.json()


def test_full_password_reset_flow(client):
    token = client.post(RESET_REQUEST, json={"email": DEMO_EMAIL}).json()["reset_token"]

    resp = client.post(RESET_CONFIRM, json={"reset_token": token, "new_password": "NovaSenha456"})
    assert resp.status_code == 200

    assert client.post(LOGIN, json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).status_code == 401
    assert client.post(LOGIN, json={"email": DEMO_EMAIL, "password": "NovaSenha456"}).status_code == 200


def test_reset_token_is_single_use(client):
    token = client.post(RESET_REQUEST, json={"email": DEMO_EMAIL}).json()["reset_token"]
    assert client.post(RESET_CONFIRM, json={"reset_token": token, "new_password": "NovaSenha456"}).status_code == 200
    resp = client.post(RESET_CONFIRM, json={"reset_token": token, "new_password": "OutraSenha789"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "invalid_reset_token"


def test_reset_token_cannot_be_used_as_access_token(client):
    token = client.post(RESET_REQUEST, json={"email": DEMO_EMAIL}).json()["reset_token"]
    assert client.get(ME, headers=auth_header(token)).status_code == 401


def test_access_token_cannot_be_used_to_reset_password(client, demo_tokens):
    resp = client.post(
        RESET_CONFIRM,
        json={"reset_token": demo_tokens["access_token"], "new_password": "NovaSenha456"},
    )
    assert resp.status_code == 401


def test_reset_with_non_uuid_subject(client):
    token = security._encode({
        "sub": "nope", "pwd": "x", "type": security.TOKEN_RESET,
        "exp": security._now() + timedelta(minutes=5),
    })
    resp = client.post(RESET_CONFIRM, json={"reset_token": token, "new_password": "NovaSenha456"})
    assert resp.status_code == 401


def test_reset_rejects_short_password(client):
    resp = client.post(RESET_CONFIRM, json={"reset_token": "x", "new_password": "curta"})
    assert resp.status_code == 422


def test_verify_email_stub(client, demo_tokens):
    resp = client.post(
        "/api/v1/auth/verify-email",
        params={"email_token": "abc"},
        headers=auth_header(demo_tokens["access_token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is False
