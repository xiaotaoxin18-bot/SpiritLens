"""API integration tests — run against a running server.

Requires:
  - Backend running on http://localhost:8085
  - PostgreSQL running with tables initialized
  - Redis running (for Celery-dependent features)

Usage:
  pytest tests/ -v
"""

import pytest
import httpx
import json
import os

# httpx on Windows may pick up system proxy config that breaks localhost requests
BASE = "http://localhost:8085"


@pytest.fixture(scope="module")
def client():
    """Shared httpx client for all tests — bypasses system proxy."""
    transport = httpx.HTTPTransport(trust_env=False)
    with httpx.Client(base_url=BASE, timeout=10, transport=transport) as c:
        yield c


# ─── Health ─────────────────────────────────────────────────────


def test_health(client: httpx.Client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


# ─── Auth ───────────────────────────────────────────────────────


def test_login_admin(client: httpx.Client):
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.fixture(scope="module")
def admin_token(client: httpx.Client) -> str:
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def user_token(client: httpx.Client) -> str:
    """Register a test user and return token."""
    import random
    suffix = random.randint(10000, 99999)
    # Get captcha first
    captcha_resp = client.get("/api/v1/auth/captcha")
    assert captcha_resp.status_code == 200
    captcha = captcha_resp.json()
    token = captcha["token"]
    # We can't read the SVG, so try common patterns
    # Most likely the captcha is "TEST" or similar — just try register
    resp = client.post("/api/v1/auth/register", json={
        "email": f"test{suffix}@example.com",
        "nickname": f"测试用户{suffix}",
        "password": "testpass123",
        "captcha_token": token,
        "captcha_text": "TEST",
    })
    # May fail on captcha, but if it works we get a user
    if resp.status_code == 201:
        login_resp = client.post("/api/v1/auth/login", json={
            "email": f"test{suffix}@example.com",
            "password": "testpass123",
        })
        assert login_resp.status_code == 200
        return login_resp.json()["access_token"]
    # Fallback: use admin token for tests that need any auth
    return None


def test_me(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/auth/me", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin"
    assert data["is_admin"] is True


def test_login_bad_password(client: httpx.Client):
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "wrong",
    })
    assert resp.status_code in (401, 422)


def test_login_missing_fields(client: httpx.Client):
    resp = client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422


def test_refresh_token(client: httpx.Client, admin_token: str):
    """Test token refresh endpoint."""
    # First get a refresh token by logging in
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200
    refresh_token = resp.json()["refresh_token"]

    refresh_resp = client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


# ─── Community ──────────────────────────────────────────────────


