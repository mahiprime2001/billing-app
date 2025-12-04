"""
Settings Service
Handles all settings-related business logic and database operations
"""
import json
import logging
from datetime import datetime
from typing import Dict, Optional, Tuple

from utils.supabase_db import db
from utils.json_helpers import get_settings_data, save_settings_data
from utils.json_utils import convert_camel_to_snake, convert_snake_to_camel

logger = logging.getLogger(__name__)


# ============================================
# LOCAL JSON OPERATIONS
# ============================================

def get_local_settings() -> Dict:
    """Get settings from local JSON storage"""
    try:
        settings = get_settings_data()
        transformed_settings = convert_snake_to_camel(settings)
        logger.debug(f"Returning settings from local JSON.")
        return transformed_settings
    except Exception as e:
        logger.error(f"Error getting local settings: {e}", exc_info=True)
        return {}


# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_settings() -> Dict:
    """Get settings directly from Supabase"""
    try:
        client = db.client
        response = client.table("systemsettings").select("*").limit(1).execute()
        
        if response.data and len(response.data) > 0:
            # Get the first (and likely only) row
            settings_row = response.data[0]
            converted = convert_snake_to_camel(settings_row)
            logger.debug(f"Returning settings from Supabase: {converted}")
            return converted
        else:
            logger.warning("No settings found in Supabase systemsettings table")
            return {}
    except Exception as e:
        logger.error(f"Error getting Supabase settings: {e}", exc_info=True)
        return {}


# ============================================
# MERGED OPERATIONS
# ============================================

def get_merged_settings() -> Tuple[Dict, int]:
    """
    Get settings by merging local and Supabase (Supabase takes precedence).
    Returns (settings_dict, status_code)
    """
    try:
        # Fetch from local JSON (fallback)
        local_settings = get_local_settings()
        
        # Fetch from Supabase (preferred source)
        supabase_settings = get_supabase_settings()
        
        # Extract systemSettings from local (which has nested structure)
        local_system = local_settings.get('systemSettings', {})
        local_bill_formats = local_settings.get('billFormats', {})
        local_store_formats = local_settings.get('storeFormats', {})
        
        # Merge: Start with local, overlay with Supabase
        system_settings = {}
        system_settings.update(local_system)
        system_settings.update(supabase_settings)  # Supabase takes precedence
        
        # Extract bill_formats and store_formats from Supabase if they exist
        # (assuming they're stored as JSON text columns)
        bill_formats = local_bill_formats.copy()
        store_formats = local_store_formats.copy()
        
        if 'billFormats' in supabase_settings:
            try:
                bf = supabase_settings['billFormats']
                if isinstance(bf, str):
                    bf = json.loads(bf)
                bill_formats.update(bf)
            except (json.JSONDecodeError, TypeError):
                pass
        
        if 'storeFormats' in supabase_settings:
            try:
                sf = supabase_settings['storeFormats']
                if isinstance(sf, str):
                    sf = json.loads(sf)
                store_formats.update(sf)
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Combine all into a single response structure expected by frontend
        final_response = {
            "systemSettings": system_settings,
            "billFormats": bill_formats,
            "storeFormats": store_formats
        }
        
        logger.debug(f"Returning merged settings: {final_response}")
        return final_response, 200
        
    except Exception as e:
        logger.error(f"Error getting merged settings: {e}", exc_info=True)
        return {
            "systemSettings": {},
            "billFormats": {},
            "storeFormats": {}
        }, 500


# ============================================
# BUSINESS LOGIC
# ============================================

def update_settings(settings_data: dict) -> Tuple[bool, str, int]:
    """
    Update settings.
    Returns (success, message, status_code)
    """
    try:
        if not settings_data:
            return False, "No settings data provided", 400

        system_settings_from_frontend = settings_data.get('systemSettings', {})
        bill_formats_from_frontend = settings_data.get('billFormats', {})
        store_formats_from_frontend = settings_data.get('storeFormats', {})

        # Convert system settings keys to snake_case for database
        converted_system_settings = convert_camel_to_snake(system_settings_from_frontend)
        
        # Ensure updatedat is set for system settings
        converted_system_settings['updatedat'] = datetime.now().isoformat()
        
        # Prepare data for local JSON storage
        local_json_data = {
            "systemSettings": converted_system_settings,
            "billFormats": bill_formats_from_frontend, # These are already in correct format for JSON
            "storeFormats": store_formats_from_frontend  # These are already in correct format for JSON
        }
        
        # Save to local JSON
        # get_settings_data() will return the full structure {"systemSettings": {}, "billFormats": {}, ...}
        # We replace the whole content to ensure consistency.
        save_settings_data(local_json_data)

        # Update in Supabase (only system settings are stored in systemsettings table as individual columns)
        client = db.client
        
        # The systemsettings table is expected to have only one row (id=1)
        # We update individual fields from converted_system_settings
        
        # Remove 'id' if it exists, as it's used in .eq() and shouldn't be updated as a field
        update_fields = converted_system_settings.copy()
        record_id = update_fields.pop('id', None) # Get ID if present, remove from update fields

        if record_id:
            try:
                # Attempt to update the existing row with ID 1
                result = client.table('systemsettings').update(update_fields).eq('id', record_id).execute()
                if not result.data:
                    logger.warning(f"No existing settings row with id {record_id} found in Supabase to update. Attempting insert.")
                    # Fallback to insert if update finds no row, although unlikely for ID 1
                    insert_data = {**converted_system_settings, 'id': record_id, 'createdat': datetime.now().isoformat()}
                    client.table('systemsettings').insert(insert_data).execute()
            except Exception as e:
                logger.error(f"Error updating systemsettings in Supabase for id {record_id}: {e}", exc_info=True)
                return False, f"Error updating system settings: {e}", 500
        else:
            logger.warning("No ID found in system settings data for Supabase update. Ensure settings have an 'id' field.")
            # If no ID is provided, and we expect only one row with ID 1, we try to update/insert ID 1
            record_id = 1 # Default to ID 1 for system settings if not provided
            update_fields_with_id = {**update_fields, 'id': record_id}
            try:
                 result = client.table('systemsettings').update(update_fields).eq('id', record_id).execute()
                 if not result.data:
                    # If update finds no row, insert
                    insert_data = {**converted_system_settings, 'id': record_id, 'createdat': datetime.now().isoformat()}
                    client.table('systemsettings').insert(insert_data).execute()
            except Exception as e:
                 logger.error(f"Error updating/inserting systemsettings in Supabase for default id {record_id}: {e}", exc_info=True)
                 return False, f"Error updating system settings: {e}", 500

        logger.info(f"Settings updated")
        return True, "Settings updated", 200
        
    except Exception as e:
        logger.error(f"Error updating settings: {e}", exc_info=True)
        return False, str(e), 500


def get_setting(key: str) -> Tuple[Optional[any], int]:
    """
    Get a specific setting by key.
    Returns (value, status_code)
    """
    try:
        settings = get_settings_data()
        value = settings.get(key)
        
        if value is None:
            return None, 404
        
        return value, 200
        
    except Exception as e:
        logger.error(f"Error getting setting {key}: {e}", exc_info=True)
        return None, 500
