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
class WorkstreamTelemetry:
    """Lightweight in-memory telemetry collector for workstreams."""

    session_id: Optional[str] = None
    mode: str = "laboratory"
    retries: List[Dict[str, Any]] = field(default_factory=list)
    duplicates: List[Dict[str, Any]] = field(default_factory=list)
    circuit_trips: int = 0
    loops: List[Dict[str, Any]] = field(default_factory=list)
    backtracks: List[Dict[str, Any]] = field(default_factory=list)

    def record_retry(self, atom_identity: AtomIdentity, attempt: int, reason: str) -> None:
        self.retries.append(
            {
                "atom": atom_identity.name,
                "version": atom_identity.version,
                "attempt": attempt,
                "reason": reason,
            }
        )

    def record_duplicate(self, atom_id: str, input_hash: str, source: str) -> None:
        self.duplicates.append(
            {
                "atom": atom_id,
                "input_hash": input_hash,
                "source": source,
            }
        )

    def record_circuit_breaker_trip(self) -> None:
        self.circuit_trips += 1

    def record_loop(self, *, atom_id: str, input_hash: str, reason: str, details: Optional[Dict[str, Any]] = None) -> None:
        self.loops.append({
            "atom": atom_id,
            "input_hash": input_hash,
            "reason": reason,
            "details": details or {},
        })

    def record_backtrack(
        self,
        *,
        cause: str,
        source_atom: str,
        target_atom: str,
        source_input_hash: str,
        target_input_hash: Optional[str],
        metadata_hash: Optional[str] = None,
        source_snapshot_id: Optional[int] = None,
        target_snapshot_id: Optional[int] = None,
        upstream_snapshot: Optional[str] = None,
    ) -> None:
        self.backtracks.append(
            {
                "cause": cause,
                "source_atom": source_atom,
                "target_atom": target_atom,
                "source_input_hash": source_input_hash,
                "target_input_hash": target_input_hash,
                "metadata_hash": metadata_hash,
                "source_snapshot_id": source_snapshot_id,
                "target_snapshot_id": target_snapshot_id,
                "upstream_snapshot": upstream_snapshot,
            }
        )


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


