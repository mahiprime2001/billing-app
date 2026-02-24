"""
Users Service
Handles all user-related business logic and database operations
"""

import logging
import time
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from httpx import RemoteProtocolError
from werkzeug.security import generate_password_hash, check_password_hash

from utils.supabase_db import db
from utils.json_helpers import get_users_data, save_users_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel
from utils.concurrency_guard import extract_base_markers, safe_update_with_conflict_check

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

def assign_store_to_user(user_id: str, store_id: str) -> bool:
    """Assign a store to a user in the userstores table."""
    try:
        client = db.client
        response = client.table("userstores").insert({
            "userId": user_id,
            "storeId": store_id
        }).execute()
        if response.status_code == 201:
            logger.info(f"Successfully assigned store {store_id} to user {user_id}.")
            return True
        else:
            logger.error(f"Failed to assign store {store_id} to user {user_id}: {response.message}")
            return False
    except Exception as e:
        logger.error(f"Error assigning store {store_id} to user {user_id}: {e}", exc_info=True)
        return False

def get_supabase_users() -> List[Dict]:
    """Get users directly from Supabase with assigned stores."""
    try:
        print("\n" + "="*80)
        print("[BACKEND] get_supabase_users called")
        print("="*80)
        
        client = db.client

        def _execute_with_retry(build_query, label: str):
            try:
                return build_query().execute()
            except RemoteProtocolError as err:
                logger.warning(f"Supabase {label} request disconnected, retrying once: {err}")
                time.sleep(0.2)
                return build_query().execute()

        response = _execute_with_retry(lambda: client.table("users").select("*"), "users")
        users = response.data or []
        
        print(f"[BACKEND] Found {len(users)} users in Supabase")

        # Fetch assigned stores for each user
        for user in users:
            user_id = user.get('id')
            if user_id:
                try:
                    print(f"[BACKEND] Fetching stores for user {user_id}")
                    stores_response = _execute_with_retry(
                        lambda: client.table("userstores").select("storeId").eq('userId', user_id),
                        f"userstores for user {user_id}",
                    )
                    
                    if hasattr(stores_response, 'data') and stores_response.data is not None:
                        assigned_stores = [store['storeId'] for store in stores_response.data]
                        user['assignedstores'] = assigned_stores
                        print(f"[BACKEND] User {user_id} has {len(assigned_stores)} assigned stores: {assigned_stores}")
                    else:
                        print(f"[BACKEND] No stores found for user {user_id}")
                        user['assignedstores'] = []
                except Exception as store_err:
                    print(f"[BACKEND] ⚠️ Could not fetch stores for user {user_id}: {store_err}")
                    user['assignedstores'] = []
            else:
                user['assignedstores'] = []
        
        print(f"[BACKEND] Returning {len(users)} users with store assignments")
        print("="*80 + "\n")
        return users
    except RemoteProtocolError as e:
        # Network/protocol blips should not spam stack traces; local fallback will be used.
        logger.warning(f"Supabase users fetch failed (protocol disconnect): {e}")
        print(f"[BACKEND] ⚠️ Supabase users fetch failed: {e}")
        return []
    except Exception as e:
        logger.warning(f"Supabase users fetch failed: {e}")
        print(f"[BACKEND] ⚠️ Supabase users fetch failed: {e}")
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
        print("\n" + "="*80)
        print("[BACKEND] get_merged_users called")
        print("="*80)
        
        # Fetch from Supabase first (source of truth)
        supabase_users = get_supabase_users()

        # If Supabase is reachable, return it and refresh local cache.
        if supabase_users:
            normalized_users: List[Dict] = []
            for user in supabase_users:
                if not user.get("id"):
                    continue
                camel_user = convert_snake_to_camel(user)
                if 'assignedstores' in user:
                    camel_user['assignedStores'] = user['assignedstores']
                elif 'assignedStores' not in camel_user:
                    camel_user['assignedStores'] = []
                if 'createdat' in user and 'createdAt' not in camel_user:
                    camel_user['createdAt'] = user['createdat']
                if 'updatedat' in user and 'updatedAt' not in camel_user:
                    camel_user['updatedAt'] = user['updatedat']
                normalized_users.append(camel_user)

            # Refresh local cache from Supabase snapshot.
            try:
                cache_rows = [convert_camel_to_snake(u) for u in normalized_users]
                save_users_data(cache_rows)
            except Exception as cache_err:
                logger.warning(f"Failed to refresh local users cache: {cache_err}")

            print(f"[BACKEND] Returning {len(normalized_users)} users from Supabase (cache refreshed)")
            print("="*80 + "\n")
            return normalized_users, 200

        # Fallback to local JSON when Supabase is unavailable.
        local_users = get_local_users()
        users_map = {}
        for user in local_users:
            if user.get('id'):
                users_map[user['id']] = user
        
        final_users = list(users_map.values())
        
        print(f"[BACKEND] Returning {len(final_users)} merged users")
        for user in final_users:
            print(f"[BACKEND] User {user.get('id')} - assignedStores: {user.get('assignedStores', [])}")
        print("="*80 + "\n")
        
        return final_users, 200
    except Exception as e:
        logger.error(f"Error getting merged users: {e}", exc_info=True)
        print(f"[BACKEND] ❌ ERROR getting merged users: {e}")
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
        print("\n" + "="*80)
        print("[BACKEND] create_user called")
        print("="*80)
        
        if not user_data:
            print("[BACKEND] ERROR: No user data provided")
            return None, "No user data provided", 400

        print(f"[BACKEND] Raw user_data received: {user_data}")

        # Convert field names from camelCase → snake_case
        user_data = convert_camel_to_snake(user_data)
        print(f"[BACKEND] After convert_camel_to_snake: {user_data}")

        # Normalize email
        if 'email' in user_data:
            user_data['email'] = user_data['email'].lower().strip()

        # Extract assigned stores (handle both snake & camel case)
        assigned_stores = user_data.pop('assigned_stores', user_data.pop('assignedStores', None))
        print(f"[BACKEND] Extracted assigned_stores (raw): {assigned_stores}")
        print(f"[BACKEND] Type of assigned_stores: {type(assigned_stores)}")

        # Normalize assigned_stores → always list or None
        if isinstance(assigned_stores, str):
            assigned_stores = [s.strip() for s in assigned_stores.split(',') if s.strip()]
            print(f"[BACKEND] Converted string to list: {assigned_stores}")
        
        print(f"[BACKEND] Final assigned_stores (normalized): {assigned_stores}")

        # Generate ID if not provided
        if 'id' not in user_data:
            user_data['id'] = str(uuid.uuid4())

        user_id = user_data['id']
        print(f"[BACKEND] User ID: {user_id}")

        # Add timestamps
        now = datetime.now().isoformat()
        user_data.setdefault('createdat', now)
        user_data['updatedat'] = now

        # Allowed columns for Supabase users table
        allowed_columns = [
            'id', 'name', 'email', 'password', 'role', 'status',
            'sessionduration', 'createdat', 'updatedat',
            'lastlogin', 'lastlogout', 'totalsessionduration'
        ]

        filtered_user_data = {k: v for k, v in user_data.items() if k in allowed_columns}
        print(f"[BACKEND] Filtered user_data for Supabase: {filtered_user_data}")

        # Insert user into Supabase
        print("[BACKEND] Inserting user into Supabase...")
        client = db.client
        response = client.table('users').insert(filtered_user_data).execute()

        if not response.data:
            print("[BACKEND] ERROR: Supabase user insert failed")
            return None, "Failed to create user", 500

        print("[BACKEND] ✅ User inserted into Supabase successfully")

        # 🔥 Assign stores
        if assigned_stores is not None:
            print(f"[BACKEND] Processing store assignments: {assigned_stores}")
            if isinstance(assigned_stores, list):
                print(f"[BACKEND] Assigning {len(assigned_stores)} stores to user {user_id}")
                for store_id in assigned_stores:
                    try:
                        print(f"[BACKEND] Assigning store {store_id} to user {user_id}")
                        store_response = client.table('userstores').insert({
                            'userId': user_id,
                            'storeId': store_id
                        }).execute()
                        print(f"[BACKEND] ✅ Successfully assigned store {store_id}")
                    except Exception as store_err:
                        print(f"[BACKEND] ⚠️ Failed to assign store {store_id}: {store_err}")
            else:
                print(f"[BACKEND] ⚠️ assigned_stores is not a list: {type(assigned_stores)}")
        else:
            print("[BACKEND] No stores to assign (assigned_stores is None)")

        # Save to local JSON
        print("[BACKEND] Saving to local JSON...")
        users = get_users_data()
        local_user_data = user_data.copy()

        # Preserve assignedStores for local storage
        if assigned_stores is not None:
            local_user_data['assignedstores'] = assigned_stores
            print(f"[BACKEND] Saved assignedstores to local JSON: {assigned_stores}")

        users.append(local_user_data)
        save_users_data(users)
        print("[BACKEND] ✅ Saved to local JSON successfully")

        print(f"[BACKEND] ✅✅✅ User created successfully: {user_id}")
        print("="*80 + "\n")
        return user_id, "User created", 201

    except Exception as e:
        print(f"[BACKEND] ❌ ERROR in create_user: {e}")
        import traceback
        traceback.print_exc()
        return None, str(e), 500


