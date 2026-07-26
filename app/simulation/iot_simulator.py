import random
from app.database import db
from app.models import Bin, BinHistory, Truck
from datetime import datetime, timezone

FILL_PROFILES = {
    'low':    (0.0, 0.8),
    'medium': (0.3, 1.4),
    'high':   (0.8, 2.2),
}


def get_bin_fill_profile(bin_id):
    idx = bin_id % 3
    return ['low', 'medium', 'high'][idx]


def generate_waste_for_bin(bin_obj):
    profile = get_bin_fill_profile(bin_obj.bin_id)
    lo, hi = FILL_PROFILES[profile]
    return round(random.uniform(lo, hi), 2)


def calculate_next_fill_level(bin_obj, waste_added):
    return min(bin_obj.capacity_kg, round(bin_obj.current_fill_kg + waste_added, 2))


def populate_initial_bins():
    if Bin.query.count() == 0:
        print("No bins found. Seeding database...")

        areas = {
            "Lagos (Ikeja)":            (6.6018, 3.3515),
            "Lagos (Lekki)":            (6.4698, 3.5852),
            "Lagos (Victoria Island)":  (6.4281, 3.4219),
            "Noida":                    (28.5448, 77.3721),
            "Delhi":                    (28.6139, 77.2090),
            "Gurugram":                 (28.4595, 77.0266)
        }

        for area, (base_lat, base_lon) in areas.items():
            print(f"Creating 5 bins in {area}...")
            for i in range(5):
                db.session.add(Bin(
                    location_lat=base_lat + random.uniform(-0.01, 0.01),
                    location_lon=base_lon + random.uniform(-0.01, 0.01),
                    capacity_kg=200.0,
                    current_fill_kg=random.randint(0, 20),
                    status='FILLING',
                    area_name=area
                ))

        db.session.commit()
        print("Initial bins created across 4 areas including Lagos.")
    else:
        print("Database already contains bins.")


def simulate_waste_generation(app):
    print(f"[{datetime.now()}] Running simulation...")
    try:
        with app.app_context():
            bins = Bin.query.all()
            if not bins:
                print("No bins to simulate.")
                return

            for bin_obj in bins:
                if bin_obj.status in ['FULL', 'MAINTENANCE']:
                    continue

                waste_added = generate_waste_for_bin(bin_obj)
                new_fill = calculate_next_fill_level(bin_obj, waste_added)

                if new_fill >= bin_obj.capacity_kg:
                    bin_obj.current_fill_kg = bin_obj.capacity_kg
                    bin_obj.status = 'FULL'
                    print(f"Bin {bin_obj.bin_id} is now FULL.")
                else:
                    bin_obj.current_fill_kg = round(new_fill, 2)
                    bin_obj.status = 'FILLING'

                db.session.add(BinHistory(
                    bin_id=bin_obj.bin_id,
                    fill_level_kg=bin_obj.current_fill_kg,
                    read_time=datetime.now(timezone.utc)
                ))

            db.session.commit()
            print("Simulation run complete. Bins updated.")

    except Exception as e:
        print(f"Error in simulation: {e}")
        db.session.rollback()


def populate_initial_trucks():
    if Truck.query.count() == 0:
        print("Seeding 3 trucks...")
        db.session.add_all([Truck(reg_number=f"TRUCK-00{i}") for i in range(1, 4)])
        db.session.commit()
        print("Trucks created.")
    else:
        print("Database already contains trucks.")
