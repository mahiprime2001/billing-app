from flask import Blueprint, request, jsonify, current_app as app

from services.twofa_service import list_super_admins, initiate_2fa, verify_2fa, remove_2fa

twofa_bp = Blueprint("twofa", __name__)


@twofa_bp.route("/api/2fa/super-admins", methods=["GET"])
def get_super_admins():
    """Return list of super_admin users (id, name, email)."""
    admins, status = list_super_admins()
    return jsonify({"admins": admins}), status


@twofa_bp.route("/api/2fa/initiate", methods=["POST"])
def initiate():
    """Create/rotate a 2FA secret for a selected super-admin."""
    payload = request.get_json() or {}
    user_id = payload.get("user_id")
    # Prefer caller-provided user id; fall back to target user to satisfy FK.
    current_user = request.headers.get("X-User-Id") or user_id or "system"

    if not user_id:
        return jsonify({"message": "user_id is required"}), 400

    data, message, status = initiate_2fa(user_id, requested_by=current_user)
    if status != 200:
        return jsonify({"message": message}), status

    return jsonify(data), 200


@twofa_bp.route("/api/2fa/verify", methods=["POST"])
def verify():
    """Verify a TOTP code for the given user."""
    payload = request.get_json() or {}
    user_id = payload.get("user_id")
    code = payload.get("code")

    if not user_id or not code:
        return jsonify({"message": "user_id and code are required"}), 400

    ok, message, status = verify_2fa(user_id, code)
    return jsonify({"verified": ok, "message": message}), status


@twofa_bp.route("/api/2fa/delete", methods=["POST"])
def delete_twofa():
    """Delete 2FA secret for the given user."""
    payload = request.get_json() or {}
    user_id = payload.get("user_id")

    if not user_id:
        return jsonify({"message": "user_id is required"}), 400

    ok, message, status = remove_2fa(user_id)
    return jsonify({"deleted": ok, "message": message}), status
