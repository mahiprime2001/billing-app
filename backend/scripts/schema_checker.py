import os
import sys
import json
import logging
from typing import Dict, List, Any

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)

# Determine the base directory for resource loading
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = os.path.dirname(sys._MEIPASS)  # type: ignore
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.utils.db import DatabaseConnection

class SchemaChecker:
    def __init__(self):
        pass

    def get_db_schema(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Connects to the database and retrieves the schema (tables and their columns).
        """
        schema = {}
        try:
            with DatabaseConnection.get_connection_ctx() as conn:
                cursor = conn.cursor(dictionary=True)

                # Get all table names
                cursor.execute("SHOW TABLES")
                tables = [row[f"Tables_in_{conn.database}"] for row in cursor.fetchall()]
                
                logger.info(f"Tables found in database '{conn.database}': {tables}")
                
                for table_name in tables:
                    # Get column details for each table
                    cursor.execute(f"DESCRIBE `{table_name}`")
                    columns = cursor.fetchall()
                    schema[table_name] = columns
            logger.info("Successfully retrieved database schema.")
            return schema
        except Exception as e:
            logger.error(f"Error retrieving database schema: {e}", exc_info=True)
            return {}

    def save_schema_to_file(self, schema: Dict[str, List[Dict[str, Any]]], file_path: str) -> None:
        """
        Saves the retrieved schema to a JSON file.
        """
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(schema, f, indent=2, ensure_ascii=False)
            logger.info(f"Database schema saved to {file_path}")
        except Exception as e:
            logger.error(f"Error saving schema to file {file_path}: {e}", exc_info=True)

    def load_expected_schema(self, file_path: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Loads an expected schema from a JSON file.
        """
        if not os.path.exists(file_path):
            logger.warning(f"Expected schema file not found at {file_path}")
            return {}
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading expected schema from {file_path}: {e}", exc_info=True)
            return {}

    def check_schema_consistency(self, current_schema: Dict[str, List[Dict[str, Any]]], expected_schema: Dict[str, List[Dict[str, Any]]]) -> List[str]:
        """
        Compares the current database schema against an expected schema and returns inconsistencies.
        """
        inconsistencies = []

        # Check for missing/extra tables
        current_tables = set(current_schema.keys())
        expected_tables = set(expected_schema.keys())

        missing_tables = expected_tables - current_tables
        extra_tables = current_tables - expected_tables

        for table in missing_tables:
            inconsistencies.append(f"Missing table: {table}")
        for table in extra_tables:
            inconsistencies.append(f"Extra table: {table}")

        # Check consistency for common tables
        for table_name in current_tables.intersection(expected_tables):
            current_cols = {col['Field']: col for col in current_schema[table_name]}
            expected_cols = {col['Field']: col for col in expected_schema[table_name]}

            # Check for missing/extra columns
            missing_cols = set(expected_cols.keys()) - set(current_cols.keys())
            extra_cols = set(current_cols.keys()) - set(expected_cols.keys())

            for col in missing_cols:
                inconsistencies.append(f"Table '{table_name}': Missing column '{col}'")
            for col in extra_cols:
                inconsistencies.append(f"Table '{table_name}': Extra column '{col}'")

            # Check column properties for common columns
            for col_name in set(current_cols.keys()).intersection(set(expected_cols.keys())):
                current_col_props = current_cols[col_name]
                expected_col_props = expected_cols[col_name]

                for prop in ['Type', 'Null', 'Key', 'Default', 'Extra']:
                    if prop in expected_col_props and current_col_props.get(prop) != expected_col_props[prop]:
                        inconsistencies.append(
                            f"Table '{table_name}', Column '{col_name}': Property '{prop}' mismatch. "
                            f"Expected '{expected_col_props[prop]}', Got '{current_col_props.get(prop)}'"
                        )
        
        if not inconsistencies:
            logger.info("Database schema is consistent with the expected schema.")
        else:
            logger.warning("Database schema inconsistencies found.")

        return inconsistencies

if __name__ == "__main__":
    checker = SchemaChecker()
    
    # Define paths for current and expected schema files
    schema_dir = os.path.join(PROJECT_ROOT, 'backend', 'data', 'json')
    current_schema_path = os.path.join(schema_dir, 'current_db_schema.json')
    expected_schema_path = os.path.join(schema_dir, 'expected_db_schema.json')

    # Step 1: Get current schema
    current_schema = checker.get_db_schema()
    checker.save_schema_to_file(current_schema, current_schema_path)

    # Step 2: Load expected schema (if it exists)
    expected_schema = checker.load_expected_schema(expected_schema_path)

    if expected_schema:
        # Step 3: Check consistency
        inconsistencies = checker.check_schema_consistency(current_schema, expected_schema)
        if inconsistencies:
            logger.warning("Schema inconsistencies detected:")
            for inconsistency in inconsistencies:
                logger.warning(f"- {inconsistency}")
        else:
            logger.info("Schema is consistent.")
    else:
        logger.info("No expected schema found. Current schema saved. Please create an 'expected_db_schema.json' for future checks.")
