# src/privacy.py
import re

class PIIShield:
    def __init__(self):
        self.patterns = {
            "EMAIL":        r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+',
            "PHONE":        r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
            "CREDIT_CARD":  r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
            "IP_ADDRESS":   r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
            # US Social Security Number: 123-45-6789
            "SSN":          r'\b\d{3}-\d{2}-\d{4}\b',
            # Australian Tax File Number: 123 456 789 or 12 345 678
            "TFN":          r'\bTFN[\s:]*\d[\d\s]{7,10}\b|\b\d{3}\s\d{3}\s\d{3}\b',
            # Australian Business Number: 51 824 753 556
            "ABN":          r'\bABN[\s:]*\d[\d\s]{10,13}\b|\b\d{2}\s\d{3}\s\d{3}\s\d{3}\b',
            # Passport numbers (generic: letter(s) + 6-9 digits)
            "PASSPORT":     r'\b[A-Z]{1,2}\d{6,9}\b',
            # Dates of birth: DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD
            "DATE_OF_BIRTH": r'\bDOB[\s:]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b',
        }

    def redact(self, text: str) -> str:
        if not text:
            return text
        try:
            for label, pattern in self.patterns.items():
                text = re.sub(pattern, f"[{label}]", text)
            return text
        except Exception as exc:
            import logging
            logging.error("PIIShield.redact failed — blocking query for safety: %s", exc)
            raise RuntimeError(
                "PII redaction failed; query blocked to protect data sovereignty"
            ) from exc

    def redact_and_log(
        self,
        text: str,
        username: str = "",
        project: str = "",
        context: str = "query",
    ) -> str:
        """Redact PII and persist a count-per-type audit event to the database.

        Logging failures are swallowed so a DB outage never blocks redaction.
        """
        if not text:
            return text
        try:
            from src.database import log_redaction_event
            for label, pattern in self.patterns.items():
                hits = len(re.findall(pattern, text))
                if hits:
                    try:
                        log_redaction_event(username, label, hits, context, project)
                    except Exception:
                        pass  # never let logging failure expose PII
        except ImportError:
            pass  # running in an environment without the DB (e.g. tests that don't need it)
        return self.redact(text)

shield = PIIShield()