def update_user(user_id: str, update_data: dict) -> Tuple[bool, str, int]:
    """
    Update a user.
    Returns (success, message, status_code)
    """
    try:
        print("\n" + "="*80)
        print(f"[BACKEND] update_user called for user_id: {user_id}")
        print("="*80)
        
        if not update_data:
            print("[BACKEND] ERROR: No update data provided")
            return False, "No update data provided", 400
        
        print(f"[BACKEND] Raw update_data received: {update_data}")
        
        # Convert field names
        update_data = convert_camel_to_snake(update_data)
        print(f"[BACKEND] After convert_camel_to_snake: {update_data}")

        # Convert email to lowercase if present
        if 'email' in update_data:
            update_data['email'] = update_data['email'].lower().strip()

        # Extract assignedStores before processing
        assigned_stores = update_data.pop('assigned_stores', update_data.pop('assignedStores', None))
        print(f"[BACKEND] Extracted assigned_stores: {assigned_stores}")
        print(f"[BACKEND] Type of assigned_stores: {type(assigned_stores)}")

        # Find user in local storage
        users = get_users_data()
        user_index = next((i for i, u in enumerate(users) if u.get('id') == user_id), -1)

        if user_index == -1:
            print(f"[BACKEND] ⚠️ User {user_id} not found in local JSON")

        # Extract conflict markers from client payload.
        base_version, base_updated_at = extract_base_markers(update_data)
        if base_updated_at is None and user_index != -1:
            # Fallback: local snapshot marker helps prevent blind overwrite.
            base_updated_at = users[user_index].get("updatedat")

        # Define allowed columns for users table
        allowed_columns = [
            'name', 'email', 'password', 'role', 'status',
            'sessionduration', 'updatedat', 'lastlogin',
            'lastlogout', 'totalsessionduration'
        ]
        
        filtered_update_data = {k: v for k, v in update_data.items() if k in allowed_columns}
        print(f"[BACKEND] Filtered update_data for Supabase: {filtered_update_data}")

        # Update in Supabase first with conflict check.
        client = db.client
        if filtered_update_data:
            print("[BACKEND] Updating user in Supabase...")
            try:
                update_result = safe_update_with_conflict_check(
                    client,
                    table_name="users",
                    id_column="id",
                    record_id=user_id,
                    update_payload=filtered_update_data,
                    updated_at_column="updatedat",
                    base_version=base_version,
                    base_updated_at=base_updated_at,
                )
                if not update_result["ok"]:
                    if update_result.get("conflict"):
                        return False, update_result.get("message", "Update conflict"), 409
                    return False, "Failed to update user in Supabase", 500
                print("[BACKEND] ✅ Updated user in Supabase")
            except Exception as supabase_error:
                logger.warning(
                    f"Supabase update failed for user {user_id}; applying local fallback: {supabase_error}"
                )
                # Offline fallback: keep local change and let manual sync retry later.
                if user_index != -1:
                    local_update_data = update_data.copy()
                    if assigned_stores is not None:
                        local_update_data['assignedstores'] = assigned_stores
                    local_update_data['updatedat'] = datetime.now().isoformat()
                    users[user_index].update(local_update_data)
                    save_users_data(users)
                return True, "User saved locally (offline fallback)", 202

        # Update local cache after successful Supabase write.
        if user_index != -1:
            local_update_data = update_data.copy()
            local_update_data['updatedat'] = datetime.now().isoformat()
            if assigned_stores is not None:
                local_update_data['assignedstores'] = assigned_stores
                print(f"[BACKEND] Updating local JSON with assignedstores: {assigned_stores}")
            users[user_index].update(local_update_data)
            save_users_data(users)
            print("[BACKEND] ✅ Updated local JSON")

        # Handle assigned stores if provided
        if assigned_stores is not None:
            print(f"[BACKEND] Processing store assignments for user {user_id}")
            print(f"[BACKEND] New assigned_stores: {assigned_stores}")

            # STEP 1: Delete ALL existing assignments
            try:
                print(f"[BACKEND] Deleting all existing userstores for user {user_id}")
                delete_response = client.table('userstores').delete().eq('userId', user_id).execute()
                print(f"[BACKEND] ✅ Deleted existing store assignments")
            except Exception as del_err:
                print(f"[BACKEND] ⚠️ Error deleting existing assignments: {del_err}")

            # STEP 2: Add new assignments
            if isinstance(assigned_stores, list):
                if len(assigned_stores) > 0:
                    print(f"[BACKEND] Adding {len(assigned_stores)} new store assignments")
                    for store_id in assigned_stores:
                        try:
                            print(f"[BACKEND] Assigning store {store_id} to user {user_id}")
                            insert_response = client.table('userstores').insert({
                                'userId': user_id,
                                'storeId': store_id
                            }).execute()
                            print(f"[BACKEND] ✅ Successfully assigned store {store_id}")
                        except Exception as store_err:
                            print(f"[BACKEND] ⚠️ Failed to assign store {store_id}: {store_err}")
                else:
                    print("[BACKEND] No stores to assign (empty list)")
            else:
                print(f"[BACKEND] ⚠️ assigned_stores is not a list: {type(assigned_stores)}")
        else:
            print("[BACKEND] No store changes (assigned_stores is None)")

        print(f"[BACKEND] ✅✅✅ User {user_id} updated successfully")
        print("="*80 + "\n")
        return True, "User updated", 200
        
    except Exception as e:
        print(f"[BACKEND] ❌ ERROR in update_user: {e}")
        import traceback
        traceback.print_exc()
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
        return None, str(e), 5
