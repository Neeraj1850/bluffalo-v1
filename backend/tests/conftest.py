import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base

TOKEN = "test-token"


@pytest.fixture
def db_factory():
    """A fresh in-memory database per test, with the real models."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def client(db_factory, monkeypatch):
    monkeypatch.setenv("BACKEND_TOKEN", TOKEN)

    def override():
        with db_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"}) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def session_id(client):
    return client.post("/sessions").json()["id"]
