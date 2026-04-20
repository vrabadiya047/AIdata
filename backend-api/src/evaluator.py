# src/evaluator.py
from .config import setup_ai_settings
from llama_index.core import Settings

setup_ai_settings()

def evaluate_response(query, response_str, nodes):
    """
    Synchronous evaluator that returns explicit boolean flags for logging.
    """
    context_str = "\n\n".join([n.get_content() for n in nodes])
    
    # 1. Faithfulness Check
    f_prompt = f"Context: {context_str}\nResponse: {response_str}\nDoes the response use ONLY provided context? YES or NO."
    f_answer = Settings.llm.complete(f_prompt).text.strip().upper()
    is_faithful = "YES" in f_answer
    
    # 2. Relevancy Check
    r_prompt = f"Query: {query}\nResponse: {response_str}\nDoes the response answer the query? YES or NO."
    r_answer = Settings.llm.complete(r_prompt).text.strip().upper()
    is_relevant = "YES" in r_answer
    
    # RETURN EXPLICIT KEYS FOR THE LOGGER
    return {
        "passing": is_faithful and is_relevant,
        "faithful_passing": is_faithful,    # <--- This matches your dashboard call
        "relevant_passing": is_relevant,    # <--- This matches your dashboard call
        "feedback": f"Faithful: {is_faithful} | Relevant: {is_relevant}"
    }