"""
Helpers for resilient Supabase/PostgREST reads.
"""

import logging
import random
import re
import time
from typing import Callable, Optional, TypeVar

import httpcore
import httpx
import utils.supabase_circuit as supabase_circuit
from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _extract_postgrest_status(err: Exception) -> Optional[int]:
    payload = err.args[0] if getattr(err, "args", None) else None
    if isinstance(payload, dict):
        for key in ("code", "status_code", "status"):
            value = payload.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
    text = str(err)
    match = re.search(r"'code':\s*'?(\d{3})'?", text)
    if match:
        return int(match.group(1))
    return None


def is_transient_supabase_error(err: Exception) -> bool:
    if isinstance(
        err,
        (
            httpx.RemoteProtocolError,
            httpcore.RemoteProtocolError,
            httpx.ReadError,
            httpcore.ReadError,
            httpx.WriteError,
            httpcore.WriteError,
            httpx.ConnectError,
            httpcore.ConnectError,
            httpx.ConnectTimeout,
            httpcore.ConnectTimeout,
            httpx.ReadTimeout,
            httpcore.ReadTimeout,
            httpx.WriteTimeout,
            httpcore.WriteTimeout,
        ),
    ):
        return True

    if isinstance(err, APIError):
        status = _extract_postgrest_status(err)
        if status in {429, 500, 502, 503, 504}:
            return True
        text = str(err).lower()
        return (
            "json could not be generated" in text
            or "bad gateway" in text
            or "gateway timeout" in text
            or "service unavailable" in text
        )

    return False


def is_circuit_open_error(err: Exception) -> bool:
    """
    Return True when the error is from the local Supabase circuit guard,
    not from an upstream Supabase API failure.
    """
    return "Supabase offline circuit is open" in str(err)


def execute_with_retry(build_query: Callable[[], T], label: str, retries: int = 2) -> T:
    """
    Execute a Supabase query and retry transient protocol disconnects.

    `retries=1` means 1 extra attempt after the initial failure.
    """
    attempt = 0
    last_err = None
    if supabase_circuit.is_offline():
        # Allow periodic probe attempts while circuit is open.
        if not supabase_circuit.should_probe():
            raise httpx.ConnectTimeout("Supabase offline circuit is open")
        logger.info("Supabase circuit open; probing with %s request", label)

    while attempt <= retries:
        try:
            response = build_query().execute()
            supabase_circuit.mark_success()
            return response
        except Exception as err:
            # Circuit-open is an intentional local guard state; do not retry or
            # re-mark failure, just bubble up to caller for fallback handling.
            if is_circuit_open_error(err):
                raise
            if not is_transient_supabase_error(err):
                raise
            supabase_circuit.mark_failure()
            last_err = err
            if attempt >= retries:
                break
            delay = min(2.5, 0.25 * (2 ** attempt) + random.uniform(0.05, 0.35))
            logger.warning(
                "Supabase %s transient failure, retrying (%d/%d) after %.2fs: %s",
                label,
                attempt + 1,
                retries,
                delay,
                err,
            )
            time.sleep(delay)
            attempt += 1
    raise last_err