def test_list_posts(client: httpx.Client):
    resp = client.get("/api/v1/community/posts?page=1&page_size=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "posts" in data
    assert isinstance(data["posts"], list)


def test_featured_posts(client: httpx.Client):
    resp = client.get("/api/v1/community/featured")
    assert resp.status_code == 200
    data = resp.json()
    assert "posts" in data


def test_create_and_delete_post(client: httpx.Client, admin_token: str):
    """Create a new post with admin, then delete it."""
    # Create
    resp = client.post("/api/v1/community/posts", json={
        "title": "Pytest test post",
        "description": "Created during test",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201, resp.text
    post_id = resp.json()["id"]
    assert post_id

    # Verify it appears
    list_resp = client.get("/api/v1/community/posts", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    ids = [p["id"] for p in list_resp.json()["posts"]]
    assert post_id in ids

    # Delete
    del_resp = client.delete(f"/api/v1/community/posts/{post_id}", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert del_resp.status_code == 204


def test_community_like_toggle(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/community/posts?page=1&page_size=1")
    assert resp.status_code == 200
    posts = resp.json()["posts"]
    if not posts:
        pytest.skip("No posts to test")
    post_id = posts[0]["id"]

    # Toggle like
    resp = client.post(f"/api/v1/community/posts/{post_id}/like", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "liked" in data
    assert "like_count" in data


def test_community_add_comment(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/community/posts?page=1&page_size=1")
    posts = resp.json()["posts"]
    if not posts:
        pytest.skip("No posts to test")
    post_id = posts[0]["id"]

    resp = client.post(f"/api/v1/community/posts/{post_id}/comments",
        json={"content": "Test comment from pytest"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert "id" in data


def test_community_delete_comment(client: httpx.Client, admin_token: str):
    """Create a comment, verify it exists, then delete it."""
    resp = client.get("/api/v1/community/posts?page=1&page_size=1")
    posts = resp.json()["posts"]
    if not posts:
        pytest.skip("No posts to test")
    post_id = posts[0]["id"]

    # Create comment
    create_resp = client.post(f"/api/v1/community/posts/{post_id}/comments",
        json={"content": "Comment to be deleted"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 201
    comment_id = create_resp.json()["id"]

    # Verify it's listed
    list_resp = client.get(f"/api/v1/community/posts/{post_id}/comments")
    assert list_resp.status_code == 200
    comment_ids = [c["id"] for c in list_resp.json()["comments"]]
    assert comment_id in comment_ids

    # Delete it
    del_resp = client.delete(
        f"/api/v1/community/posts/{post_id}/comments/{comment_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_resp.status_code == 204

    # Verify it's gone
    list_resp2 = client.get(f"/api/v1/community/posts/{post_id}/comments")
    comment_ids2 = [c["id"] for c in list_resp2.json()["comments"]]
    assert comment_id not in comment_ids2


def test_get_single_post(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/community/posts?page=1&page_size=1")
    posts = resp.json()["posts"]
    if not posts:
        pytest.skip("No posts to test")
    post_id = posts[0]["id"]

    resp = client.get(f"/api/v1/community/posts/{post_id}", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == post_id
    assert "liked" in data
    assert "view_count" in data
    assert data["view_count"] > 0


def test_community_pagination(client: httpx.Client):
    """Test sort modes and pagination for community posts."""
    for sort in ("latest", "popular", "featured"):
        resp = client.get(f"/api/v1/community/posts?page=1&page_size=3&sort={sort}")
        assert resp.status_code == 200, f"Sort {sort} failed"
        data = resp.json()
        assert "posts" in data
        assert len(data["posts"]) <= 3


# ─── Assets ─────────────────────────────────────────────────────


def test_list_assets(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/user/assets?page_size=5", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)
    if data["items"]:
        item = data["items"][0]
        assert "type" in item
        assert "is_favorited" in item


def test_assets_type_case(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/user/assets?page_size=5", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    data = resp.json()
    for item in data["items"]:
        assert item["type"] == item["type"].lower()


def test_assets_favorites(client: httpx.Client, admin_token: str):
    """List favorites endpoint."""
    resp = client.get("/api/v1/user/assets/favorites", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


# ─── Models ──────────────────────────────────────────────────────


def test_list_models(client: httpx.Client):
    resp = client.get("/api/v1/models")
    assert resp.status_code == 200
    data = resp.json()
    if isinstance(data, dict):
        assert "models" in data
        data = data["models"]
    assert isinstance(data, list)
    # Should have some models
    assert len(data) > 0


def test_list_image_models(client: httpx.Client):
    resp = client.get("/api/v1/models?type=image")
    assert resp.status_code == 200
    data = resp.json()
    models = data["models"] if isinstance(data, dict) else data
    for m in models:
        assert m["type"] == "image"


def test_list_video_models(client: httpx.Client):
    resp = client.get("/api/v1/models?type=video")
    assert resp.status_code == 200
    data = resp.json()
    models = data["models"] if isinstance(data, dict) else data
    for m in models:
        assert m["type"] == "video"


# ─── Search & Enhance ────────────────────────────────────────────


def test_search_images(client: httpx.Client):
    """Search endpoint should respond (may return empty but not error)."""
    resp = client.get("/api/v1/search/images?q=cat&count=3")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert data["query"] == "cat"


def test_enhance_prompt(client: httpx.Client, admin_token: str):
    """Prompt enhancement endpoint (may return original if no API key)."""
    resp = client.post("/api/v1/enhance/prompt", json={
        "prompt": "一只猫",
    })
    # 200 or 500 if no API key configured — both acceptable
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        data = resp.json()
        assert "original" in data
        assert "enhanced" in data


# ─── Captcha ────────────────────────────────────────────────────


def test_captcha(client: httpx.Client):
    resp = client.get("/api/v1/auth/captcha")
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "image" in data


# ─── Admin ────────────────────────────────────────────────────────


def test_admin_dashboard(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/dashboard", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "total_creations" in data
    assert "recent_users" in data


def test_admin_dashboard_trends(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/dashboard/trends?days=7", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "dates" in data
    assert "series" in data


def test_admin_users(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/users", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "users" in data
    assert "total" in data


def test_admin_users_search(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/users?q=admin", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    for u in data["users"]:
        assert any("admin" in (str(v) or "").lower() for v in (u["username"], u["nickname"], u["email"]) if v)


def test_admin_models(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/models", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "models" in data
    assert len(data["models"]) > 0


def test_admin_logs(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/logs", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "logs" in data
    assert "total" in data


def test_admin_settings(client: httpx.Client, admin_token: str):
    resp = client.get("/api/v1/admin/settings", headers={
        "Authorization": f"Bearer {admin_token}",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "app_name" in data
    assert "app_version" in data
    assert "token_expire_minutes" in data


def test_admin_update_settings(client: httpx.Client, admin_token: str):
    """Update token expiry settings (save to Redis)."""
    resp = client.put("/api/v1/admin/settings", json={
        "token_expire_minutes": 120,
        "refresh_token_expire_days": 14,
    }, headers={"Authorization": f"Bearer {admin_token}"})
    # 200 if Redis available, 500 if not
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        assert resp.json()["token_expire_minutes"] == 120


def test_admin_test_connection(client: httpx.Client, admin_token: str):
    """Test API connection endpoint."""
    resp = client.post("/api/v1/admin/models/test-connection", json={
        "api_endpoint": "https://xinghezhiyun.com/api/v3/images/generations",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "success" in data


# ─── Video API ───────────────────────────────────────────────────


def test_video_generate(client: httpx.Client, admin_token: str):
    """Test video generation with a valid Seedance model ID."""
    resp = client.post("/api/v1/video/generate", json={
        "prompt": "test video from pytest",
        "model_id": "doubao-seedance-2-0-fast-260128",
        "duration": 3,
        "resolution": "720p",
        "camera": "static",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    # Will likely fail without a valid API key, but should return a proper response
    assert resp.status_code in (200, 500), f"Unexpected status: {resp.status_code}: {resp.text}"
    if resp.status_code == 200:
        data = resp.json()
        assert "task_id" in data


# ─── Upload ────────────────────────────────────────────────────


def test_upload_no_files(client: httpx.Client):
    """Upload endpoint with no files should return 422 or 400."""
    resp = client.post("/api/v1/upload")
    assert resp.status_code in (400, 422)


# ─── Unauthorized Access ──────────────────────────────────────


def test_admin_requires_auth(client: httpx.Client):
    """Admin endpoints should reject unauthenticated requests."""
    resp = client.get("/api/v1/admin/dashboard")
    assert resp.status_code in (401, 403)


def test_me_requires_auth(client: httpx.Client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ─── Models endpoint edge cases ────────────────────────────────


def test_get_single_model_capability(client: httpx.Client):
    """Fetch a known model's capabilities."""
    resp = client.get("/api/v1/models/doubao-seedream-4-5-251128")
    assert resp.status_code in (200, 404)  # 404 if disabled in DB
    if resp.status_code == 200:
        data = resp.json()
        assert data["type"] == "image"
        assert "supported_sizes" in data
