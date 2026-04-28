"""Local speech-to-text using faster-whisper (tiny.en model, CPU/int8)."""
import os
import tempfile

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    return _model


def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """Transcribe raw audio bytes and return the transcript string."""
    ext = ".webm"
    if "ogg" in content_type:
        ext = ".ogg"
    elif "mp4" in content_type or "m4a" in content_type:
        ext = ".mp4"
    elif "wav" in content_type:
        ext = ".wav"

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(audio_bytes)
        tmp = f.name

    try:
        model = _get_model()
        segments, _ = model.transcribe(tmp, language="en", beam_size=1, vad_filter=True)
        return " ".join(s.text.strip() for s in segments).strip()
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
