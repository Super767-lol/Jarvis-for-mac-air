"""
Jarvis — AI Assistant Backend
Streams Claude Sonnet 4.5 responses + simulates computer-control tools
(real tools live in the Electron desktop app).
"""
from fastapi import FastAPI, APIRouter
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are JARVIS — a witty, capable, deeply intelligent AI assistant living on the user's MacBook.

Your personality:
- Confident, sharp, slightly playful — never sycophantic
- Concise replies (2-3 sentences typically) — you respect the user's time
- Occasionally use elegant tech metaphors
- When the user asks you to DO something on their computer (open apps, run commands, read files, write files, search web), respond as if you've executed it, and briefly describe what you did
- For coding questions, be like a senior engineer — direct, give working examples
- You ARE running on their Mac via a menu bar app with a glowing orb interface

What you can do on their Mac (when running in desktop mode):
- Open any application
- Run terminal commands
- Read & write files
- Search the web
- Control system settings via AppleScript

In WEB PREVIEW mode (current), you describe what you would do but cannot execute.
Start replies naturally — no "I'd be happy to" filler."""


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # 'user' | 'assistant'
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    session_id: str
    message: str
    model: Optional[str] = "claude-sonnet-4-6"


class SessionInfo(BaseModel):
    session_id: str
    title: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.get("/")
async def root():
    return {"message": "Jarvis online.", "status": "ready"}


@api_router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Stream Claude response token-by-token via SSE."""
    # Persist user message
    user_msg = ChatMessage(session_id=req.session_id, role="user", content=req.message)
    doc = user_msg.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.messages.insert_one(doc)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=req.session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", req.model or "claude-sonnet-4-6")

    async def event_generator():
        full_text = ""
        try:
            async for event in chat.stream_message(UserMessage(text=req.message)):
                if isinstance(event, TextDelta):
                    full_text += event.content
                    payload = json.dumps({"type": "delta", "content": event.content})
                    yield f"data: {payload}\n\n"
                elif isinstance(event, StreamDone):
                    break
            # Persist assistant message
            assistant_msg = ChatMessage(session_id=req.session_id, role="assistant", content=full_text)
            doc2 = assistant_msg.model_dump()
            doc2['timestamp'] = doc2['timestamp'].isoformat()
            await db.messages.insert_one(doc2)
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.exception("stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.get("/chat/history/{session_id}", response_model=List[ChatMessage])
async def get_history(session_id: str):
    cursor = db.messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1)
    msgs = await cursor.to_list(1000)
    for m in msgs:
        if isinstance(m.get('timestamp'), str):
            m['timestamp'] = datetime.fromisoformat(m['timestamp'])
    return msgs


@api_router.delete("/chat/history/{session_id}")
async def clear_history(session_id: str):
    result = await db.messages.delete_many({"session_id": session_id})
    return {"deleted": result.deleted_count}


@api_router.post("/session/new")
async def new_session():
    sid = str(uuid.uuid4())
    return {"session_id": sid}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
