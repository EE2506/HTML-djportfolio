"""Run against an isolated PHP server and test database, never a live site."""
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE = "http://localhost:8417"
ORIGIN = "http://localhost:4173"
PASSWORD = "Portfolio integration test"
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(path, data=None, headers=None):
    if isinstance(data, dict):
        data = urllib.parse.urlencode(data, doseq=True).encode()
    request = urllib.request.Request(BASE + path, data, headers or {})
    try:
        response = client.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    if path == "/feed.php?feed=contact" and response.status == 429:
        assert 1 <= int(response.headers["Retry-After"]) <= 3600
    return response.status, response.read().decode()


def token(path="/admin/"):
    status, body = call(path)
    assert status == 200, (status, body)
    return re.search(r'name="csrf" value="([^"]+)"', body)[1]


def admin(action, path="/admin/", **fields):
    return call(path, {"csrf": token(path), "action": action, **fields})


def catalog(category=""):
    status, body = call("/feed.php?feed=projects&category=" + category, headers={"Origin": ORIGIN})
    assert status == 200, (status, body)
    return json.loads(body)


def item(project_id):
    return next(row for row in catalog()["items"] if row["id"] == project_id)


def upload(data, expected, **fields):
    path = "/admin/?edit=2"
    boundary = "portfolio-integration-fixture"
    body = b""
    for key, value in {"csrf": token(path), "action": "project-save", "id": 2, "title": "Case study",
                       "category_id": 1, "sort_order": -1, **fields}.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.webp"'
             '\r\nContent-Type: image/webp\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
    status, response = call(path, body, {"Content-Type": "multipart/form-data; boundary=" + boundary})
    assert status == 200 and expected in response, (status, response[:2000])


def check_contact():
    path = "/feed.php?feed=contact"
    headers = {"Origin": ORIGIN, "Content-Type": "application/json"}
    valid = {"name": "Test", "email": "fixture@example.com", "message": "Test"}
    for payload, expected in [
        (b"{", 400), (b"[]", 400), (b"{}", 422), (b"x" * 16001, 413),
        (json.dumps({**valid, "website": "0"}).encode(), 422),
        (json.dumps({**valid, "website": None}).encode(), 422),
        (json.dumps({**valid, "name": "Test\n"}).encode(), 422),
        (json.dumps({**valid, "message": "Text\u0000"}).encode(), 422),
        (json.dumps({**valid, "message": "a" * 3001}).encode(), 422),
    ]:
        assert call(path, payload, headers)[0] == expected
    body = json.dumps(valid).encode()
    assert call(path, body, {**headers, "Origin": "https://example.com"})[0] == 403
    assert call(path, body, {**headers, "Content-Type": "text/plain"})[0] == 415
    # Each valid attempt reaches the intentionally unconfigured mailer until the IP cap.
    statuses = [call(path, body, {**headers, "X-Forwarded-For": f"192.0.2.{n}"})[0] for n in range(1, 5)]
    assert statuses == [503, 503, 503, 429], statuses


def main():
    assert call("/admin/", {"action": "login", "password": PASSWORD})[0] == 403
    assert admin("login", password="Wrong password")[0] == 401
    assert admin("login", password=PASSWORD)[0] == 200
    assert [row["id"] for row in catalog()["items"]] == ["github-101", "github-102"]
    assert "Changes saved." in admin("category-save", id=0, name="Client work", slug="client-work", sort_order=1)[1]
    assert "Changes saved." in admin("tag-save", id=0, name="PHP")[1]
    assert "Changes saved." in admin("project-save", id=0, github_id=101, title="GitHub override",
                                     category_id=4, sort_order=10, pinned=1, **{"tags[]": [1]})[1]
    assert "Changes saved." in admin("project-save", id=0, title="Case study", category_id=1, sort_order=-1)[1]
    assert [row["id"] for row in catalog()["items"]] == ["github-101", "custom-2", "github-102"]
    assert item("github-101")["tags"] == ["PHP"]
    assert catalog("client-work")["items"][0]["title"] == "GitHub override"
    assert "Move all projects" in admin("category-delete", id=4)[1]
    assert "Changes saved." in admin("category-save", id=4, name="Client projects", slug="clients", sort_order=0)[1]
    assert catalog("clients")["categories"][0]["name"] == "Client projects"
    assert "Changes saved." in admin("tag-save", id=1, name="Laravel")[1]
    assert item("github-101")["tags"] == ["Laravel"]
    assert "Changes saved." in admin("project-save", id=1, title="GitHub override", category_id=1,
                                     sort_order=10, hidden=1)[1]
    assert [row["id"] for row in catalog()["items"]] == ["custom-2", "github-102"]
    assert "Changes saved." in admin("category-delete", id=4)[1]
    assert "Changes saved." in admin("tag-delete", id=1)[1]

    portrait = Path(__file__).resolve().parents[2] / "assets/img/dj-portrait.webp"
    upload(b"not an image", "Upload a valid JPEG")
    upload(b"x" * (5 * 1024 * 1024 + 1), "Upload one image no larger than 5 MB")
    upload(portrait.read_bytes(), "Changes saved.")
    image = item("custom-2")["image"]
    assert re.fullmatch(r"[a-f0-9]{32}\.webp", image)
    assert item("custom-2")["imageAlt"] == "Case study"
    assert "Changes saved." in admin("project-delete", id=2)[1]
    media = Path(sys.argv[1])
    assert not (media / image).exists(), "Removed project image should be deleted"
    assert [row["id"] for row in catalog()["items"]] == ["github-102"]

    # Force a database outage without changing the running server or its database.
    env = media.parent.parent / "private/.env"
    good_config = env.read_bytes()
    try:
        env.write_bytes(good_config.replace(b"DB_NAME=portfolio_test", b"DB_NAME=missing_fixture"))
        assert [row["id"] for row in catalog()["items"]] == ["github-102"]
    finally:
        env.write_bytes(good_config)

    check_contact()

    assert "Sign in" in admin("logout")[1]
    for _ in range(4):
        assert admin("login", password="Wrong password")[0] == 401
    assert admin("login", password=PASSWORD)[0] == 429
    print("MySQL admin, upload, outage fallback, contact validation and rate-limit checks passed.")


if __name__ == "__main__":
    main()
