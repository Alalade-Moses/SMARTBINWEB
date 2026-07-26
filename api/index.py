import sys
import os

# Add parent directory to sys.path so app modules are importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run import app, seed_default_users
from app.database import db
from app.models import Bin
from app.simulation.iot_simulator import populate_initial_bins, populate_initial_trucks

# Ensure Vercel serverless environment initializes database tables & seed data
with app.app_context():
    try:
        db.create_all()
        try:
            from sqlalchemy import text
            db.session.execute(text("ALTER TABLE tbl_admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        seed_default_users()
        if not Bin.query.first():
            populate_initial_bins()
            populate_initial_trucks()
    except Exception as e:
        print(f"Vercel DB Init Warning: {e}")

if __name__ == '__main__':
    app.run()
