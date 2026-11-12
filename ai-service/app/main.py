"""Aarogya Drishti AI API. Image inference is disabled until a validated model is configured."""
import io
import os
import secrets

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from dotenv import load_dotenv
from .voice import router as voice_router

load_dotenv()

app = FastAPI(title="Aarogya Drishti AI Service", version="0.2.0")
def require_backend_token(authorization: str | None = Header(default=None)):
    expected = os.getenv("AI_SERVICE_TOKEN", "")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not expected or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="A valid backend service token is required.")


app.include_router(voice_router, dependencies=[Depends(require_backend_token)])
MAX_BYTES = 8 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "success", "service": "aarogya-drishti-ai", "imageAnalysisAvailable": False,
            "reason": "No validated oral-image model is configured."}


def image_quality(image: Image.Image):
    gray = image.convert("L").resize((96, 96))
    pixels = list(gray.getdata())
    brightness = sum(pixels) / len(pixels)
    laplacian = []
    for y in range(1, 95):
        for x in range(1, 95):
            i = y * 96 + x
            laplacian.append(4 * pixels[i] - pixels[i - 1] - pixels[i + 1] - pixels[i - 96] - pixels[i + 96])
    mean = sum(laplacian) / len(laplacian)
    sharpness = sum((value - mean) ** 2 for value in laplacian) / len(laplacian)
    return brightness, sharpness


@app.post("/analyze", dependencies=[Depends(require_backend_token)])
async def analyze(image: UploadFile = File(...)):
    content = await image.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Image exceeds the 8 MB limit. Choose a smaller image.")
    try:
        source = Image.open(io.BytesIO(content))
        source.verify()
        source = Image.open(io.BytesIO(content)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(415, "Image could not be decoded. Use JPEG, PNG, or WebP.")
    if source.width < 160 or source.height < 160:
        raise HTTPException(422, "Image resolution is too low. Capture at least 160 × 160 pixels.")
    brightness, sharpness = image_quality(source)
    if brightness < 32:
        raise HTTPException(422, "Image is too dark. Move to brighter, even lighting and retake it.")
    if brightness > 228:
        raise HTTPException(422, "Image is overexposed. Reduce glare and retake it in even lighting.")
    if sharpness < 18:
        raise HTTPException(422, "Image appears blurry. Hold the camera steady and retake it.")

    raise HTTPException(503, "AI image screening is unavailable because no validated oral-image model is configured. No prediction was generated.")
