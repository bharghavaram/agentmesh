from .search import web_search, fetch_wikipedia

TOOL_REGISTRY = {
    "web_search": {
        "fn": web_search,
        "description": "Search the web for current information. Input: search query string.",
    },
    "wikipedia": {
        "fn": fetch_wikipedia,
        "description": "Fetch a Wikipedia article summary. Input: topic name.",
    },
}

TOOL_DESCRIPTIONS = "\n".join(
    f"- {name}: {info['description']}" for name, info in TOOL_REGISTRY.items()
)
