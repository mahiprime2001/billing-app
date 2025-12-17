"""
Users Service
Handles all user-related business logic and database operations
"""

import logging
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from werkzeug.security import generate_password_hash, check_password_hash

from utils.supabase_db import db
from utils.json_helpers import get_users_data, save_users_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_users() -> List[Dict]:
    """Get users from local JSON storage"""
    try:
        users = get_users_data()
        transformed_users = []
        
        for user in users:
            converted_user = convert_snake_to_camel(user)
            
            # Ensure createdAt and updatedAt are properly converted
            if 'createdat' in user and 'createdAt' not in converted_user:
                converted_user['createdAt'] = user['createdat']
            if 'updatedat' in user and 'updatedAt' not in converted_user:
                converted_user['updatedAt'] = user['updatedat']
            
            # Handle assignedstores conversion to assignedStores array
            if 'assignedstores' in user:
                stores = user['assignedstores']
                if isinstance(stores, str):
                    # If it's a string, split by comma or keep as single item
                    converted_user['assignedStores'] = [stores] if stores else []
                elif isinstance(stores, list):
                    converted_user['assignedStores'] = stores
                else:
                    converted_user['assignedStores'] = []
            elif 'assignedStores' not in converted_user:
                converted_user['assignedStores'] = []
            
            transformed_users.append(converted_user)
        
        logger.debug(f"Returning {len(transformed_users)} users from local JSON.")
        return transformed_users
    except Exception as e:
        logger.error(f"Error getting local users: {e}", exc_info=True)
        return []


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_users() -> List[Dict]:
    """Get users directly from Supabase with assigned stores"""
    try:
        client = db.client
        response = client.table("users").select("*").execute()
        users = response.data or []
        
        # Fetch assigned stores for each user
        for user in users:
            user_id = user.get('id')
            if user_id:
                try:
                    stores_response = client.table("userstores").select("storeId").eq('userId', user_id).execute()
                    assigned_stores = [store['storeId'] for store in (stores_response.data or [])]
                    user['assignedstores'] = assigned_stores
                except Exception as store_err:
                    logger.warning(f"Could not fetch stores for user {user_id}: {store_err}")
                    user['assignedstores'] = []
            else:
                user['assignedstores'] = []
        
        transformed_users = []
        for user in users:
            converted_user = convert_snake_to_camel(user)
            
            # Ensure createdAt and updatedAt are properly converted
            if 'createdat' in user and 'createdAt' not in converted_user:
                converted_user['createdAt'] = user['createdat']
            if 'updatedat' in user and 'updatedAt' not in converted_user:
                converted_user['updatedAt'] = user['updatedat']
            
            # Handle assignedstores conversion to assignedStores array
            if 'assignedstores' in user:
                stores = user['assignedstores']
                if isinstance(stores, str):
                    converted_user['assignedStores'] = [stores] if stores else []
                elif isinstance(stores, list):
                    converted_user['assignedStores'] = stores
                else:
                    converted_user['assignedStores'] = []
            elif 'assignedStores' not in converted_user:
                converted_user['assignedStores'] = []
            
            transformed_users.append(converted_user)
        
        logger.debug(f"Returning {len(transformed_users)} users from Supabase.")
        return transformed_users
    except Exception as e:
        logger.error(f"Error getting Supabase users: {e}", exc_info=True)
        return []


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_users() -> Tuple[List[Dict], int]:
    """
    Get users by merging local and Supabase (Supabase takes precedence).
    Returns (users_list, status_code)
    """
    try:
        # Fetch from Supabase (preferred source)
        supabase_users = get_supabase_users()
        
        # Fetch from local JSON (fallback)
        local_users = get_local_users()
        
        # Merge: Supabase takes precedence
        users_map = {}
        
        # Add local users first (lower priority)
        for user in local_users:
            if user.get('id'):
                users_map[user['id']] = user
        
        # Add Supabase users (higher priority)
        for user in supabase_users:
            if user.get('id'):
                users_map[user['id']] = user
        
        final_users = list(users_map.values())
        logger.debug(f"Returning {len(final_users)} merged users")
        return final_users, 200
    except Exception as e:
        logger.error(f"Error getting merged users: {e}", exc_info=True)
        return [], 500