def normalize_output(payload: Any) -> str:
    """Normalize outputs for hashing."""

    return hashlib.sha256(_sorted_json_dumps(payload).encode("utf-8")).hexdigest()


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
    telemetry: Optional[WorkstreamTelemetry] = None

    async def run(
        self,
        func: Callable[[], Awaitable[Dict[str, Any]]],
        *,
        atom_identity: AtomIdentity,
        idempotency: str,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Execute an atom with retries and circuit breaker controls."""

        if self.circuit_breaker.is_open():
            if self.telemetry:
                self.telemetry.record_circuit_breaker_trip()
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
                if self.telemetry:
                    self.telemetry.record_retry(atom_identity, attempt, "unsuccessful_result")
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if self._should_abort(exc):
                    self.circuit_breaker.record_failure()
                    if self.telemetry:
                        self.telemetry.record_retry(atom_identity, attempt, exc.__class__.__name__)
                    raise
                if self.telemetry:
                    self.telemetry.record_retry(atom_identity, attempt, exc.__class__.__name__)

            # Retry if allowed
            self.circuit_breaker.record_failure()
            if attempt >= self.retry_policy.max_attempts:
                break
            sleep_time = self.retry_policy.backoff_time(attempt)
            logger.info(
                "Retrying atom %s (attempt %s/%s) after %.2fs", atom_identity.name, attempt + 1, self.retry_policy.max_attempts, sleep_time
            )
            await asyncio.sleep(sleep_time)

        raise RuntimeError(f"Atom {atom_identity.name} failed after {attempt} attempts: {last_error}")

    def _should_abort(self, error: Exception) -> bool:
        return isinstance(error, self.retry_policy.abort_errors)


@dataclass
class WorkstreamContextStore:
    dedupe_budget: int = 5
    telemetry: Optional[WorkstreamTelemetry] = None
    max_backtracks: int = 3
    cooldown_seconds: float = 1.5
    backtrack_time_budget: float = 180.0
    loop_guard_enabled: bool = True
    snapshots: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    last_inputs: Dict[str, str] = field(default_factory=dict)
    last_metadata_hash: Dict[str, str] = field(default_factory=dict)
    last_executed_at: Dict[str, float] = field(default_factory=dict)
    consecutive_backtracks: int = 0
    global_snapshots: List[Dict[str, Any]] = field(default_factory=list)
    backtrack_window_start: Optional[float] = None
    last_atom_run: Optional[str] = None
    dedupe_reset_cursor: Dict[str, int] = field(default_factory=dict)
    cooldown_metadata: Dict[str, str] = field(default_factory=dict)
    backtrack_events: List[Dict[str, Any]] = field(default_factory=list)
    backtrack_blocks: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    pinned_snapshot_id: Optional[int] = None

    def register_attempt(self, atom_id: str) -> None:
        self.last_atom_run = atom_id

    def register_execution(
        self,
        atom_id: str,
        input_hash: str,
        output: Dict[str, Any],
        *,
        metadata: Optional[Dict[str, Any]] = None,
        upstream: Optional[str] = None,
    ) -> int:
        entries = self.snapshots.setdefault(atom_id, [])
        reset_cursor = self.dedupe_reset_cursor.get(atom_id, 0)
        duplicate_count = sum(
            1
            for entry in entries
            if entry.get("input_hash") == input_hash and entry.get("id", 0) >= reset_cursor
        )
        if duplicate_count >= self.dedupe_budget:
            raise DedupeBudgetExceeded(f"Atom {atom_id} exceeded dedupe budget ({self.dedupe_budget})")
        if duplicate_count and self.telemetry:
            self.telemetry.record_duplicate(atom_id, input_hash, "repeat_execution")

        snapshot_id = len(self.global_snapshots)
        metadata_hash = (metadata or {}).get("metadata_hash") or normalize_input(metadata or {})

        snapshot = {
            "id": snapshot_id,
            "atom_id": atom_id,
            "input_hash": input_hash,
            "output": output,
            "metadata": metadata or {},
            "metadata_hash": metadata_hash,
            "upstream": upstream,
            "timestamp": time.time(),
            "loop_flag": False,
        }

        entries.append(snapshot)
        self.global_snapshots.append(snapshot)
        self.last_inputs[atom_id] = input_hash
        self.last_metadata_hash[atom_id] = metadata_hash
        self.last_executed_at[atom_id] = time.time()
        self.consecutive_backtracks = 0
        self.backtrack_blocks.pop(atom_id, None)
        return snapshot_id

    def should_short_circuit(self, atom_id: str, input_hash: str) -> Optional[Dict[str, Any]]:
        entries = self.snapshots.get(atom_id, [])
        for entry in reversed(entries):
            if entry.get("input_hash") == input_hash:
                if self.telemetry:
                    self.telemetry.record_duplicate(atom_id, input_hash, "context_snapshot")
                self.last_inputs[atom_id] = input_hash
                return entry.get("output")
        return None

    def flag_snapshot(self, atom_id: str, input_hash: str) -> None:
        for entry in reversed(self.snapshots.get(atom_id, [])):
            if entry.get("input_hash") == input_hash:
                entry["loop_flag"] = True
                break

    def record_input_seen(self, atom_id: str, input_hash: str) -> None:
        self.last_inputs[atom_id] = input_hash
        if self.telemetry:
            self.telemetry.record_duplicate(atom_id, input_hash, "unchanged_input")

    def latest_snapshot(self, atom_id: str) -> Optional[Dict[str, Any]]:
        entries = self.snapshots.get(atom_id, [])
        return entries[-1] if entries else None

    def previous_snapshot(self, atom_id: str, current_snapshot_id: int) -> Optional[Dict[str, Any]]:
        entries = self.snapshots.get(atom_id, [])
        for entry in reversed(entries):
            if entry["id"] < current_snapshot_id:
                return entry
        return None

    def get_snapshot(self, snapshot_id: int) -> Optional[Dict[str, Any]]:
        if 0 <= snapshot_id < len(self.global_snapshots):
            return self.global_snapshots[snapshot_id]
        return None

    def find_divergent_snapshot(self, atom_id: str, current_input_hash: str, ancestors: Iterable[str]) -> Optional[Dict[str, Any]]:
        for entry in reversed(self.snapshots.get(atom_id, [])):
            if entry.get("input_hash") != current_input_hash and not entry.get("loop_flag"):
                return entry

        for parent in ancestors:
            for entry in reversed(self.snapshots.get(parent, [])):
                if entry.get("input_hash") != current_input_hash and not entry.get("loop_flag"):
                    return entry
        return None

    def record_backtrack(self) -> bool:
        self.consecutive_backtracks += 1
        if self.backtrack_window_start is None:
            self.backtrack_window_start = time.time()
        return self.consecutive_backtracks <= self.max_backtracks

    def backtrack_time_exhausted(self) -> bool:
        if self.backtrack_window_start is None:
            return False
        return (time.time() - self.backtrack_window_start) > self.backtrack_time_budget

    def trim_completed_nodes(self, allowed_atoms: Set[str]) -> None:
        self.last_inputs = {atom: h for atom, h in self.last_inputs.items() if atom in allowed_atoms}
        self.last_executed_at = {atom: t for atom, t in self.last_executed_at.items() if atom in allowed_atoms}
        self.last_metadata_hash = {atom: h for atom, h in self.last_metadata_hash.items() if atom in allowed_atoms}

    def summarize_context(self, atom_id: str, input_hash: str, upstream: Optional[str]) -> Dict[str, Any]:
        return {
            "atom_id": atom_id,
            "input_hash": input_hash,
            "upstream": upstream,
            "last_inputs": dict(self.last_inputs),
            "snapshot_count": len(self.global_snapshots),
            "consecutive_backtracks": self.consecutive_backtracks,
            "last_metadata_hash": dict(self.last_metadata_hash),
        }

    def cooldown_due(self, atom_id: str, metadata_hash: Optional[str] = None) -> bool:
        last_exec = self.last_executed_at.get(atom_id)
        if last_exec is None:
            return False
        if metadata_hash and self.cooldown_metadata.get(atom_id) not in (None, metadata_hash):
            return False
        return (time.time() - last_exec) < self.cooldown_seconds

    def reset_dedupe_guards(self, downstream_atoms: Iterable[str]) -> None:
        reset_index = len(self.global_snapshots)
        for atom in downstream_atoms:
            self.dedupe_reset_cursor[atom] = reset_index
            self.last_inputs.pop(atom, None)
            self.last_executed_at.pop(atom, None)
            self.last_metadata_hash.pop(atom, None)

    def note_cooldown_metadata(self, atom_id: str, metadata_hash: Optional[str]) -> None:
        if metadata_hash:
            self.cooldown_metadata[atom_id] = metadata_hash

    def clear_cooldown_metadata(self, atom_id: str) -> None:
        self.cooldown_metadata.pop(atom_id, None)

    def record_backtrack_event(
        self,
        *,
        cause: str,
        source_atom: str,
        target_atom: str,
        source_input_hash: str,
        target_input_hash: Optional[str],
        metadata_hash: Optional[str],
        source_snapshot_id: Optional[int],
        target_snapshot_id: Optional[int],
        upstream_snapshot: Optional[str] = None,
    ) -> None:
        event = {
            "cause": cause,
            "source_atom": source_atom,
            "target_atom": target_atom,
            "source_input_hash": source_input_hash,
            "target_input_hash": target_input_hash,
            "metadata_hash": metadata_hash,
            "source_snapshot_id": source_snapshot_id,
            "target_snapshot_id": target_snapshot_id,
            "upstream_snapshot": upstream_snapshot,
            "timestamp": time.time(),
            "lineage": self._lineage_payload(source_snapshot_id, target_snapshot_id),
        }
        self.backtrack_events.append(event)
        if self.telemetry:
            self.telemetry.record_backtrack(
                cause=cause,
                source_atom=source_atom,
                target_atom=target_atom,
                source_input_hash=source_input_hash,
                target_input_hash=target_input_hash,
                metadata_hash=metadata_hash,
                source_snapshot_id=source_snapshot_id,
                target_snapshot_id=target_snapshot_id,
                upstream_snapshot=upstream_snapshot,
            )

    def _lineage_payload(
        self, source_snapshot_id: Optional[int], target_snapshot_id: Optional[int]
    ) -> List[Dict[str, Any]]:
        lineage: List[Dict[str, Any]] = []
        if source_snapshot_id is not None:
            source = self.get_snapshot(source_snapshot_id)
            if source:
                lineage.append(
                    {
                        "id": source_snapshot_id,
                        "atom_id": source.get("atom_id"),
                        "input_hash": source.get("input_hash"),
                        "metadata_hash": source.get("metadata_hash"),
                    }
                )
        if target_snapshot_id is not None and target_snapshot_id != source_snapshot_id:
            target = self.get_snapshot(target_snapshot_id)
            if target:
                lineage.append(
                    {
                        "id": target_snapshot_id,
                        "atom_id": target.get("atom_id"),
                        "input_hash": target.get("input_hash"),
                        "metadata_hash": target.get("metadata_hash"),
                    }
                )
        return lineage

    def mark_backtrack_block(self, atom_id: str, input_hash: str, metadata_hash: Optional[str]) -> None:
        self.backtrack_blocks[atom_id] = {
            "input_hash": input_hash,
            "metadata_hash": metadata_hash,
            "timestamp": time.time(),
        }

    def consecutive_gate_blocked(self, atom_id: str, input_hash: str, metadata_hash: Optional[str], force: bool) -> bool:
        if force:
            return False
        block = self.backtrack_blocks.get(atom_id)
        if not block:
            return False
        if metadata_hash and block.get("metadata_hash") and metadata_hash != block.get("metadata_hash"):
            return False
        return block.get("input_hash") == input_hash

    def pin_snapshot(self, snapshot_id: int) -> Optional[Dict[str, Any]]:
        snapshot = self.get_snapshot(snapshot_id)
        if snapshot:
            self.pinned_snapshot_id = snapshot_id
        return snapshot

    def hard_reset(self) -> None:
        self.snapshots.clear()
        self.last_inputs.clear()
        self.last_metadata_hash.clear()
        self.last_executed_at.clear()
        self.global_snapshots.clear()
        self.consecutive_backtracks = 0
        self.backtrack_window_start = None
        self.last_atom_run = None
        self.dedupe_reset_cursor.clear()
        self.cooldown_metadata.clear()
        self.backtrack_events.clear()
        self.backtrack_blocks.clear()
        self.pinned_snapshot_id = None

    def upstream_snapshot_id(self, deps: Iterable[str]) -> str:
        """Generate a stable identifier for upstream state."""

        combined = "|".join(sorted(f"{dep}:{self.last_inputs.get(dep, 'none')}" for dep in deps)) or "root"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()


@dataclass
class LoopSignal:
    detected: bool
    reason: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    stable_checkpoint: Optional[int] = None


class WorkstreamLoopDetector:
    """Detects looping behavior in workstreams and recommends rewind points."""

    def __init__(
        self,
        *,
        input_repeat_threshold: int = 3,
        stall_threshold: int = 5,
        ratio_threshold: float = 3.0,
        window_seconds: float = 45.0,
        per_node_time_budget: float = 60.0,
        telemetry: Optional[WorkstreamTelemetry] = None,
    ) -> None:
        self.input_repeat_threshold = input_repeat_threshold
        self.stall_threshold = stall_threshold
        self.ratio_threshold = ratio_threshold
        self.window_seconds = window_seconds
        self.per_node_time_budget = per_node_time_budget
        self.telemetry = telemetry

        self.input_windows: Dict[Tuple[str, str], List[float]] = {}
        self.baseline_completed: Dict[Tuple[str, str], int] = {}
        self.first_seen: Dict[Tuple[str, str], float] = {}
        self.output_hashes: Dict[Tuple[str, str], Set[str]] = {}
        self.last_output_time: Dict[Tuple[str, str], float] = {}
        self.attempt_log: List[Tuple[float, str]] = []
        self.executed_atoms_count = 0
        self.unique_nodes_visited: Set[str] = set()
        self.attempts_since_progress = 0
        self.last_progress_time = time.time()
        self.last_stable_index: int = -1
        self.last_completed_count: int = 0

    def reset(self) -> None:
        self.input_windows.clear()
        self.baseline_completed.clear()
        self.first_seen.clear()
        self.output_hashes.clear()
        self.last_output_time.clear()
        self.attempt_log.clear()
        self.executed_atoms_count = 0
        self.unique_nodes_visited.clear()
        self.attempts_since_progress = 0
        self.last_progress_time = time.time()
        self.last_stable_index = -1
        self.last_completed_count = 0

    def note_attempt(self, *, atom_id: str, input_hash: str, completed_nodes: Set[str], stable_index: int) -> LoopSignal:
        now = time.time()
        key = (atom_id, input_hash)
        self.executed_atoms_count += 1
        self.last_stable_index = max(self.last_stable_index, stable_index)

        self._record_attempt(now, atom_id)
        self._trim_windows(now)

        window = self.input_windows.setdefault(key, [])
        window.append(now)
        self._trim_list(window, now)

        baseline = self.baseline_completed.get(key)
        if not window or baseline is None:
            self.baseline_completed[key] = len(completed_nodes)
            self.first_seen[key] = now
            window[:] = [now]
        elif len(completed_nodes) > baseline:
            # Downstream progress observed; reset the window for this input
            self.baseline_completed[key] = len(completed_nodes)
            self.first_seen[key] = now
            window[:] = [now]

        if len(window) >= self.input_repeat_threshold and len(completed_nodes) <= self.baseline_completed.get(key, 0):
            return self._signal(
                "loop_detected_input_repeat",
                atom_id,
                input_hash,
                {"count": len(window), "baseline_completed": self.baseline_completed.get(key, 0)},
            )

        ratio_signal = self._check_ratio(now)
        if ratio_signal:
            return self._signal("loop_suspected_ratio", atom_id, input_hash, ratio_signal)

        if self.attempts_since_progress >= self.stall_threshold:
            return self._signal(
                "loop_suspected_stall",
                atom_id,
                input_hash,
                {"attempts_since_progress": self.attempts_since_progress},
            )

        return LoopSignal(detected=False)

    def note_result(
        self,
        *,
        atom_id: str,
        input_hash: str,
        output_hash: Optional[str],
        success: bool,
        error: Optional[str],
        completed_nodes: Set[str],
        stable_index: int,
    ) -> LoopSignal:
        now = time.time()
        key = (atom_id, input_hash)
        self.last_stable_index = max(self.last_stable_index, stable_index)

        output_changed = False
        if output_hash:
            outputs = self.output_hashes.setdefault(key, set())
            if output_hash not in outputs:
                outputs.add(output_hash)
                output_changed = True
            self.last_output_time[key] = now

        if success and len(completed_nodes) > self.last_completed_count:
            self.last_completed_count = len(completed_nodes)
            self.attempts_since_progress = 0
            self.last_progress_time = now
            self.unique_nodes_visited.update(completed_nodes)
        else:
            self.attempts_since_progress += 1

        if not output_changed:
            first_seen = self.first_seen.get(key, now)
            elapsed_since_change = now - min(self.last_output_time.get(key, first_seen), first_seen)
            if elapsed_since_change > self.per_node_time_budget:
                return self._signal(
                    "loop_suspected_time_budget",
                    atom_id,
                    input_hash,
                    {"elapsed": elapsed_since_change},
                )

        if not success and (now - self.last_progress_time) > self.per_node_time_budget:
            return self._signal(
                "loop_suspected_error_repetition",
                atom_id,
                input_hash,
                {"elapsed": now - self.last_progress_time, "error": error},
            )

        return LoopSignal(detected=False)

    def mark_stable(self, index: int) -> None:
        self.last_stable_index = max(self.last_stable_index, index)

    def _record_attempt(self, timestamp: float, atom_id: str) -> None:
        self.attempt_log.append((timestamp, atom_id))

    def _trim_windows(self, now: float) -> None:
        window_start = now - self.window_seconds
        self.attempt_log = [(t, a) for t, a in self.attempt_log if t >= window_start]
        for key, times in list(self.input_windows.items()):
            self._trim_list(times, now)
            if not times:
                self.input_windows.pop(key, None)
                self.baseline_completed.pop(key, None)
                self.first_seen.pop(key, None)

    def _trim_list(self, values: List[float], now: float) -> None:
        window_start = now - self.window_seconds
        values[:] = [t for t in values if t >= window_start]

    def _check_ratio(self, now: float) -> Optional[Dict[str, Any]]:
        self._trim_windows(now)
        attempts = len(self.attempt_log)
        unique = len({a for _, a in self.attempt_log}) or 1
        ratio = attempts / unique
        if ratio > self.ratio_threshold:
            return {"ratio": ratio, "attempts": attempts, "unique_nodes": unique}
        return None

    def _signal(self, reason: str, atom_id: str, input_hash: str, details: Dict[str, Any]) -> LoopSignal:
        if self.telemetry:
            self.telemetry.record_loop(atom_id=atom_id, input_hash=input_hash, reason=reason, details=details)
        return LoopSignal(
            detected=True,
            reason=reason,
            details=details,
            stable_checkpoint=self.last_stable_index,
        )


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
    def runtime_validate(
        node: Dict[str, Any],
        completed: Set[str],
        normalized_input: Optional[str] = None,
        previous_inputs: Optional[Dict[str, str]] = None,
        force_execution: bool = False,
    ) -> bool:
        deps = set(node.get("depends_on", []))
        missing = deps - completed
        if missing:
            raise WorkstreamValidationError(f"Dependencies not satisfied for {node.get('atom_id')}: {', '.join(missing)}")

        node_id = node.get("atom_id") or node.get("id") or ""
        if not force_execution and normalized_input and previous_inputs is not None:
            previous_hash = previous_inputs.get(node_id)
            if previous_hash == normalized_input:
                return False
        return True


__all__ = [
    "AtomIdentity",
    "AtomMemoizer",
    "AtomExecutionPolicy",
    "CircuitBreaker",
    "DedupeBudgetExceeded",
    "LoopSignal",
    "RetryPolicy",
    "WorkstreamLoopDetector",
    "WorkstreamContextStore",
    "WorkstreamTelemetry",
    "WorkstreamValidationError",
    "WorkstreamValidator",
    "normalize_input",
    "normalize_output",
]
