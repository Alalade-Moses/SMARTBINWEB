from app import create_app, db
from app.models import Admin

app = create_app()

with app.app_context():
    db.create_all()
    try:
        from sqlalchemy import text
        db.session.execute(text("ALTER TABLE tbl_admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'"))
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Check / set admin user (admin / admin123)
    admin = Admin.query.filter_by(username='admin').first()
    if not admin:
        admin = Admin(username='admin', role='admin')
        admin.set_password('admin123')
        db.session.add(admin)
        print("Admin user created successfully (username: admin, password: admin123).")
    else:
        admin.role = 'admin'
        admin.set_password('admin123')
        db.session.add(admin)
        print("Admin user updated successfully (username: admin, password: admin123).")

    # Check / set driver user (driver / driver123)
    driver = Admin.query.filter_by(username='driver').first()
    if not driver:
        driver = Admin(username='driver', role='driver')
        driver.set_password('driver123')
        db.session.add(driver)
        print("Driver user created successfully (username: driver, password: driver123).")
    else:
        driver.role = 'driver'
        driver.set_password('driver123')
        db.session.add(driver)
        print("Driver user updated successfully (username: driver, password: driver123).")

    db.session.commit()
