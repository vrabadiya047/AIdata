# src/logger.py
import json
import os
from datetime import datetime
from .config import LOG_DIR

LOG_FILE = os.path.join(LOG_DIR, "query_log.jsonl")

def log_query(query, response, is_faithful=None, is_relevant=None):
    """
    Saves interaction AND verification results for the Audit Trail.
    """
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
        
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "query": query,
        "response": response,
        "faithful": is_faithful,
        "relevant": is_relevant
    }
    
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")
        f.flush()