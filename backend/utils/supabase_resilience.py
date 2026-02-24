"""
Helpers for resilient Supabase/PostgREST reads.
"""

import logging
import time
from typing import Callable, TypeVar

import httpcore
import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")


def execute_with_retry(build_query: Callable[[], T], label: str, retries: int = 1) -> T:
    """
    Execute a Supabase query and retry transient protocol disconnects.

    `retries=1` means 1 extra attempt after the initial failure.
    """
    attempt = 0
    last_err = None
    while attempt <= retries:
        try:
            return build_query().execute()
        except (
            httpx.RemoteProtocolError,
            httpcore.RemoteProtocolError,
            httpx.ReadError,
            httpcore.ReadError,
            httpx.WriteError,
            httpcore.WriteError,
            httpx.ConnectError,
            httpcore.ConnectError,
        ) as err:
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