# ============================================
# BUSINESS LOGIC
# ============================================

def create_user(user_data: dict) -> Tuple[Optional[str], str, int]:
    """
    Create a new user.
    Returns (user_id, message, status_code)
    """
    try:
        if not user_data:
            return None, "No user data provided", 400
        
        # Convert field names
        user_data = convert_camel_to_snake(user_data)
        
        # Convert email to lowercase
        if 'email' in user_data:
            user_data['email'] = user_data['email'].lower().strip()
        
        # Extract assignedStores before processing user data
        assigned_stores = user_data.pop('assignedstores', None)
        
        # Generate ID if not present
        if 'id' not in user_data:
            user_data['id'] = str(uuid.uuid4())
        
        # Add timestamps
        now_naive = datetime.now().isoformat()
        if 'createdat' not in user_data:
            user_data['createdat'] = now_naive
        user_data['updatedat'] = now_naive
        
        # Define allowed columns for users table
        allowed_columns = [
            'id', 'name', 'email', 'password', 'role', 'status',
            'sessionduration', 'createdat', 'updatedat', 'lastlogin',
            'lastlogout', 'totalsessionduration'
        ]
        
        # Filter to only allowed columns
        filtered_user_data = {k: v for k, v in user_data.items() if k in allowed_columns}
        
        # Insert into Supabase users table
        client = db.client
        supabase_response = client.table('users').insert(filtered_user_data).execute()
        
        if not supabase_response.data:
            return None, "Failed to insert user into Supabase", 500
        
        # Handle assigned stores if provided
        if assigned_stores and isinstance(assigned_stores, list):
            user_id = user_data['id']
            for store_id in assigned_stores:
                try:
                    client.table('userstores').insert({
                        'userId': user_id,
                        'storeId': store_id
                    }).execute()
                    logger.info(f"Assigned store {store_id} to user {user_id}")
                except Exception as store_err:
                    logger.warning(f"Failed to assign store {store_id} to user {user_id}: {store_err}")
        
        # Save to local JSON with assignedstores for local storage
        users = get_users_data()
        local_user_data = user_data.copy()
        if assigned_stores:
            local_user_data['assignedstores'] = assigned_stores
        users.append(local_user_data)
        save_users_data(users)
        
        logger.info(f"User created {user_data['id']}")
        return user_data['id'], "User created", 201
    except Exception as e:
        logger.error(f"Error creating user: {e}", exc_info=True)
        return None, str(e), 500


