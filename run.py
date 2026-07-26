from app import create_app, db
from app.models import Admin
from app.simulation.iot_simulator import populate_initial_bins, populate_initial_trucks

app = create_app()

def seed_default_users():
    admin = Admin.query.filter_by(username='admin').first()
    if not admin:
        admin = Admin(username='admin', role='admin')
        admin.set_password('admin123')
        db.session.add(admin)
        print("Created Admin user (admin / admin123).")
    else:
        admin.role = 'admin'
        admin.set_password('admin123')
        db.session.add(admin)

    driver = Admin.query.filter_by(username='driver').first()
    if not driver:
        driver = Admin(username='driver', role='driver')
        driver.set_password('driver123')
        db.session.add(driver)
        print("Created Driver user (driver / driver123).")
    else:
        driver.role = 'driver'
        driver.set_password('driver123')
        db.session.add(driver)

    db.session.commit()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        try:
            from sqlalchemy import text
            db.session.execute(text("ALTER TABLE tbl_admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        print("Database tables checked/created.")
        seed_default_users()
        populate_initial_bins()
        populate_initial_trucks()

    print("Starting Flask app on http://127.0.0.1:5000...")
    app.run(
        debug=True,
        use_reloader=False
    )