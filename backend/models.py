from pydantic import BaseModel, Field
from typing import Literal, Any
from enum import Enum


class AgentRole(str, Enum):
    PLANNER = "planner"
    RESEARCHER = "researcher"
    ANALYST = "analyst"
    SYNTHESIZER = "synthesizer"


class ToolCall(BaseModel):
    tool: str
    input: str
    output: str = ""
    duration_ms: int = 0


class AgentStep(BaseModel):
    agent: AgentRole
    thought: str
    action: str | None = None
    tool_call: ToolCall | None = None
    observation: str | None = None
    final_answer: str | None = None


class StreamEvent(BaseModel):
    event: Literal["step", "tool", "thinking", "answer", "error", "done"]
    agent: AgentRole | None = None
    data: Any


class TaskRequest(BaseModel):
    task: str = Field(..., min_length=5, max_length=2000, description="Task for agents to execute")
    max_iterations: int = Field(default=6, ge=1, le=12)


class TaskResult(BaseModel):
    task: str
    steps: list[AgentStep]
    final_answer: str
    total_tokens: int
    duration_ms: int
