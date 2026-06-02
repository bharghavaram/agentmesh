import time
from duckduckgo_search import DDGS
import structlog

log = structlog.get_logger()


def web_search(query: str, max_results: int = 5) -> str:
    """Search the web using DuckDuckGo (no API key required)."""
    start = time.time()
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return "No results found."
        formatted = []
        for i, r in enumerate(results, 1):
            formatted.append(f"[{i}] {r['title']}\n{r['href']}\n{r['body']}\n")
        elapsed = int((time.time() - start) * 1000)
        log.info("web_search", query=query, results=len(results), ms=elapsed)
        return "\n".join(formatted)
    except Exception as e:
        log.error("web_search_error", query=query, error=str(e))
        return f"Search failed: {e}"


def fetch_wikipedia(topic: str) -> str:
    """Fetch a Wikipedia summary for a topic."""
    start = time.time()
    try:
        import wikipediaapi
        wiki = wikipediaapi.Wikipedia(
            language="en",
            user_agent="AgentMesh/1.0 (https://github.com/bharghavaram/agentmesh)"
        )
        page = wiki.page(topic)
        if not page.exists():
            return f"No Wikipedia page found for '{topic}'."
        summary = page.summary[:3000]
        elapsed = int((time.time() - start) * 1000)
        log.info("wikipedia", topic=topic, chars=len(summary), ms=elapsed)
        return f"Wikipedia — {page.title}:\n{summary}"
    except Exception as e:
        log.error("wikipedia_error", topic=topic, error=str(e))
        return f"Wikipedia lookup failed: {e}"
