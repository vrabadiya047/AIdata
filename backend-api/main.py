# backend-api/main.py
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import asyncio

# Direct imports from your cleaned src folder
from src.engine import get_query_engine
from src.database import get_all_projects, get_chat_history, save_chat_message
from src.privacy import shield
from src.auth import verify_user # Assuming you have this in auth.py

app = FastAPI(title="Sovereign AI", redirect_slashes=False)

# 🔒 SOVEREIGN SECURITY: Allow only your local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health():
    return {"status": "Sovereign AI Engine is Online"}

class QueryRequest(BaseModel):
    prompt: str
    project: str
    username: str
    thread_id: str = "General"

@app.get("/api/workspaces/{username}")
async def get_workspaces(username: str):
    """Returns the list of public and private projects for the user."""
    projects = get_all_projects(username)
    return {"workspaces": projects}

@app.get("/api/history")
async def get_history(project: str, username: str, thread_id: str = "General"):
    """Fetches past chat threads from SQLite."""
    history = get_chat_history(project, username, thread_id)
    return {"history": history}

@app.post("/api/query")
async def stream_query(data: QueryRequest):
    """The core RAG endpoint with PII Redaction and Streaming."""
    
    # 1. PII Shield: Redact the prompt before the AI sees it
    safe_prompt = shield.redact(data.prompt)
    
    # 2. Get the engine for this specific project/tenant
    engine = get_query_engine(project_filter=data.project, username=data.username)
    
    if not engine:
        raise HTTPException(status_code=404, detail="Workspace index not found.")

    # 3. Query LlamaIndex
    response = engine.query(safe_prompt)

    async def generate_tokens():
        full_response = ""
        # We stream the response token-by-token for that 'typing' effect
        for token in response.response_gen:
            full_response += token
            yield f"data: {json.dumps({'token': token})}\n\n"
            await asyncio.sleep(0.02)
        
        # Save the final redacted response to the database in the background
        save_chat_message(data.project, data.username, data.thread_id, "assistant", full_response)
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate_tokens(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Add this right before uvicorn.run
    print("\n--- 🛡️ SOVEREIGN SERVER ROUTES ---")
    for route in app.routes:
        print(f"Endpoint: {route.path} | Methods: {route.methods}")
    print("----------------------------------\n")
    uvicorn.run(app, host="127.0.0.1", port=8000)