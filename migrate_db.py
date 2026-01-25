import sqlite3
import os

DB_FILE = "roof_estimator.db"

def migrate():
    if not os.path.exists(DB_FILE):
        print("Database file not found. Skipping migration (init_db will handle it).")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    columns_to_add = [
        ("report_type", "TEXT DEFAULT 'PREMIUM'"),
        ("last_checked_at", "DATETIME"),
        ("raw_eagleview_json", "TEXT")
    ]
    
    print(f"Migrating {DB_FILE}...")
    
    for col_name, col_def in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE roof_orders ADD COLUMN {col_name} {col_def}")
            print(f"✅ Added column: {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"ℹ️  Column {col_name} already exists.")
            else:
                print(f"❌ Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
