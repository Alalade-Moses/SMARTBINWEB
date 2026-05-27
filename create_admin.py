from app import create_app, db
from app.models import Admin

app = create_app()

with app.app_context():
    try:
        from sqlalchemy import text
        db.session.execute(text("ALTER TABLE tbl_admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'"))
        db.session.commit()
        print("Database patched: role column added to tbl_admin.")
    except Exception:
        db.session.rollback()

    # Check if admin already exists
    if Admin.query.filter_by(username='admin').first():
        print("Admin user already exists.")
    else:
        admin = Admin(username='admin', role='admin')
        admin.set_password('password123')
        db.session.add(admin)
        db.session.commit()
        print("Admin user created successfully.")

    # Check if driver already exists
    if Admin.query.filter_by(username='driver').first():
        print("Driver user already exists.")
    else:
        driver = Admin(username='driver', role='driver')
        driver.set_password('driver123')
        db.session.add(driver)
        db.session.commit()
        print("Driver user created successfully.")
