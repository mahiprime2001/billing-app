import os
import sys
import json
from datetime import datetime, timedelta, timezone

# Add PROJECT_ROOT to sys.path for module imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import DatabaseConnection

def check_bills_data():
    try:
        with DatabaseConnection.get_connection_ctx() as conn:
            with DatabaseConnection.get_cursor_ctx(conn, dictionary=True) as cursor:
                cursor.execute("SELECT * FROM Bills LIMIT 5")
                bills = cursor.fetchall()
                if bills:
                    print(f"Found {len(bills)} bills in the database. Here are the first 5:")
                    for bill in bills:
                        print(json.dumps(bill, indent=2, default=str))
                else:
                    print("No bills found in the database.")
    except Exception as e:
        print(f"Error checking bills data: {e}")

if __name__ == "__main__":
    check_bills_data()
