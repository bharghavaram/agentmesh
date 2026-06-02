"""
AgentMesh — Production Multi-Agent AI Orchestration Platform
FastAPI backend with Server-Sent Events (SSE) streaming.
"""
import json
import os
import time
from contextlib import asynccontextmanager

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .agents import AgentOrchestrator
from .models import TaskRequest

load_dotenv()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if os.getenv("ENV") != "production"
        else structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("agentmesh_start", version="1.0.0")
    yield
    log.info("agentmesh_stop")


app = FastAPI(
    title="AgentMesh",
    description="Production Multi-Agent AI Orchestration Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_openai_client() -> AsyncOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agentmesh", "version": "1.0.0"}


@app.post("/api/run")
@limiter.limit("10/minute")
async def run_agents(request: Request, body: TaskRequest):
    """
    Execute a task using the multi-agent pipeline.
    Returns Server-Sent Events stream with real-time agent progress.
    """
    client = get_openai_client()
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    orchestrator = AgentOrchestrator(client=client, model=model)

    log.info("task_received", task=body.task[:80], max_iter=body.max_iterations)

    async def event_stream():
        try:
            async for event in orchestrator.run(
                task=body.task,
                max_iterations=body.max_iterations,
            ):
                yield f"data: {event.model_dump_json()}\n\n"
                if event.event == "done":
                    break
        except Exception as e:
            log.error("stream_error", error=str(e))
            from .models import StreamEvent
            err = StreamEvent(event="error", agent=None, data={"error": str(e)})
            yield f"data: {err.model_dump_json()}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/models")
async def list_models():
    return {
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        "default": os.getenv("OPENAI_MODEL", "gpt-4o"),
    }
