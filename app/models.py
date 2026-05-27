from app.database import db
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash

class Admin(db.Model):
    __tablename__ = 'tbl_admin'

    admin_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='admin')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<Admin {self.username}>'


class Bin(db.Model):
    __tablename__ = 'tbl_bins'

    bin_id = db.Column(db.Integer, primary_key=True)
    location_lat = db.Column(db.Float, nullable=False)
    location_lon = db.Column(db.Float, nullable=False)
    capacity_kg = db.Column(db.Float, nullable=False)
    current_fill_kg = db.Column(db.Float, nullable=False, default=0.0)
    status = db.Column(db.String(20), nullable=False, default='FILLING')  # EMPTY / FILLING / FULL / MAINTENANCE
    area_name = db.Column(db.String(50), nullable=False, default='Noida')
    predicted_full = db.Column(db.DateTime(timezone=True), nullable=True)  # null = not enough data yet

    history = db.relationship('BinHistory', back_populates='bin', lazy='dynamic', cascade="all, delete-orphan")
    routes = db.relationship('RouteBin', back_populates='bin', lazy='dynamic', cascade="all, delete-orphan")

    def __repr__(self):
        return f'<Bin {self.bin_id} - {self.status}>'


class BinHistory(db.Model):
    __tablename__ = 'tbl_bin_history'

    history_id = db.Column(db.Integer, primary_key=True)
    bin_id = db.Column(db.Integer, db.ForeignKey('tbl_bins.bin_id'), nullable=False)
    read_time = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    fill_level_kg = db.Column(db.Float, nullable=False)

    bin = db.relationship('Bin', back_populates='history')

    def __repr__(self):
        return f'<BinHistory bin={self.bin_id} at {self.read_time}>'


class Truck(db.Model):
    __tablename__ = 'tbl_trucks'

    truck_id = db.Column(db.Integer, primary_key=True)
    reg_number = db.Column(db.String(20), unique=True, nullable=False)

    routes = db.relationship('Route', back_populates='truck', lazy='dynamic')

    def __repr__(self):
        return f'<Truck {self.reg_number}>'


class Route(db.Model):
    __tablename__ = 'tbl_routes'

    route_id = db.Column(db.Integer, primary_key=True)
    truck_id = db.Column(db.Integer, db.ForeignKey('tbl_trucks.truck_id'), nullable=True)
    generated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)  # set when last stop is done
    total_distance_km = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='PENDING')  # PENDING / COMPLETED
    area_name = db.Column(db.String(50), nullable=False, default='Noida')

    truck = db.relationship('Truck', back_populates='routes')
    stops = db.relationship('RouteBin', back_populates='route', lazy='dynamic', cascade="all, delete-orphan",
                            order_by='RouteBin.sequence_order')

    def __repr__(self):
        return f'<Route {self.route_id} - {self.status}>'


class RouteBin(db.Model):
    __tablename__ = 'tbl_route_bins'

    route_bin_id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey('tbl_routes.route_id'), nullable=False)
    bin_id = db.Column(db.Integer, db.ForeignKey('tbl_bins.bin_id'), nullable=False)
    sequence_order = db.Column(db.Integer, nullable=False)
    # PENDING / COLLECTED / SKIPPED (maintenance) / COLLECTED_SKIP (skipped but emptied later)
    status = db.Column(db.String(20), nullable=False, default='PENDING')

    route = db.relationship('Route', back_populates='stops')
    bin = db.relationship('Bin', back_populates='routes')

    def __repr__(self):
        return f'<RouteBin stop {self.sequence_order} on route {self.route_id} for bin {self.bin_id}>'


# aggregated daily stats for the 7-day sustainability chart
class DailyStats(db.Model):
    __tablename__ = 'tbl_daily_stats'

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    area_name = db.Column(db.String(50), nullable=False)
    waste_collected_kg = db.Column(db.Float, default=0.0)
    fuel_saved_L = db.Column(db.Float, default=0.0)
    co2_reduced_kg = db.Column(db.Float, default=0.0)

    def to_dict(self):
        return {
            'date': self.date.isoformat(),
            'area_name': self.area_name,
            'waste_collected_kg': self.waste_collected_kg,
            'fuel_saved_L': self.fuel_saved_L,
            'co2_reduced_kg': self.co2_reduced_kg
        }
