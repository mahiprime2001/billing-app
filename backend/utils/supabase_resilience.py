"""
Helpers for resilient Supabase/PostgREST reads.
"""

import logging
import time
from typing import Callable, TypeVar

import httpcore
import httpx
import utils.supabase_circuit as supabase_circuit

logger = logging.getLogger(__name__)

T = TypeVar("T")


def execute_with_retry(build_query: Callable[[], T], label: str, retries: int = 1) -> T:
    """
    Execute a Supabase query and retry transient protocol disconnects.

    `retries=1` means 1 extra attempt after the initial failure.
    """
    attempt = 0
    last_err = None
    if supabase_circuit.is_offline():
        raise httpx.ConnectTimeout("Supabase offline circuit is open")

    while attempt <= retries:
        try:
            response = build_query().execute()
            supabase_circuit.mark_success()
            return response
        except (
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
        ) as err:
            supabase_circuit.mark_failure()
            last_err = err
            if attempt >= retries:
                break
            logger.warning(
                "Supabase %s request disconnected, retrying (%d/%d): %s",
                label,
                attempt + 1,
                retries,
                err,
            )
            time.sleep(0.2 * (attempt + 1))
            attempt += 1
    raise last_err
