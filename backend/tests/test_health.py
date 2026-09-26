"""Health, readiness and root endpoints"""

from app.database import get_db


def test_health_is_public(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "crm-vendas-backend"


def test_liveness(client):
    resp = client.get("/api/v1/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "alive"


def test_readiness_with_database(client):
    resp = client.get("/api/v1/ready")
    assert resp.status_code == 200
    assert resp.json()["checks"]["database"] == "healthy"


def test_readiness_returns_503_when_database_fails(client):
    from main import app

    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("connection refused")

    def _broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = _broken_db
    resp = client.get("/api/v1/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    # Internal error details must not leak
    assert "connection refused" not in resp.text


def test_root_endpoints_are_public(client):
    assert client.get("/").status_code == 200
    assert client.get("/api/v1").status_code == 200


def test_openapi_docs_are_public(client):
    assert client.get("/api/v1/openapi.json").status_code == 200
    assert client.get("/api/v1/docs").status_code == 200


def test_unknown_protected_route_requires_token(client):
    resp = client.get("/api/v1/anything")
    assert resp.status_code == 401
    assert resp.json()["error_code"] == "missing_token"


def test_untrusted_host_is_rejected(client):
    resp = client.get("/api/v1/health", headers={"host": "evil.example.org"})
    assert resp.status_code == 400
