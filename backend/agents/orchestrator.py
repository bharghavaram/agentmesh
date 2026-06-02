"""
Multi-Agent Orchestrator — coordinates Planner → Researcher → Analyst → Synthesizer
in a directed acyclic graph (DAG) with streaming output.
"""
import asyncio
import time
from typing import AsyncIterator
from openai import AsyncOpenAI
from ..models import AgentRole, StreamEvent
from .react_agent import ReActAgent
import structlog

log = structlog.get_logger()


class AgentOrchestrator:
    """
    Orchestrates multiple specialized agents in a pipeline:
    
    Planner ──► Researcher ──► Analyst ──►  Synthesizer
                    │                           ▲
                    └───── (tool calls) ────────┘
    """

    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model
        self.agents = {
            role: ReActAgent(role=role, client=client, model=model)
            for role in AgentRole
        }
        self.total_tokens = 0

    async def run(self, task: str, max_iterations: int = 6) -> AsyncIterator[StreamEvent]:
        start = time.time()
        context_store: dict[AgentRole, str] = {}

        log.info("orchestrator_start", task=task[:100])

        yield StreamEvent(event="thinking", agent=None, data={
            "message": f"Starting multi-agent pipeline for: {task[:100]}",
            "agents": [r.value for r in AgentRole],
        })

        # ── Stage 1: Planner ──────────────────────────────────────────
        plan_output = ""
        async for event in self.agents[AgentRole.PLANNER].run(task, max_iterations=3):
            yield event
            if event.event == "answer":
                plan_output = event.data.get("answer", "")

        context_store[AgentRole.PLANNER] = plan_output

        # ── Stage 2: Researcher (uses tools, most iterations) ─────────
        research_context = f"Original task: {task}\n\nPlan from planner:\n{plan_output}"
        research_output = ""
        async for event in self.agents[AgentRole.RESEARCHER].run(
            task, context=research_context, max_iterations=max_iterations
        ):
            yield event
            if event.event == "answer":
                research_output = event.data.get("answer", "")

        context_store[AgentRole.RESEARCHER] = research_output

        # ── Stage 3: Analyst ──────────────────────────────────────────
        analyst_context = (
            f"Task: {task}\n\n"
            f"Plan:\n{plan_output}\n\n"
            f"Research findings:\n{research_output}"
        )
        analysis_output = ""
        async for event in self.agents[AgentRole.ANALYST].run(
            task, context=analyst_context, max_iterations=3
        ):
            yield event
            if event.event == "answer":
                analysis_output = event.data.get("answer", "")

        context_store[AgentRole.ANALYST] = analysis_output

        # ── Stage 4: Synthesizer ──────────────────────────────────────
        synth_context = (
            f"Original task: {task}\n\n"
            f"Plan:\n{plan_output}\n\n"
            f"Research:\n{research_output}\n\n"
            f"Analysis:\n{analysis_output}"
        )
        final_output = ""
        async for event in self.agents[AgentRole.SYNTHESIZER].run(
            task, context=synth_context, max_iterations=3
        ):
            yield event
            if event.event == "answer":
                final_output = event.data.get("answer", "")

        # Aggregate token counts
        self.total_tokens = sum(a.total_tokens for a in self.agents.values())
        duration_ms = int((time.time() - start) * 1000)

        log.info("orchestrator_done", tokens=self.total_tokens, ms=duration_ms)

        yield StreamEvent(event="done", agent=None, data={
            "final_answer": final_output,
            "total_tokens": self.total_tokens,
            "duration_ms": duration_ms,
            "stages_completed": 4,
        })
