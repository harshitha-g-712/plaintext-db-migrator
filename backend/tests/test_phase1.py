"""
Phase 1 — Basic API tests.
Run: pytest tests/ -v
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register
        reg = await client.post("/api/auth/register", json={
            "name": "Test User",
            "email": "test@example.com",
            "password": "testpass123",
            "role": "DEVELOPER",
        })
        assert reg.status_code == 201, reg.text

        # Login
        login = await client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "testpass123",
        })
        assert login.status_code == 200
        token_data = login.json()
        assert "access_token" in token_data

        # Me
        token = token_data["access_token"]
        me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == "test@example.com"
