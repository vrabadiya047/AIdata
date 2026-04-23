# src/image_reader.py
"""OCR-based image reader for LlamaIndex — extracts text from images using Tesseract."""
import os
import subprocess
from llama_index.core.readers.base import BaseReader
from llama_index.core import Document

IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".gif", ".webp"]

_TESSERACT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

_checked = False
_ocr_ok = False


def _set_tesseract_cmd():
    """Point pytesseract at the Windows binary if present."""
    import pytesseract
    if os.name == "nt" and os.path.exists(_TESSERACT_WIN_PATH):
        pytesseract.pytesseract.tesseract_cmd = _TESSERACT_WIN_PATH


def _try_winget_install() -> bool:
    """Silently install Tesseract via winget (pre-installed on Windows 11)."""
    print("🔧 Tesseract not found — attempting automatic install via winget...")
    try:
        result = subprocess.run(
            [
                "winget", "install",
                "--id", "UB-Mannheim.TesseractOCR",
                "-e",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ],
            capture_output=True, text=True, timeout=180,
        )
        if result.returncode == 0 or "already installed" in result.stdout.lower():
            print("✅ Tesseract installed via winget.")
            return True
        print(f"⚠️  winget returned code {result.returncode}: {result.stderr.strip()}")
        return False
    except FileNotFoundError:
        print("⚠️  winget not available on this system.")
        return False
    except subprocess.TimeoutExpired:
        print("⚠️  winget install timed out.")
        return False
    except Exception as e:
        print(f"⚠️  Auto-install failed: {e}")
        return False


def _ensure_tesseract() -> bool:
    global _checked, _ocr_ok
    if _checked:
        return _ocr_ok
    _checked = True

    import pytesseract

    # First attempt: already installed?
    _set_tesseract_cmd()
    try:
        pytesseract.get_tesseract_version()
        _ocr_ok = True
        print("✅ Tesseract OCR ready — image files will be indexed.")
        return True
    except Exception:
        pass

    # Second attempt: auto-install via winget
    if os.name == "nt" and _try_winget_install():
        _set_tesseract_cmd()
        try:
            pytesseract.get_tesseract_version()
            _ocr_ok = True
            print("✅ Tesseract OCR ready after auto-install.")
            return True
        except Exception as e:
            print(f"⚠️  Tesseract still not detected after install: {e}")
            print("   Try restarting the backend — winget may need a new PATH session.")

    _ocr_ok = False
    return False


class OCRImageReader(BaseReader):
    """Reads an image and extracts its text content via Tesseract OCR."""

    def load_data(self, file, extra_info=None):
        file_path = str(file)
        filename = os.path.basename(file_path)

        if not _ensure_tesseract():
            return [Document(
                text=f"[Image: {filename}] Tesseract OCR is not available — restart the backend after installation.",
                extra_info=extra_info or {},
            )]

        try:
            import pytesseract
            from PIL import Image
            img = Image.open(file_path)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            text = pytesseract.image_to_string(img).strip()
        except Exception as e:
            print(f"⚠️  OCR failed for {filename}: {e}")
            text = ""

        content = f"[Image: {filename}]\n\n{text}" if text else f"[Image: {filename}] No readable text found."
        return [Document(text=content, extra_info=extra_info or {})]


def get_image_file_extractor() -> dict:
    """Returns extension → reader mapping for use in SimpleDirectoryReader."""
    reader = OCRImageReader()
    return {ext: reader for ext in IMAGE_EXTENSIONS}
