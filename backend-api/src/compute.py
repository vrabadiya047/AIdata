# src/compute.py
"""
Pre-LLM computation layer.

After retrieval, before synthesis, this module detects quantitative questions
(durations, ages, sums, averages, comparisons, counts) and computes the answer
directly from the retrieved text using Python. The result is injected as a
"VERIFIED COMPUTED FACTS" block so the LLM reads a correct number instead of
attempting arithmetic itself.

Entry point: enrich_context(query, node_texts) -> str
"""
import re
from datetime import date
from typing import Optional

_TODAY = date.today()

_MONTH_MAP = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9,
    'oct': 10, 'nov': 11, 'dec': 12,
}


# ── Date parsing ──────────────────────────────────────────────────────────────

def _parse_dates(text: str) -> list[date]:
    """Extract all recognisable dates from text, sorted ascending."""
    found: list[date] = []
    t = text.lower()

    # "March 1, 2023" / "March 1 2023"
    for m in re.finditer(
        r'\b(january|february|march|april|may|june|july|august|september|'
        r'october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?'
        r'\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b', t
    ):
        try:
            found.append(date(int(m.group(3)), _MONTH_MAP[m.group(1).rstrip('.')], int(m.group(2))))
        except (ValueError, KeyError):
            pass

    # "1 March 2023"
    for m in re.finditer(
        r'\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|'
        r'july|august|september|october|november|december|jan|feb|mar|apr|jun|'
        r'jul|aug|sep|oct|nov|dec)\.?\s+(\d{4})\b', t
    ):
        try:
            found.append(date(int(m.group(3)), _MONTH_MAP[m.group(2).rstrip('.')], int(m.group(1))))
        except (ValueError, KeyError):
            pass

    # "March 2023" (no day — assume 1st, only if no precise date for that month/year)
    for m in re.finditer(
        r'\b(january|february|march|april|may|june|july|august|september|'
        r'october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?'
        r'\s+(\d{4})\b', t
    ):
        try:
            mo = _MONTH_MAP[m.group(1).rstrip('.')]
            yr = int(m.group(2))
            if not any(d.year == yr and d.month == mo for d in found):
                found.append(date(yr, mo, 1))
        except (ValueError, KeyError):
            pass

    # ISO "2023-03-01"
    for m in re.finditer(r'\b(\d{4})-(\d{2})-(\d{2})\b', text):
        try:
            found.append(date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except ValueError:
            pass

    # "DD/MM/YYYY" — only if year looks valid (avoids false positives)
    for m in re.finditer(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', text):
        try:
            yr = int(m.group(3))
            if 1900 < yr <= _TODAY.year + 5:
                found.append(date(yr, int(m.group(2)), int(m.group(1))))
        except ValueError:
            pass

    return sorted(set(found))


# ── Number parsing ────────────────────────────────────────────────────────────

def _parse_numbers(text: str) -> list[float]:
    """Extract numeric values, excluding 4-digit year-like integers."""
    results = []
    for m in re.finditer(r'(?<!\d)(\d[\d,]*(?:\.\d+)?)(?!\d)', text):
        raw = m.group(1).replace(',', '')
        try:
            v = float(raw)
            if not (1800 <= v <= 2100 and '.' not in raw):  # skip year-shaped ints
                results.append(v)
        except ValueError:
            pass
    return results


# ── Duration helpers ──────────────────────────────────────────────────────────

def _inclusive_months(start: date, end: date) -> int:
    """Count calendar months from start to end, both inclusive."""
    if end < start:
        start, end = end, start
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def _format_duration(months: int) -> str:
    years, rem = divmod(months, 12)
    parts = []
    if years:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if rem:
        parts.append(f"{rem} month{'s' if rem != 1 else ''}")
    return " and ".join(parts) or "0 months"


# ── Individual fact computers ─────────────────────────────────────────────────

def _fact_age(text: str) -> Optional[str]:
    dates = _parse_dates(text)
    candidates = [d for d in dates if d.year < _TODAY.year - 5]
    if not candidates:
        return None
    birth = candidates[0]
    age = _TODAY.year - birth.year - (
        1 if (_TODAY.month, _TODAY.day) < (birth.month, birth.day) else 0
    )
    return (
        f"Age = {age} years old "
        f"(born {birth.strftime('%B %d, %Y')}, today is {_TODAY.strftime('%B %d, %Y')})"
    )


def _fact_duration(text: str) -> Optional[str]:
    dates = _parse_dates(text)
    past = [d for d in dates if d <= _TODAY]
    if len(past) < 2:
        return None
    start, end = past[0], past[-1]
    months = _inclusive_months(start, end)
    return (
        f"Duration from {start.strftime('%B %Y')} to {end.strftime('%B %Y')} = "
        f"{months} months ({_format_duration(months)})"
    )


def _fact_since(text: str) -> Optional[str]:
    dates = _parse_dates(text)
    past = [d for d in dates if d < _TODAY]
    if not past:
        return None
    event = past[-1]
    months = (_TODAY.year - event.year) * 12 + (_TODAY.month - event.month)
    return (
        f"Time elapsed since {event.strftime('%B %Y')} = "
        f"{months} months ({_format_duration(months)})"
    )


def _fact_sum(text: str) -> Optional[str]:
    nums = _parse_numbers(text)
    if len(nums) < 2:
        return None
    total = sum(nums)
    return f"Sum of {len(nums)} values = {total:,.2f}"


def _fact_average(text: str) -> Optional[str]:
    nums = _parse_numbers(text)
    if len(nums) < 2:
        return None
    avg = sum(nums) / len(nums)
    return f"Average of {len(nums)} values = {avg:,.2f}"


def _fact_comparison(text: str, query: str) -> Optional[str]:
    nums = _parse_numbers(text)
    if len(nums) < 2:
        return None
    if re.search(r'\b(highest|maximum|most|largest|biggest|greatest)\b', query):
        return f"Highest value in context = {max(nums):,.2f}"
    if re.search(r'\b(lowest|minimum|least|smallest)\b', query):
        return f"Lowest value in context = {min(nums):,.2f}"
    return f"Range: min = {min(nums):,.2f}, max = {max(nums):,.2f}"


def _fact_percentage(text: str, query: str) -> Optional[str]:
    """Compute percentage if two numbers are found with 'percent of' phrasing."""
    m = re.search(r'(\d[\d,]*(?:\.\d+)?)\s*(?:out of|of|/)\s*(\d[\d,]*(?:\.\d+)?)', text)
    if not m:
        return None
    try:
        part = float(m.group(1).replace(',', ''))
        whole = float(m.group(2).replace(',', ''))
        if whole == 0:
            return None
        pct = (part / whole) * 100
        return f"{part:,.2f} out of {whole:,.2f} = {pct:.1f}%"
    except ValueError:
        return None


# ── Public entry point ────────────────────────────────────────────────────────

def enrich_context(query: str, node_texts: list[str]) -> str:
    """
    Detect what computation the query needs, compute it from node_texts,
    and return a "VERIFIED COMPUTED FACTS" block to prepend to the LLM context.
    Returns empty string when nothing is computable.
    """
    combined = "\n".join(node_texts)
    q = query.lower()
    facts: list[str] = []

    # Age
    if re.search(r'\b(age|how old|birth|born)\b', q):
        f = _fact_age(combined)
        if f:
            facts.append(f)

    # Duration (employment, project, contract, period)
    if re.search(
        r'\b(how (long|many months|many years|many days)|duration|period|'
        r'months|years|worked|employment|contract|service|tenure)\b', q
    ):
        f = _fact_duration(combined)
        if f:
            facts.append(f)

    # Time elapsed since an event
    if re.search(r'\b(since|elapsed|passed|ago)\b', q) and not any('Duration' in x for x in facts):
        f = _fact_since(combined)
        if f:
            facts.append(f)

    # Average
    if re.search(r'\b(average|mean|avg)\b', q):
        f = _fact_average(combined)
        if f:
            facts.append(f)

    # Sum / total
    if re.search(r'\b(total|sum|add up|combined|altogether|grand total)\b', q):
        f = _fact_sum(combined)
        if f:
            facts.append(f)

    # Comparison / max / min
    if re.search(
        r'\b(highest|lowest|maximum|minimum|largest|smallest|most|least|'
        r'greatest|biggest|compare|which (is|has|was|were) (higher|lower|more|less|greater))\b', q
    ):
        f = _fact_comparison(combined, q)
        if f:
            facts.append(f)

    # Percentage
    if re.search(r'\b(percent|percentage|ratio|proportion|out of)\b', q):
        f = _fact_percentage(combined, q)
        if f:
            facts.append(f)

    if not facts:
        return ""

    lines = "\n".join(f"• {f}" for f in facts)
    return (
        "VERIFIED COMPUTED FACTS (use these exact numbers — do not recalculate):\n"
        + lines + "\n"
    )
