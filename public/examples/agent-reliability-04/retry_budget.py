"""Sequential retry/deadline teaching model plus a real SQLite commit boundary.

Ticks are integers on a manually advanced logical clock, NOT measured
latency. Only SQLite/process operations execute against real local resources.
"""
from dataclasses import dataclass, field, replace
from enum import Enum
import json
from pathlib import Path
import queue
import sqlite3
import subprocess
import sys
import threading
from typing import Callable, Optional


def natural(value: int, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")


class Safety(str, Enum):
    READ_ONLY = "read_only"
    IDEMPOTENT = "declared_idempotent"
    NON_IDEMPOTENT = "non_idempotent"


@dataclass(frozen=True)
class Request:
    payload: str
    safety: Safety
    key: Optional[str] = None
    scope: str = "synthetic.append.v1"

    def __post_init__(self):
        if not isinstance(self.safety, Safety):
            raise ValueError("safety must be an explicit Safety declaration")
        if not isinstance(self.payload, str) or not self.scope:
            raise ValueError("a string payload and nonempty operation scope are required")
        if self.safety is Safety.IDEMPOTENT and (not isinstance(self.key, str) or not self.key.strip()):
            raise ValueError("declared-idempotent requests need a stable nonempty key")
        if self.safety is not Safety.IDEMPOTENT and self.key is not None:
            raise ValueError("a key alone must not imply an idempotency guarantee")


@dataclass(frozen=True)
class Outcome:
    status: str
    reason: str = ""
    value: Optional[int] = None
    business_state: str = "not_reported"


RETRYABLE = frozenset({"transient", "unknown"})


def may_retry(request: Request, outcome: Outcome) -> bool:
    """Unknown non-idempotent calls require reconciliation, never blind replay."""
    return outcome.status in RETRYABLE and request.safety in {
        Safety.READ_ONLY, Safety.IDEMPOTENT
    }


@dataclass
class LogicalClock:
    now_ticks: int = 0

    def __post_init__(self):
        natural(self.now_ticks, "now_ticks")

    def advance(self, ticks: int) -> None:
        natural(ticks, "ticks")
        self.now_ticks += ticks


@dataclass
class Cancellation:
    at_ticks: Optional[int] = None
    requested: bool = False

    def __post_init__(self):
        if self.at_ticks is not None:
            natural(self.at_ticks, "at_ticks")

    def cancel(self) -> None:
        self.requested = True

    def active(self, clock: LogicalClock) -> bool:
        return self.requested or (self.at_ticks is not None and clock.now_ticks >= self.at_ticks)


@dataclass
class Budget:
    clock: LogicalClock
    deadline_ticks: int  # Absolute, fixed at operation start; never a duration.
    max_dispatches: int  # Includes the FIRST dispatch, not only retries.
    cancellation: Cancellation
    used_dispatches: int = field(default=0, init=False)

    def __post_init__(self):
        natural(self.deadline_ticks, "deadline_ticks")
        natural(self.max_dispatches, "max_dispatches")

    def time_stop(self) -> Optional[Outcome]:
        # Cancellation takes priority if both arrive at the same instant.
        if self.cancellation.active(self.clock):
            return Outcome("stopped", "cancelled")
        if self.clock.now_ticks >= self.deadline_ticks:
            return Outcome("stopped", "deadline_exceeded")
        return None

    def admission_stop(self) -> Optional[Outcome]:
        blocked = self.time_stop()
        if blocked:
            return blocked
        if self.used_dispatches >= self.max_dispatches:
            return Outcome("stopped", "dispatch_budget_exhausted")
        return None

    def reserve_dispatch(self) -> Optional[Outcome]:
        """Check and consume immediately before the actual leaf invocation.

        This check/increment is only sequential. It is NOT an atomic concurrent
        reservation, durable restart budget, or distributed admission controller.
        """
        blocked = self.admission_stop()
        if blocked:
            return blocked
        self.used_dispatches += 1
        return None

    def spend_time(self, ticks: int) -> Optional[Outcome]:
        """Cooperative logical wait/work, truncated at the absolute boundary."""
        natural(ticks, "ticks")
        blocked = self.time_stop()
        if blocked:
            return blocked
        end = min(self.clock.now_ticks + ticks, self.deadline_ticks)
        if self.cancellation.at_ticks is not None:
            end = min(end, self.cancellation.at_ticks)
        self.clock.advance(end - self.clock.now_ticks)
        return self.time_stop()


@dataclass(frozen=True)
class Layer:
    name: str
    max_retries: int = 2
    backoff_ticks: int = 0

    def __post_init__(self):
        if not self.name:
            raise ValueError("layer name is required")
        natural(self.max_retries, "max_retries")
        natural(self.backoff_ticks, "backoff_ticks")


@dataclass
class Trace:
    dispatches: list = field(default_factory=list)
    waits: list = field(default_factory=list)
    layer_calls: list = field(default_factory=list)


class ScriptedEndpoint:
    """Synthetic outcomes and latency only. No network, LLM, or side effects."""

    def __init__(self, outcomes=("transient",), duration_ticks=6):
        if not outcomes or any(x not in {"transient", "unknown", "success", "permanent"} for x in outcomes):
            raise ValueError("supply one or more supported endpoint outcomes")
        natural(duration_ticks, "duration_ticks")
        self.outcomes = tuple(outcomes)
        self.duration_ticks = duration_ticks
        self.calls = 0

    def __call__(self, request: Request, budget: Budget) -> Outcome:
        index = min(self.calls, len(self.outcomes) - 1)
        self.calls += 1
        blocked = budget.spend_time(self.duration_ticks)
        if blocked:
            return blocked
        return Outcome(self.outcomes[index], "fixture_response")


class RetryStack:
    """Nested layers with either shared control or a deliberately broken reset.

    A leaf dispatch is one invocation of endpoint. Wrapping calls and waits do
    not consume dispatch tokens, but ALL logical waits consume elapsed time.
    Each layer permits max_retries + 1 calls to its child.
    """

    def __init__(self, clock: LogicalClock, layers, timeout_ticks: int,
                 max_dispatches: int, cancellation=None, reset_each_layer=False):
        natural(timeout_ticks, "timeout_ticks")
        natural(max_dispatches, "max_dispatches")
        self.clock = clock
        self.layers = tuple(layers)
        if not self.layers or not all(isinstance(layer, Layer) for layer in self.layers):
            raise ValueError("at least one retry layer is required")
        self.timeout_ticks = timeout_ticks
        self.max_dispatches = max_dispatches
        self.cancellation = cancellation or Cancellation()
        self.reset_each_layer = reset_each_layer
        self.trace = Trace()
        self.budget = Budget(clock, clock.now_ticks + timeout_ticks, max_dispatches, self.cancellation)
        self._used = False
        self.business_state = "not_attempted"

    def run(self, request: Request, endpoint: Callable) -> Outcome:
        # A stack is one operation. Reusing it is not a way to refresh a budget.
        if self._used:
            raise ValueError("create one RetryStack per logical operation")
        self._used = True
        return self._call(0, self.budget, (), request, endpoint)

    def _call(self, index, budget, path, request, endpoint):
        if index == len(self.layers):
            blocked = budget.reserve_dispatch()
            if blocked:
                return replace(blocked, business_state=self.business_state)
            record = {"number": len(self.trace.dispatches) + 1,
                      "path": list(path), "start_ticks": self.clock.now_ticks,
                      "deadline_ticks": budget.deadline_ticks, "key": request.key}
            self.trace.dispatches.append(record)  # Counts even ambiguous/failing calls.
            observed = endpoint(request, budget)
            if observed.business_state != "not_reported":
                self.business_state = observed.business_state
            elif request.safety is Safety.READ_ONLY:
                self.business_state = "read_only"
            elif observed.status == "success":
                self.business_state = "confirmed"
            else:
                self.business_state = "unknown"
            # Stop reason and business evidence are separate. A late response
            # does not restore the workflow deadline; do not erase its evidence.
            result = budget.time_stop() or observed
            result = replace(result, value=observed.value, business_state=self.business_state)
            record.update(end_ticks=self.clock.now_ticks, status=result.status, reason=result.reason,
                          observed_status=observed.status, observed_reason=observed.reason,
                          business_state=self.business_state)
            return result

        if self.reset_each_layer:
            # INTENTIONALLY WRONG: descendants replace, rather than inherit,
            # the parent's deadline and dispatch accounting.
            budget = Budget(self.clock, self.clock.now_ticks + self.timeout_ticks,
                            self.max_dispatches, self.cancellation)
        layer = self.layers[index]
        self.trace.layer_calls.append({"layer": layer.name, "start_ticks": self.clock.now_ticks,
                                       "deadline_ticks": budget.deadline_ticks})
        for attempt in range(layer.max_retries + 1):
            # Deliberately skip stale parent budget checks in reset mode to
            # reproduce a stack whose layers have independent timeout scopes.
            if not self.reset_each_layer:
                blocked = budget.time_stop()
                if blocked:
                    return replace(blocked, business_state=self.business_state)
            result = self._call(index + 1, budget, path + (f"{layer.name}:{attempt + 1}",), request, endpoint)
            if not may_retry(request, result):
                if result.status in RETRYABLE:
                    return replace(result, reason="unsafe_retry_requires_reconciliation")
                return result
            if attempt == layer.max_retries:
                return result
            if not self.reset_each_layer:
                # Do not wait for a retry that has no dispatch token left.
                blocked = budget.admission_stop()
                if blocked:
                    return replace(blocked, business_state=self.business_state)
            if layer.backoff_ticks:
                start = self.clock.now_ticks
                blocked = budget.spend_time(layer.backoff_ticks)
                self.trace.waits.append({"layer": layer.name, "start_ticks": start,
                                         "end_ticks": self.clock.now_ticks})
                if blocked:
                    return replace(blocked, business_state=self.business_state)
        raise AssertionError("unreachable")


def init_store(path: Path) -> None:
    with sqlite3.connect(path) as db:
        db.executescript("""
        PRAGMA journal_mode=DELETE;
        CREATE TABLE IF NOT EXISTS effects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS dedup (
            scope TEXT NOT NULL, operation_key TEXT NOT NULL,
            payload TEXT NOT NULL, effect_id INTEGER NOT NULL REFERENCES effects(id),
            PRIMARY KEY(scope, operation_key));
        """)


def receiver_apply(path: Path, request: Request) -> int:
    """Receiver-side key/payload binding and effect commit in ONE transaction."""
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        if request.safety is Safety.READ_ONLY:
            return db.execute("SELECT COUNT(*) FROM effects").fetchone()[0]
        db.execute("BEGIN IMMEDIATE")
        if request.safety is Safety.IDEMPOTENT:
            old = db.execute("SELECT payload, effect_id FROM dedup WHERE scope=? AND operation_key=?",
                             (request.scope, request.key)).fetchone()
            if old:
                if old[0] != request.payload:
                    raise ValueError("idempotency key reused with different payload")
                return old[1]
        effect_id = db.execute("INSERT INTO effects(scope, payload) VALUES (?, ?)",
                               (request.scope, request.payload)).lastrowid
        if request.safety is Safety.IDEMPOTENT:
            db.execute("INSERT INTO dedup VALUES (?, ?, ?, ?)",
                       (request.scope, request.key, request.payload, effect_id))
        return effect_id


def effect_count(path: Path) -> int:
    # A new connection verifies committed state, not uncommitted process memory.
    with sqlite3.connect(path) as db:
        return db.execute("SELECT COUNT(*) FROM effects").fetchone()[0]


def cancel_after_commit(path: Path, request: Request) -> dict:
    """Real subprocess termination AFTER commit and BEFORE a business receipt.

    The first stdout line is privileged TEST HARNESS instrumentation, not a
    receiver receipt visible to the modeled application. An IPC barrier avoids
    timing sleeps. The five-second timeouts only detect a hung harness.
    """
    args = [sys.executable, str(Path(__file__).resolve()), "--receiver", str(Path(path).resolve()),
            request.safety.value, request.key or "", request.scope, request.payload]
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    lines = queue.Queue()
    reader = threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True)
    reader.start()
    try:
        try:
            barrier = lines.get(timeout=5)
        except queue.Empty as exc:
            raise RuntimeError("receiver commit barrier timed out") from exc
        reader.join(timeout=1)
        if barrier != "COMMITTED_BARRIER\n":
            raise RuntimeError("receiver did not reach commit barrier")
        process.terminate()  # Stops the local worker; not a database rollback.
        remaining, errors = process.communicate(timeout=5)
        if remaining or errors:
            raise RuntimeError(f"unexpected receiver output: {remaining!r} {errors!r}")
        return {"client_state": "unknown", "business_receipt_received": False,
                "worker_terminated": process.returncode is not None,
                "effects_after_reopen": effect_count(path)}
    finally:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=5)
        reader.join(timeout=1)


def _receiver_main():
    _, _, path, safety, key, scope, payload = sys.argv
    request = Request(payload, Safety(safety), key or None, scope)
    effect_id = receiver_apply(Path(path), request)  # Context exit committed.
    print("COMMITTED_BARRIER", flush=True)
    # Parent terminates the process without releasing this business-receipt gate.
    if sys.stdin.readline() == "release\n":
        print(json.dumps({"effect_id": effect_id}), flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 7 and sys.argv[1] == "--receiver":
        _receiver_main()
    else:
        raise SystemExit("This module is imported by run_experiment.py and tests")
