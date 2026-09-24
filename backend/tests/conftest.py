"""
Test fixtures for the CRM-VENDAS backend.

Tests run against a real PostgreSQL database (the schema uses PostgreSQL
features: UUID, enums, the crm_core schema). Point TEST_DATABASE_URL at a
disposable database; it is migrated with Alembic at session start and every
test runs inside a transaction that is rolled back afterwards.
"""

import os

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://vendas_user:vendas_pass_dev@localhost:5432/crm_vendas_test",
)

# Safety net: the suite drops and recreates the schema, so never run it
# against a database that is not explicitly a test database.
if not TEST_DATABASE_URL.rsplit("/", 1)[-1].split("?")[0].endswith("_test"):
    raise RuntimeError(
        "TEST_DATABASE_URL must point to a database whose name ends with '_test'"
    )

# Must be set before any app module is imported
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-with-at-least-32-bytes!!")
os.environ.setdefault("BCRYPT_ROUNDS", "4")  # fast hashing in tests

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DATABASE_URL)
    with eng.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS crm_core"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    """Session bound to an outer transaction that is always rolled back."""
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture()
def client(db):
    from main import app
    from app.database import get_db

    def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture()
def demo_tokens(client):
    resp = client.post(
        "/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
