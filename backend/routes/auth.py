"""
Auth Routes
Flask blueprint for authentication-related API endpoints
"""
from flask import Blueprint, jsonify, request
import logging

from services import users_service

logger = logging.getLogger(__name__)

# Create Blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400
        
        user_data, message, status_code = users_service.authenticate_user(email, password)
        
        if status_code == 200:
            # Extract role from user_data
            user_role = user_data.get('role', 'billing_user')  # Default to billing_user if missing
            
            return jsonify({
                "message": message,
                "user": user_data,
                "auth_ok": True,           # ✅ ADD THIS
                "user_role": user_role     # ✅ ADD THIS
            }), 200
        else:
            return jsonify({
                "error": message,
                "auth_ok": False           # ✅ ADD THIS for failed logins
            }), status_code

    except Exception as e:
        logger.error(f"Error in login: {e}", exc_info=True)
        return jsonify({"error": str(e), "auth_ok": False}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """User logout"""
    try:
        # In a stateless JWT system, logout is typically handled client-side
        # by removing the token. This endpoint can be used for logging purposes.
        return jsonify({"message": "Logged out successfully"}), 200
            
    except Exception as e:
        logger.error(f"Error in logout: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@auth_bp.route('/forgot-password-proxy', methods=['POST'])
def forgot_password_proxy():
    """Forgot password proxy"""
    try:
        data = request.json
        email = data.get('email')
        
        if not email:
            return jsonify({"error": "Email is required"}), 400
        
        # This would typically send a password reset email
        # For now, just acknowledge the request
        logger.info(f"Password reset requested for: {email}")
        
        return jsonify({
            "message": "Password reset instructions sent to email"
        }), 200
            
    except Exception as e:
        logger.error(f"Error in forgot_password_proxy: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@auth_bp.route('/verify', methods=['POST'])
def verify_token():
    """Verify authentication token"""
    try:
        # This would verify JWT token
        # For now, just return success
        return jsonify({"message": "Token valid"}), 200
            
    except Exception as e:
        logger.error(f"Error in verify_token: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
