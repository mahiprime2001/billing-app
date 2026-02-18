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
        response = (
            db.client.table("users")
            .select(
                "id, name, email, role, two_factor!two_factor_user_id_fkey(is_enabled, verified_at, updated_at)"
            )
            # Accept multiple role spellings to be robust with existing data
            .or_("role.ilike.super_admin,role.ilike.superadmin,role.ilike.\"super admin\",role.ilike.admin")
            .order("name")
            .execute()
        )

        admins = []
        for row in response.data or []:
            admin = {
                "id": row.get("id"),
                "name": row.get("name"),
                "email": row.get("email"),
                "role": row.get("role"),
                "twofa": _extract_twofa_status(row),
            }
            admins.append(admin)

        return admins, 200
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error listing super admins: %s", exc, exc_info=True)
        return [], 500


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
        # Only set created_by when we have a valid user id (to satisfy FK)
        if requested_by and requested_by != "system":
            record["created_by"] = requested_by

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