def update_user(user_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a user.
    Returns (success, message, status_code)
    """
    try:
        if not update_data:
            return False, "No update data provided", 400
        
        # Convert field names
        update_data = convert_camel_to_snake(update_data)
        
        # Convert email to lowercase if present
        if 'email' in update_data:
            update_data['email'] = update_data['email'].lower().strip()
        
        # Extract assignedStores before processing
        assigned_stores = update_data.pop('assignedstores', None)
        
        # Find user in local storage
        users = get_users_data()
        user_index = next((i for i, u in enumerate(users) if u.get('id') == user_id), -1)
        
        if user_index == -1:
            return False, "User not found", 404
        
        # Update timestamp
        update_data['updatedat'] = datetime.now().isoformat()
        
        # Define allowed columns for users table
        allowed_columns = [
            'name', 'email', 'password', 'role', 'status',
            'sessionduration', 'updatedat', 'lastlogin',
            'lastlogout', 'totalsessionduration'
        ]
        
        # Filter to only allowed columns
        filtered_update_data = {k: v for k, v in update_data.items() if k in allowed_columns}
        
        # Update in local JSON with assignedstores for local storage
        local_update_data = update_data.copy()
        if assigned_stores is not None:
            local_update_data['assignedstores'] = assigned_stores
        users[user_index].update(local_update_data)
        save_users_data(users)
        
        # Update in Supabase
        client = db.client
        if filtered_update_data:  # Only update if there are allowed fields
            client.table('users').update(filtered_update_data).eq('id', user_id).execute()
        
        # Handle assigned stores if provided - THIS IS THE CRITICAL FIX
        if assigned_stores is not None:
            logger.info(f"Updating stores for user {user_id}: {assigned_stores}")
            
            # STEP 1: Delete ALL existing assignments first
            try:
                delete_response = client.table('userstores').delete().eq('userId', user_id).execute()
                logger.info(f"Deleted existing store assignments for user {user_id}")
            except Exception as del_err:
                logger.warning(f"Error deleting existing assignments for user {user_id}: {del_err}")
            
            # STEP 2: Add new assignments (even if it's an empty array)
            if isinstance(assigned_stores, list) and len(assigned_stores) > 0:
                for store_id in assigned_stores:
                    try:
                        client.table('userstores').insert({
                            'userId': user_id,
                            'storeId': store_id
                        }).execute()
                        logger.info(f"Assigned store {store_id} to user {user_id}")
                    except Exception as store_err:
                        logger.error(f"Failed to assign store {store_id} to user {user_id}: {store_err}")
        
        logger.info(f"User updated {user_id}")
        return True, "User updated", 200
    except Exception as e:
        logger.error(f"Error updating user: {e}", exc_info=True)
        return False, str(e), 500


def delete_user(user_id: str) -> Tuple[bool, str, int]:
    """
    Delete a user.
    Returns (success, message, status_code)
    """
    try:
        # Delete from local JSON
        users = get_users_data()
        user_index = next((i for i, u in enumerate(users) if u.get('id') == user_id), -1)
        
        if user_index == -1:
            return False, "User not found", 404
        
        users.pop(user_index)
        save_users_data(users)
        
        # Delete from Supabase
        client = db.client
        
        # Delete user-store assignments first (foreign key constraint)
        client.table('userstores').delete().eq('userId', user_id).execute()
        
        # Delete user
        client.table('users').delete().eq('id', user_id).execute()
        
        logger.info(f"User deleted {user_id}")
        return True, "User deleted", 200
    except Exception as e:
        logger.error(f"Error deleting user: {e}", exc_info=True)
        return False, str(e), 500


def authenticate_user(email: str, password: str) -> Tuple[Optional[Dict], str, int]:
    """
    Authenticate a user.
    Returns (user_data, message, status_code)
    """
    try:
        # Convert email to lowercase for comparison
        email = email.lower().strip()
        
        users = get_users_data()
        user = next((u for u in users if u.get('email', '').lower() == email), None)
        
        if not user:
            return None, "Invalid credentials", 401
        
        # If not hashing, directly compare passwords. WARNING: INSECURE FOR PRODUCTION
        if user.get('password') != password:
            return None, "Invalid credentials", 401
        
        # Include password in response as per user request (WARNING: INSECURE)
        user_data = user.copy()  # No longer removing password
        user_data = convert_snake_to_camel(user_data)
        
        # Ensure createdAt and updatedAt are properly converted
        if 'createdat' in user and 'createdAt' not in user_data:
            user_data['createdAt'] = user['createdat']
        if 'updatedat' in user and 'updatedAt' not in user_data:
            user_data['updatedAt'] = user['updatedat']
        
        # Handle assignedstores conversion to assignedStores array
        if 'assignedstores' in user:
            stores = user['assignedstores']
            if isinstance(stores, str):
                user_data['assignedStores'] = [stores] if stores else []
            elif isinstance(stores, list):
                user_data['assignedStores'] = stores
            else:
                user_data['assignedStores'] = []
        elif 'assignedStores' not in user_data:
            user_data['assignedStores'] = []
        
        logger.info(f"User authenticated: {email}")
        return user_data, "Authentication successful", 200
    except Exception as e:
        logger.error(f"Error authenticating user: {e}", exc_info=True)
        return None, str(e), 500
