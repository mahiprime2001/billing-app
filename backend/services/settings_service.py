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
# CUSTOM CONVERSION FOR SYSTEMSETTINGS TABLE
# ============================================

def convert_to_db_format(frontend_data: dict) -> dict:
    """
    Convert frontend camelCase to database format.
    Most fields: lowercase (no underscores)
    Timestamps: snake_case (with underscores)
    """
    converted = {}
    
    # Special handling for timestamp fields
    timestamp_fields = {
        'createdat': 'created_at',
        'updatedat': 'updated_at',
        'lastsynctime': 'lastsynctime',  # Keep as-is if it exists
        'lastsyncid': 'lastsyncid'  # Keep as-is if it exists
    }
    
    for key, value in frontend_data.items():
        lowercase_key = key.lower()
        
        # Check if it's a timestamp field that needs underscore
        if lowercase_key in timestamp_fields:
            converted[timestamp_fields[lowercase_key]] = value
        else:
            # Regular fields: just lowercase
            converted[lowercase_key] = value
    
    return converted

def convert_from_db_format(db_data: dict) -> dict:
    """
    Convert database format to frontend camelCase.
    Handles mixed naming (lowercase + snake_case timestamps)
    """
    converted = {}
    
    # Map database fields to camelCase
    field_mapping = {
        'created_at': 'createdAt',
        'updated_at': 'updatedAt',
        # Other fields stay as-is since they're already lowercase
    }
    
    for key, value in db_data.items():
        # Use mapping if exists, otherwise keep as-is
        converted_key = field_mapping.get(key, key)
        converted[converted_key] = value
    
    return converted

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
            settings_row = response.data[0]
            converted = convert_from_db_format(settings_row)
            
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
        
        # Convert system settings to database format
        converted_system_settings = convert_to_db_format(system_settings_from_frontend)
        
        # Set updated_at timestamp (with underscore for DB)
        converted_system_settings['updated_at'] = datetime.now().isoformat()
        
        # Prepare data for local JSON storage (keep in converted format)
        local_json_data = {
            "systemSettings": converted_system_settings,
            "billFormats": bill_formats_from_frontend,
            "storeFormats": store_formats_from_frontend
        }
        
        # Save to local JSON
        save_settings_data(local_json_data)
        
        # Update in Supabase
        client = db.client
        
        # Remove 'id' from update fields (it's used in .eq() clause)
        update_fields = converted_system_settings.copy()
        record_id = update_fields.pop('id', None)
        
        # Don't update created_at
        update_fields.pop('created_at', None)
        
        if record_id:
            try:
                # Attempt to update the existing row
                result = client.table('systemsettings').update(update_fields).eq('id', record_id).execute()
                
                if not result.data:
                    logger.warning(f"No existing settings row with id {record_id} found in Supabase to update. Attempting insert.")
                    # Fallback to insert if update finds no row
                    insert_data = {**update_fields, 'id': record_id}
                    client.table('systemsettings').insert(insert_data).execute()
                    
            except Exception as e:
                logger.error(f"Error updating systemsettings in Supabase for id {record_id}: {e}", exc_info=True)
                return False, f"Error updating system settings: {e}", 500
        else:
            logger.warning("No ID found in system settings data for Supabase update. Defaulting to ID 1.")
            # Default to ID 1 for system settings if not provided
            record_id = 1
            
            try:
                result = client.table('systemsettings').update(update_fields).eq('id', record_id).execute()
                
                if not result.data:
                    # If update finds no row, insert
                    insert_data = {**update_fields, 'id': record_id}
                    client.table('systemsettings').insert(insert_data).execute()
                    
            except Exception as e:
                logger.error(f"Error updating/inserting systemsettings in Supabase for default id {record_id}: {e}", exc_info=True)
                return False, f"Error updating system settings: {e}", 500
        
        logger.info(f"Settings updated successfully")
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
