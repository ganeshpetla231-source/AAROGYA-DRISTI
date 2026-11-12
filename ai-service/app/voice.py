"""Google Cloud speech/translation adapters for the multilingual voice assistant."""
import html
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from google.cloud import speech_v1 as speech
from google.cloud import texttospeech
from google.cloud import translate_v2 as translate

router = APIRouter(prefix="/voice")
LANGUAGES = {"en-IN": "en", "te-IN": "te", "hi-IN": "hi", "ta-IN": "ta", "kn-IN": "kn"}
MAX_AUDIO = 10 * 1024 * 1024


def clients():
    # Credentials are read from Application Default Credentials, never sent to the browser.
    return speech.SpeechClient(), translate.Client(), texttospeech.TextToSpeechClient()


def recognize_once(client, content, language_code, mime_type):
    kind = mime_type.split(";", 1)[0].strip().lower()
    encodings = {
        "audio/webm": speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        "audio/ogg": speech.RecognitionConfig.AudioEncoding.OGG_OPUS,
        "audio/wav": speech.RecognitionConfig.AudioEncoding.LINEAR16,
        "audio/x-wav": speech.RecognitionConfig.AudioEncoding.LINEAR16,
        "audio/flac": speech.RecognitionConfig.AudioEncoding.FLAC,
        "audio/mpeg": speech.RecognitionConfig.AudioEncoding.MP3,
        "audio/mp3": speech.RecognitionConfig.AudioEncoding.MP3,
    }
    encoding = encodings.get(kind)
    if not encoding:
        raise HTTPException(415, "Use a browser recording encoded as WebM/Opus, Ogg/Opus, WAV, FLAC, or MP3.")
    config_args = {"encoding": encoding, "language_code": language_code, "enable_automatic_punctuation": True, "model": "latest_long"}
    if encoding in (speech.RecognitionConfig.AudioEncoding.WEBM_OPUS, speech.RecognitionConfig.AudioEncoding.OGG_OPUS):
        config_args["sample_rate_hertz"] = 48000
    response = client.recognize(config=speech.RecognitionConfig(**config_args), audio=speech.RecognitionAudio(content=content), timeout=55)
    if not response.results:
        return "", 0.0
    alternative = response.results[0].alternatives[0]
    return alternative.transcript.strip(), float(alternative.confidence or 0)


def detect_and_translate(translator, text, selected_language):
    detected = translator.detect_language(text)
    base_code = detected.get("language", LANGUAGES[selected_language]).split("-", 1)[0]
    detected_code = next((code for code, base in LANGUAGES.items() if base == base_code), selected_language)
    translated = translator.translate(text, source_language=base_code, target_language="en", format_="text")
    return detected_code, html.unescape(translated.get("translatedText", "")), float(detected.get("confidence", 0) or 0)


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form(...)):
    if language != "auto" and language not in LANGUAGES:
        raise HTTPException(400, "Choose English, Telugu, Hindi, Tamil, Kannada, or auto-detect.")
    content = await audio.read(MAX_AUDIO + 1)
    if not content:
        raise HTTPException(400, "The audio recording is empty.")
    if len(content) > MAX_AUDIO:
        raise HTTPException(413, "Audio exceeds the 10 MB limit. Record a shorter clip.")
    try:
        speech_client, translator, _ = clients()
        candidates = list(LANGUAGES) if language == "auto" else [language]
        with ThreadPoolExecutor(max_workers=min(len(candidates), 5)) as pool:
            attempts = list(pool.map(lambda code: recognize_once(speech_client, content, code, audio.content_type or ""), candidates))
        best = max(range(len(attempts)), key=lambda i: (attempts[i][1], bool(attempts[i][0])))
        transcript, confidence = attempts[best]
        if not transcript:
            raise HTTPException(422, "Speech was not recognized. Try recording again or use manual text entry.")
        selected = candidates[best]
        detected, english, detection_confidence = detect_and_translate(translator, transcript, selected)
        return {"transcript": transcript, "detectedLanguage": detected, "detectionConfidence": detection_confidence or None, "speechConfidence": confidence or None, "englishTranslation": english}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(503, "Google Cloud speech services are unavailable or not configured. You can use manual transcript entry.") from error


@router.post("/translate")
async def translate_text(text: str = Form(...), sourceLanguage: str = Form(...), targetLanguage: str = Form(...)):
    if not text.strip() or len(text) > 10000:
        raise HTTPException(400, "Enter text between 1 and 10,000 characters.")
    if sourceLanguage not in LANGUAGES.values() or targetLanguage not in LANGUAGES.values():
        raise HTTPException(400, "Translation supports English, Telugu, Hindi, Tamil, and Kannada.")
    try:
        _, translator, _ = clients()
        result = translator.translate(text, source_language=sourceLanguage, target_language=targetLanguage, format_="text")
        return {"translation": html.unescape(result.get("translatedText", ""))}
    except Exception as error:
        raise HTTPException(503, "Google Cloud Translation is unavailable or not configured.") from error


@router.post("/synthesize")
async def synthesize(text: str = Form(...), language: str = Form(...)):
    if not text.strip() or len(text) > 4000:
        raise HTTPException(400, "Enter text between 1 and 4,000 characters.")
    if language not in LANGUAGES:
        raise HTTPException(400, "Text-to-speech supports English, Telugu, Hindi, Tamil, and Kannada.")
    try:
        _, _, client = clients()
        result = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(language_code=language),
            audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
        )
        from fastapi.responses import Response
        return Response(content=result.audio_content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    except Exception as error:
        raise HTTPException(503, "Google Cloud Text-to-Speech is unavailable or not configured.") from error
