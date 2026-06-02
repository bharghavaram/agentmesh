"""
ReAct (Reasoning + Acting) agent implementation.
Based on Yao et al. 2023 — https://arxiv.org/abs/2210.03629
"""
import json
import time
from typing import AsyncIterator
from openai import AsyncOpenAI
from ..models import AgentRole, AgentStep, StreamEvent, ToolCall
from ..tools import TOOL_REGISTRY, TOOL_DESCRIPTIONS
import structlog

log = structlog.get_logger()

SYSTEM_PROMPTS = {
    AgentRole.PLANNER: """You are a master planning agent. Your job is to break complex tasks into 
a clear execution plan for other agents. Think step by step. Output a structured plan with:
1. What needs to be researched
2. What needs to be analyzed  
3. What the final output should contain
Be concise and strategic.""",

    AgentRole.RESEARCHER: f"""You are a research agent with access to web search and Wikipedia.
Use the ReAct framework: Thought → Action → Observation → repeat until done.

Available tools:
{TOOL_DESCRIPTIONS}

Format STRICTLY as:
Thought: [your reasoning]
Action: tool_name
Action Input: [input for the tool]

When you have enough information:
Thought: I have sufficient information to answer.
Final Answer: [comprehensive research findings]""",

    AgentRole.ANALYST: """You are a critical analysis agent. Given research findings, you:
1. Identify patterns, gaps, and key insights
2. Evaluate reliability and recency of information
3. Draw evidence-based conclusions
4. Flag any contradictions or uncertainties
Output structured analytical findings.""",

    AgentRole.SYNTHESIZER: """You are a synthesis agent. You take outputs from planner, researcher, 
and analyst to produce a final comprehensive, well-structured response. 
Your output should be clear, actionable, and cite the most important findings.
Format with clear sections and bullet points where appropriate.""",
}


class ReActAgent:
    def __init__(self, role: AgentRole, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.role = role
        self.client = client
        self.model = model
        self.total_tokens = 0

    async def run(
        self,
        task: str,
        context: str = "",
        max_iterations: int = 5,
    ) -> AsyncIterator[StreamEvent]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPTS[self.role]},
            {"role": "user", "content": f"Task: {task}\n\n{f'Context:{chr(10)}{context}' if context else ''}"},
        ]

        for iteration in range(max_iterations):
            yield StreamEvent(event="thinking", agent=self.role, data={"iteration": iteration + 1})

            start = time.time()
            try:
                resp = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=1500,
                )
            except Exception as e:
                yield StreamEvent(event="error", agent=self.role, data={"error": str(e)})
                return

            elapsed = int((time.time() - start) * 1000)
            self.total_tokens += resp.usage.total_tokens if resp.usage else 0
            text = resp.choices[0].message.content or ""
            messages.append({"role": "assistant", "content": text})

            # Parse ReAct format
            step = self._parse_react(text, elapsed)

            yield StreamEvent(event="step", agent=self.role, data=step.model_dump())

            # Final answer reached
            if step.final_answer:
                yield StreamEvent(event="answer", agent=self.role, data={"answer": step.final_answer})
                return

            # Execute tool if present
            if step.action and step.tool_call:
                tool_name = step.action
                tool_fn = TOOL_REGISTRY.get(tool_name, {}).get("fn")
                if tool_fn:
                    t0 = time.time()
                    observation = tool_fn(step.tool_call.input)
                    tool_ms = int((time.time() - t0) * 1000)
                    step.tool_call.output = observation[:2000]
                    step.tool_call.duration_ms = tool_ms
                    step.observation = observation[:2000]

                    yield StreamEvent(event="tool", agent=self.role, data={
                        "tool": tool_name,
                        "input": step.tool_call.input,
                        "output": observation[:500] + "..." if len(observation) > 500 else observation,
                        "duration_ms": tool_ms,
                    })

                    messages.append({
                        "role": "user",
                        "content": f"Observation: {observation[:2000]}\nContinue with Thought:",
                    })
                else:
                    messages.append({
                        "role": "user",
                        "content": f"Observation: Tool '{tool_name}' not found. Use: {list(TOOL_REGISTRY.keys())}",
                    })

        # Max iterations — return what we have
        last_content = messages[-1].get("content", "Max iterations reached.") if messages else "No result."
        yield StreamEvent(event="answer", agent=self.role, data={"answer": last_content})

    def _parse_react(self, text: str, duration_ms: int) -> AgentStep:
        lines = text.strip().split("\n")
        thought = ""
        action = None
        action_input = ""
        final_answer = None

        for i, line in enumerate(lines):
            if line.startswith("Thought:"):
                thought = line[8:].strip()
            elif line.startswith("Action:"):
                action = line[7:].strip().lower().replace(" ", "_")
            elif line.startswith("Action Input:"):
                action_input = line[13:].strip()
                # Collect multiline input
                j = i + 1
                while j < len(lines) and not lines[j].startswith(("Thought:", "Action:", "Final Answer:")):
                    action_input += "\n" + lines[j]
                    j += 1
            elif line.startswith("Final Answer:"):
                final_answer = line[13:].strip()
                j = i + 1
                while j < len(lines):
                    final_answer += "\n" + lines[j]
                    j += 1
                break

        if not thought:
            thought = text[:200]

        tool_call = None
        if action and action in TOOL_REGISTRY:
            tool_call = ToolCall(tool=action, input=action_input.strip())

        return AgentStep(
            agent=self.role,
            thought=thought,
            action=action,
            tool_call=tool_call,
            final_answer=final_answer,
        )
