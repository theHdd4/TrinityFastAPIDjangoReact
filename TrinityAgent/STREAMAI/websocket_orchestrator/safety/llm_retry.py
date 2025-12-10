"""LLM retry helpers for JSON generation."""

import asyncio
from typing import Any, Awaitable, Callable, Dict


class RetryableJSONGenerationError(Exception):
    """Exception raised when JSON generation fails after all retries."""

    def __init__(self, message: str, attempts: int, last_error: Exception):
        super().__init__(message)
        self.attempts = attempts
        self.last_error = last_error


async def retry_llm_json_generation(
    attempt_fn: Callable[[], Awaitable[Dict[str, Any]]],
    attempts: int,
    delay_seconds: float,
    timeout_seconds: float,
    status_callback: Callable[[int, float, bool], Awaitable[None]],
) -> Dict[str, Any]:
    """Retry an async LLM call that should return JSON-compatible data."""

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        start_time = asyncio.get_event_loop().time()
        try:
            result = await asyncio.wait_for(attempt_fn(), timeout=timeout_seconds)
            return result
        except Exception as exc:  # pragma: no cover - passthrough for orchestrator handling
            last_error = exc
            elapsed = asyncio.get_event_loop().time() - start_time
            timed_out = isinstance(exc, asyncio.TimeoutError)
            await status_callback(attempt, elapsed, timed_out)
            if attempt < attempts:
                await asyncio.sleep(delay_seconds)

    raise RetryableJSONGenerationError(
        f"Failed to generate JSON after {attempts} attempts",
        attempts,
        last_error or Exception("unknown"),
    )
