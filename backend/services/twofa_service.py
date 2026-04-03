"""
Two-Factor Authentication service.
Handles secret generation, QR creation, and verification against Supabase.
"""

import base64
import io
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

import pyotp
import qrcode

from utils.supabase_db import db

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_qr_image(data: str) -> str:
    """Return a data URL (PNG) for the provided otpauth URI."""
    qr = qrcode.QRCode(box_size=4, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def _resolve_user_id(value: Optional[str]) -> Optional[str]:
    """
    Resolve an incoming identifier to a real users.id.
    Accepts either a user id or an email and returns the canonical id.
    """
    if not value:
        return None

    candidate = value.strip()
    if not candidate:
        return None

    try:
        # First, treat the value as a direct user id.
        by_id = db.client.table("users").select("id").eq("id", candidate).limit(1).execute()
        if by_id.data:
            return by_id.data[0].get("id")

        # Fallback: treat it as an email.
        by_email = db.client.table("users").select("id").eq("email", candidate).limit(1).execute()
        if by_email.data:
            return by_email.data[0].get("id")
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Unable to resolve user identifier '%s': %s", candidate, exc)

    return None


def _extract_twofa_status(row: Dict) -> Optional[Dict]:
    """Normalize the nested two_factor relation into a simple dict."""
    tf = row.get("two_factor")
    if not tf:
        return None
    # Supabase returns a list for 1-many relations; guard for both list/dict.
    record = tf[0] if isinstance(tf, list) and tf else tf
    if not isinstance(record, dict):
        return None
    return {
        "is_enabled": bool(record.get("is_enabled")),
        "verified_at": record.get("verified_at"),
        "updated_at": record.get("updated_at"),
    }


def list_super_admins() -> Tuple[list, int]:
    """Return all super_admin users (id, name, email, 2fa status)."""
    try:
        # Query users first without relational joins so schema/FK naming differences
        # do not break the endpoint.
        response = (
            db.client.table("users")
            .select("id, name, email, role")
            # Accept multiple role spellings to be robust with existing data
            .or_("role.ilike.super_admin,role.ilike.superadmin,role.ilike.\"super admin\",role.ilike.admin")
            .order("name")
            .execute()
        )

        user_rows = response.data or []
        user_ids = [row.get("id") for row in user_rows if row.get("id")]

        # Best-effort 2FA status lookup.
        twofa_by_user: Dict[str, Dict] = {}
        if user_ids:
            try:
                twofa_response = (
                    db.client.table("two_factor")
                    .select("user_id, is_enabled, verified_at, updated_at")
                    .in_("user_id", user_ids)
                    .execute()
                )
                for row in twofa_response.data or []:
                    uid = row.get("user_id")
                    if not uid:
                        continue
                    twofa_by_user[str(uid)] = {
                        "is_enabled": bool(row.get("is_enabled")),
                        "verified_at": row.get("verified_at"),
                        "updated_at": row.get("updated_at"),
                    }
            except Exception as twofa_exc:
                logger.warning("2FA status lookup failed in list_super_admins: %s", twofa_exc)

        admins = []
        for row in user_rows:
            admin = {
                "id": row.get("id"),
                "name": row.get("name"),
                "email": row.get("email"),
                "role": row.get("role"),
                "twofa": twofa_by_user.get(str(row.get("id") or "")),
            }
            admins.append(admin)

        return admins, 200
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error listing super admins: %s", exc, exc_info=True)
        # Keep settings UI usable even if backend 2FA metadata query fails.
        return [], 200


def initiate_2fa(user_id: str, requested_by: str) -> Tuple[Optional[Dict], str, int]:
    """
    Create or rotate a secret for user_id and return otpauth URI + QR.
    """
    try:
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        otp_auth = totp.provisioning_uri(name=user_id, issuer_name="Siri Billing")
        qr_data_url = _build_qr_image(otp_auth)

        record = {
            "user_id": user_id,
            "secret": secret,
            "is_enabled": False,
            "verified_at": None,
            "updated_at": _now_iso(),
        }
        # Only set created_by when we can resolve it to a valid users.id (FK-safe).
        created_by_id = _resolve_user_id(requested_by if requested_by != "system" else None)
        if created_by_id:
            record["created_by"] = created_by_id

        # Upsert into Supabase
        db.client.table("two_factor").upsert(record).execute()

        return {
            "user_id": user_id,
            "otp_auth": otp_auth,
            "qr_data_url": qr_data_url,
            "secret": secret,
        }, "ok", 200
    except Exception as exc:
        logger.error("Error initiating 2FA: %s", exc, exc_info=True)
        return None, "Failed to generate 2FA secret", 500


def verify_2fa(user_id: str, code: str) -> Tuple[bool, str, int]:
    """Validate the provided TOTP code for user_id."""
    try:
        resp = db.client.table("two_factor").select("secret").eq("user_id", user_id).limit(1).execute()
        if not resp.data:
            return False, "2FA not set up for this user", 404

        secret = resp.data[0]["secret"]
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            return False, "Invalid or expired code", 400

        db.client.table("two_factor").update(
            {"is_enabled": True, "verified_at": _now_iso(), "updated_at": _now_iso()}
        ).eq("user_id", user_id).execute()

        return True, "2FA verified", 200
    except Exception as exc:
        logger.error("Error verifying 2FA: %s", exc, exc_info=True)
        return False, "Verification failed", 500


def remove_2fa(user_id: str) -> Tuple[bool, str, int]:
    """Delete the 2FA secret for a user."""
    try:
        db.client.table("two_factor").delete().eq("user_id", user_id).execute()
        return True, "2FA removed", 200
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error deleting 2FA: %s", exc, exc_info=True)
        return False, "Failed to delete 2FA", 500
