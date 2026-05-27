from app import create_app, db
from app.simulation.iot_simulator import populate_initial_bins, populate_initial_trucks

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        try:
            from sqlalchemy import text
            db.session.execute(text("ALTER TABLE tbl_admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin'"))
            db.session.commit()
            print("Database patched: role column added to tbl_admin.")
        except Exception:
            db.session.rollback()
        print("Database tables checked/created.")
        populate_initial_bins()
        populate_initial_trucks()

    print("Starting Flask app...")
    app.run(
        debug=True,
        use_reloader=False
    )