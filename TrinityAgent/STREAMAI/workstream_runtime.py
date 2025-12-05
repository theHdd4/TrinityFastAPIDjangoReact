"""
Runtime utilities for DAG-based workstreams.

Provides:
- Input normalization and hashing for atom identity
- Memoization cache for idempotent atoms
- Retry/backoff execution policy with circuit breaker
- Workstream-level context store with deduplication controls
- Validators for both static DAG properties and runtime prerequisites
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Set, Tuple

logger = logging.getLogger("trinity.trinityai.workstream")


VOLATILE_FIELDS = {"timestamp", "session_id", "request_id", "trace_id"}


class WorkstreamValidationError(Exception):
    """Raised when a workstream fails validation."""


class DedupeBudgetExceeded(Exception):
    """Raised when duplicate execution attempts exceed the configured budget."""


@dataclass
class AtomIdentity:
    name: str
    normalized_input: str
    version: str = "v1"

    def key(self) -> Tuple[str, str, str]:
        return (self.name, self.normalized_input, self.version)


def _sorted_json_dumps(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def normalize_input(payload: Any, volatile_fields: Optional[Iterable[str]] = None) -> str:
    """Normalize inputs by removing volatile fields and hashing the stable representation."""

    volatile = set(volatile_fields or []) | VOLATILE_FIELDS

    def _scrub(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: _scrub(v) for k, v in value.items() if k not in volatile}
        if isinstance(value, list):
            return [_scrub(v) for v in value]
        return value

    scrubbed = _scrub(payload)
    serialized = _sorted_json_dumps(scrubbed)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class AtomMemoizer:
    """Shared memoization layer keyed by atom identity."""

    def __init__(self) -> None:
        self._cache: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    def get(self, identity: AtomIdentity) -> Optional[Dict[str, Any]]:
        return self._cache.get(identity.key())

    def set(self, identity: AtomIdentity, result: Dict[str, Any]) -> None:
        self._cache[identity.key()] = result


@dataclass
class CircuitBreaker:
    failure_threshold: int = 3
    recovery_time_seconds: int = 30
    failures: int = 0
    last_failure_time: Optional[float] = None

    def record_failure(self) -> None:
        self.failures += 1
        self.last_failure_time = time.time()

    def record_success(self) -> None:
        self.failures = 0
        self.last_failure_time = None

    def is_open(self) -> bool:
        if self.failures < self.failure_threshold:
            return False
        if self.last_failure_time is None:
            return True
        return (time.time() - self.last_failure_time) < self.recovery_time_seconds


@dataclass
class RetryPolicy:
    max_attempts: int = 3
    base_backoff: float = 0.5
    jitter: float = 0.2
    abort_errors: Tuple[type, ...] = ()

    def backoff_time(self, attempt: int) -> float:
        # Exponential backoff with jitter
        delay = self.base_backoff * (2 ** (attempt - 1))
        jitter_value = random.uniform(-self.jitter, self.jitter)
        return max(0, delay + jitter_value)


@dataclass
class AtomExecutionPolicy:
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    circuit_breaker: CircuitBreaker = field(default_factory=CircuitBreaker)

    async def run(self, func: Callable[[], Awaitable[Dict[str, Any]]], *, atom_identity: AtomIdentity, idempotency: str, force: bool = False) -> Dict[str, Any]:
        """Execute an atom with retries and circuit breaker controls."""

        if self.circuit_breaker.is_open():
            raise RuntimeError("Circuit breaker is open; halting atom execution")

        attempt = 0
        last_error: Optional[Exception] = None

        while attempt < self.retry_policy.max_attempts:
            attempt += 1
            try:
                result = await func()
                if result.get("success"):
                    self.circuit_breaker.record_success()
                    return {**result, "attempt": attempt}
                last_error = RuntimeError(result.get("error") or "Unknown atom error")
                if self._should_abort(last_error):
                    raise last_error
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if self._should_abort(exc):
                    self.circuit_breaker.record_failure()
                    raise

            # Retry if allowed
            self.circuit_breaker.record_failure()
            if attempt >= self.retry_policy.max_attempts:
                break
            sleep_time = self.retry_policy.backoff_time(attempt)
            logger.info("Retrying atom %s (attempt %s/%s) after %.2fs", atom_identity.name, attempt + 1, self.retry_policy.max_attempts, sleep_time)
            await asyncio.sleep(sleep_time)

        raise RuntimeError(f"Atom {atom_identity.name} failed after {attempt} attempts: {last_error}")

    def _should_abort(self, error: Exception) -> bool:
        return isinstance(error, self.retry_policy.abort_errors)


@dataclass
class WorkstreamContextStore:
    dedupe_budget: int = 5
    snapshots: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)

    def register_execution(self, atom_id: str, input_hash: str, output: Dict[str, Any]) -> None:
        entries = self.snapshots.setdefault(atom_id, [])
        duplicate_count = sum(1 for entry in entries if entry.get("input_hash") == input_hash)
        if duplicate_count >= self.dedupe_budget:
            raise DedupeBudgetExceeded(f"Atom {atom_id} exceeded dedupe budget ({self.dedupe_budget})")
        entries.append({"input_hash": input_hash, "output": output, "timestamp": time.time()})

    def should_short_circuit(self, atom_id: str, input_hash: str) -> Optional[Dict[str, Any]]:
        entries = self.snapshots.get(atom_id, [])
        for entry in reversed(entries):
            if entry.get("input_hash") == input_hash:
                return entry.get("output")
        return None


class WorkstreamValidator:
    """Static and runtime validators for workstream DAGs."""

    @staticmethod
    def validate_dag(nodes: List[Dict[str, Any]]) -> List[str]:
        graph: Dict[str, Set[str]] = {}
        indegree: Dict[str, int] = {}
        node_ids = set()

        for node in nodes:
            node_id = node.get("atom_id") or node.get("id")
            if not node_id:
                raise WorkstreamValidationError("Atom is missing required atom_id")
            node_ids.add(node_id)

        for node in nodes:
            node_id = node.get("atom_id") or node.get("id")
            deps = set(node.get("depends_on", []))
            node["version"] = node.get("version") or "v1"
            unknown = deps - node_ids
            if unknown:
                raise WorkstreamValidationError(
                    f"Atom {node_id} declares unknown dependencies: {', '.join(sorted(unknown))}"
                )
            graph[node_id] = deps
            indegree[node_id] = len(deps)

        # Kahn's algorithm for cycle detection and topo sort
        queue = [node for node, deg in indegree.items() if deg == 0]
        topo_order: List[str] = []

        while queue:
            current = queue.pop(0)
            topo_order.append(current)
            for node, deps in graph.items():
                if current in deps:
                    indegree[node] -= 1
                    if indegree[node] == 0:
                        queue.append(node)

        if len(topo_order) != len(nodes):
            raise WorkstreamValidationError("Cycle detected in workstream DAG")
        return topo_order

    @staticmethod
    def runtime_validate(node: Dict[str, Any], completed: Set[str]) -> None:
        deps = set(node.get("depends_on", []))
        missing = deps - completed
        if missing:
            raise WorkstreamValidationError(f"Dependencies not satisfied for {node.get('atom_id')}: {', '.join(missing)}")


__all__ = [
    "AtomIdentity",
    "AtomMemoizer",
    "AtomExecutionPolicy",
    "CircuitBreaker",
    "DedupeBudgetExceeded",
    "RetryPolicy",
    "WorkstreamContextStore",
    "WorkstreamValidationError",
    "WorkstreamValidator",
    "normalize_input",
]
