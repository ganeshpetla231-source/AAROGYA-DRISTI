from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.voice import LANGUAGES

client = TestClient(app)
SERVICE_TOKEN = "test-ai-service-token"


def png(width: int, height: int) -> bytes:
    image = Image.new("RGB", (width, height), color=(120, 90, 80))
    result = BytesIO()
    image.save(result, format="PNG")
    return result.getvalue()


def test_health_reports_model_unavailable_without_fake_adapter():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["imageAnalysisAvailable"] is False
    assert "validated" in response.json()["reason"]
    assert "adapter" not in response.json()


def test_supported_voice_languages_are_the_five_requested_locales():
    assert set(LANGUAGES) == {"en-IN", "te-IN", "hi-IN", "ta-IN", "kn-IN"}


@pytest.mark.parametrize("route,form_data", [
    ("/analyze", {"files": {"image": ("fake.png", b"not an image", "image/png")}}),
    ("/voice/transcribe", {"files": {"audio": ("voice.webm", b"not audio", "audio/webm")}, "data": {"language": "en-IN"}}),
])
def test_ai_routes_reject_missing_service_token(monkeypatch, route, form_data):
    monkeypatch.setenv("AI_SERVICE_TOKEN", SERVICE_TOKEN)
    response = client.post(route, **form_data)
    assert response.status_code == 401


def test_image_upload_rejects_mime_spoofing(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", SERVICE_TOKEN)
    response = client.post("/analyze", headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}, files={"image": ("fake.png", b"not an image", "image/png")})
    assert response.status_code == 415


def test_image_upload_rejects_too_small_resolution(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", SERVICE_TOKEN)
    response = client.post("/analyze", headers={"Authorization": f"Bearer {SERVICE_TOKEN}"}, files={"image": ("small.png", png(64, 64), "image/png")})
    assert response.status_code == 422


def test_valid_image_does_not_receive_synthetic_prediction(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", SERVICE_TOKEN)
    response = client.post("/analyze", headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
                           files={"image": ("mouth.png", png(256, 256), "image/png")})
    assert response.status_code == 503
    assert "No prediction was generated" in response.json()["detail"]
    assert "confidence" not in response.json()
