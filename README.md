<div align="center">

# 🤖 AgentMesh

### Production Multi-Agent AI Orchestration Platform

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/bharghavaram/agentmesh/actions/workflows/ci.yml/badge.svg)](https://github.com/bharghavaram/agentmesh/actions)

**ReAct reasoning · Tool use · Real-time SSE streaming · 4 specialized agents**

[Live Demo](https://b523c4fb-8270-4d80-81ed-543677731a16-00-1x0z5heqys22v.pike.replit.dev) · [Portfolio](https://github.com/bharghavaram) · [Report Bug](https://github.com/bharghavaram/agentmesh/issues)

</div>

---

## Architecture

```
User Task
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                  AgentOrchestrator                   │
│                                                      │
│  ┌──────────┐    ┌────────────┐    ┌──────────────┐ │
│  │ Planner  │───►│ Researcher │───►│   Analyst    │ │
│  │  Agent   │    │   Agent    │    │    Agent     │ │
│  └──────────┘    └─────┬──────┘    └──────┬───────┘ │
│                        │                  │         │
│                   ┌────▼────┐             │         │
│                   │  Tools  │             │         │
│                   │ ·Search │             │         │
│                   │ ·Wiki   │             │         │
│                   └─────────┘             │         │
│                                           ▼         │
│                              ┌────────────────────┐ │
│                              │  Synthesizer Agent │ │
│                              └────────────────────┘ │
└─────────────────────────────────────────────────────┘
    │
    ▼ Server-Sent Events (real-time streaming)
React Frontend
```

Each agent runs the **ReAct** (Reasoning + Acting) loop:
```
Thought → Action → Action Input → Observation → Thought → ... → Final Answer
```

## Key Features

| Feature | Details |
|---|---|
| **Multi-Agent Pipeline** | 4 specialized agents: Planner, Researcher, Analyst, Synthesizer |
| **ReAct Framework** | Yao et al. 2023 — reasoning and acting interleaved |
| **Real-time Streaming** | Server-Sent Events — watch agent thoughts live |
| **Tool Use** | Web search (DuckDuckGo), Wikipedia — no API keys for tools |
| **Production Ready** | Rate limiting, structured logging, health checks, Docker |
| **OpenAI Compatible** | Works with any OpenAI-compatible API (Azure, Replit, etc.) |

## Quickstart

```bash
# Clone
git clone https://github.com/bharghavaram/agentmesh
cd agentmesh

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Set your API key
cp ../.env.example .env
echo "OPENAI_API_KEY=sk-..." >> .env

# Run
uvicorn main:app --reload
```

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your OPENAI_API_KEY
docker compose up --build
```

Backend: http://localhost:8000  
API Docs: http://localhost:8000/docs

## API

### `POST /api/run` — Stream agent execution

```bash
curl -X POST http://localhost:8000/api/run \
  -H "Content-Type: application/json" \
  -d '{"task": "What are the latest breakthroughs in AI agents?", "max_iterations": 6}' \
  --no-buffer
```

**SSE Event types:**

| Event | Description |
|---|---|
| `thinking` | Agent is processing (spinner) |
| `step` | ReAct step: thought + optional action |
| `tool` | Tool call executed with input/output |
| `answer` | Agent produced final answer |
| `done` | All agents complete — includes total tokens + duration |
| `error` | Error occurred |

### `GET /health` — Health check

```json
{"status": "ok", "service": "agentmesh", "version": "1.0.0"}
```

## Agent Roles

### 🗺 Planner
Breaks the task into a structured execution plan. Determines what to research, what to analyze, and what the final output should contain.

### 🔍 Researcher  
Uses web search and Wikipedia to gather current, factual information. Runs the full ReAct loop with tool calls.

### 🧠 Analyst
Critically evaluates research findings. Identifies patterns, gaps, contradictions, and draws evidence-based conclusions.

### ✍ Synthesizer
Combines all agent outputs into a final, comprehensive, well-structured response.

## Tech Stack

- **Backend:** Python 3.11, FastAPI, Uvicorn, OpenAI SDK
- **Agent Framework:** ReAct loop (from scratch — no LangChain dependency)
- **Tools:** DuckDuckGo Search, Wikipedia API
- **Streaming:** Server-Sent Events (SSE)
- **Production:** Rate limiting (slowapi), structured logging (structlog), Docker
- **CI/CD:** GitHub Actions

## Why No LangChain?

AgentMesh implements the ReAct loop from scratch to demonstrate deep understanding of agent architectures. This makes it:
- Easier to debug and extend
- No framework version conflicts
- Transparent — every decision is explicit

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
Built by <a href="https://github.com/bharghavaram">bharghavaram</a> · 
<a href="https://b523c4fb-8270-4d80-81ed-543677731a16-00-1x0z5heqys22v.pike.replit.dev">Live Demo</a>
</div>
