# src/privacy.py
import re

class PIIShield:
    def __init__(self):
        # Patterns for common sensitive data
        self.patterns = {
            "EMAIL": r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+',
            "PHONE": r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
            "CREDIT_CARD": r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
            "IP_ADDRESS": r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
        }

    def redact(self, text):
        """Replaces sensitive patterns with [REDACTED_TYPE] tags."""
        if not text:
            return text
            
        redacted_text = text
        for label, pattern in self.patterns.items():
            redacted_text = re.sub(pattern, f"[{label}]", redacted_text)
            
        return redacted_text

# Singleton instance
shield = PIIShield()