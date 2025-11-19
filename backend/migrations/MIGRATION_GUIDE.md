# MySQL to Supabase Migration Guide (Using UV)

## Overview
This guide helps you migrate your existing MySQL billing system to Supabase PostgreSQL.

## Prerequisites
- ✅ Supabase project with schema already created
- ✅ UV package manager installed
- ✅ Access to existing MySQL database

## Step 1: Update Dependencies

Add Supabase to your `pyproject.toml`:

```toml
dependencies = [
    "supabase>=2.3.0",
    "postgrest-py>=0.13.0",
    "python-dotenv>=1.0.0",
    "mysql-connector-python>=8.0.0",
]
```

Install with UV:
```bash
cd backend
uv sync
```

## Step 2: Configure Environment

Add to your `.env`:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-service-role-key
```

## Step 3: Run Migration

```bash
cd backend
uv run python scripts/migrate_mysql_to_supabase.py
```

## Step 4: Update Your Application

Replace MySQL imports:
```python
# OLD
from db import DatabaseConnection

# NEW
from supabase_db import db

# Usage
products = db.get_products()
customers = db.get_customers()
bills = db.get_bills(store_id="store_123")
```

## API Quick Reference

### Products
- `db.get_products(store_id=None)` - Get all products
- `db.get_product(product_id)` - Get single product
- `db.create_product(data)` - Create product
- `db.update_product(id, data)` - Update product
- `db.get_product_by_barcode(barcode)` - Find by barcode

### Customers
- `db.get_customers()` - Get all customers
- `db.get_customer_by_phone(phone)` - Find by phone
- `db.create_customer(data)` - Create customer

### Bills
- `db.get_bills(store_id=None, limit=100)` - Get bills
- `db.create_bill(data)` - Create bill
- `db.create_bill_items_batch(items)` - Create bill items

### Users & Stores
- `db.get_user_stores(user_id)` - Get user's stores
- `db.add_user_store(user_id, store_id)` - Assign store

## Troubleshooting

### Migration fails with foreign key errors
- Ensure parent tables are migrated before child tables
- Check that referenced IDs exist

### Some records fail to insert
- Check `failed_{table}.json` files for problematic records
- Review data types and constraints

### Connection timeouts
- Use service_role key (not anon key)
- Check Supabase project is active

## Post-Migration Checklist

- [ ] All data migrated successfully
- [ ] Verification passed
- [ ] Application tested with new DB
- [ ] MySQL backup created
- [ ] Update deployment configs
