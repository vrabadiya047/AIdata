# src/analytics.py
import pandas as pd
import json
import os
from src.config import AUDIT_LOG

def get_audit_trail():
    """Reads the local JSON audit log and returns a DataFrame for the UI."""
    if not os.path.exists(AUDIT_LOG):
        return pd.DataFrame()
    
    try:
        with open(AUDIT_LOG, "r") as f:
            data = json.load(f)
        df = pd.DataFrame(data)
        if not df.empty:
            # Clean up column names for a professional UI
            df.columns = [col.replace("_", " ").title() for col in df.columns]
        return df
    except (json.JSONDecodeError, ValueError):
        return pd.DataFrame()