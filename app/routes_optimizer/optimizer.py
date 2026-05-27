import numpy as np
import networkx as nx
from datetime import datetime, timedelta, timezone
import logging
import json

from app.database import db
from app.models import Bin, Route, RouteBin, Truck

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_ROUTE_LOOKAHEAD_HOURS = 1
DEFAULT_MIN_FILL_PERCENTAGE = 70


def _ensure_aware_utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def bin_needs_collection(bin_obj, now_utc, lookahead_hours=DEFAULT_ROUTE_LOOKAHEAD_HOURS, min_fill_percentage=DEFAULT_MIN_FILL_PERCENTAGE):
    if bin_obj.status == 'FULL':
        return True
    if bin_obj.status in ['EMPTY', 'MAINTENANCE']:
        return False
    if bin_obj.capacity_kg <= 0:
        return False

    fill_percentage = (bin_obj.current_fill_kg / bin_obj.capacity_kg) * 100
    if fill_percentage >= min_fill_percentage:
        return True

    
    if not bin_obj.predicted_full:
        return False
    now_utc = _ensure_aware_utc(now_utc)
    predicted_full = _ensure_aware_utc(bin_obj.predicted_full)
    return predicted_full <= now_utc + timedelta(hours=lookahead_hours)



def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371
    lat1r, lon1r = np.radians(lat1), np.radians(lon1)
    lat2r, lon2r = np.radians(lat2), np.radians(lon2)
    dlat, dlon = lat2r - lat1r, lon2r - lon1r
    a = np.sin(dlat/2)**2 + np.cos(lat1r) * np.cos(lat2r) * np.sin(dlon/2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))


# nearest-neighbor TSP 
def find_optimal_route(start_location, bin_list):
    if not bin_list:
        return [], 0.0
    current_location = start_location
    unvisited = set(bin_list)
    order = []
    total_dist = 0.0
    while unvisited:
        nearest, min_d = None, float('inf')
        for b in unvisited:
            d = calculate_distance(current_location[0], current_location[1], b.location_lat, b.location_lon)
            if d < min_d:
                min_d, nearest = d, b
        if not nearest:
            break
        order.append(nearest)
        unvisited.remove(nearest)
        total_dist += min_d
        current_location = (nearest.location_lat, nearest.location_lon)

    
    if order:
        last = (order[-1].location_lat, order[-1].location_lon)
        total_dist += calculate_distance(last[0], last[1], start_location[0], start_location[1])
    return order, total_dist



def generate_collection_route(app, depot_lat, depot_lon, area_name="Noida", lookahead_hours=DEFAULT_ROUTE_LOOKAHEAD_HOURS, min_fill_percentage=DEFAULT_MIN_FILL_PERCENTAGE):
    logger.info(f"[{datetime.now()}] Running route optimization for {area_name}...")
    try:
        with app.app_context():
            now_utc = datetime.now(timezone.utc)
            all_bins = Bin.query.filter_by(area_name=area_name).all()
            if not all_bins:
                logger.info(f"No bins found in {area_name}.")
                return None

            bins_to_collect = []
            for b in all_bins:
                if bin_needs_collection(b, now_utc, lookahead_hours, min_fill_percentage):
                    fp = (b.current_fill_kg / b.capacity_kg) * 100 if b.capacity_kg > 0 else 0
                    logger.info(f"Bin {b.bin_id} eligible: fill={fp:.1f}%, status={b.status}")
                    bins_to_collect.append(b)

            if not bins_to_collect:
                logger.info("No bins need collection right now.")
                return None

            optimal_order, total_dist = find_optimal_route((depot_lat, depot_lon), bins_to_collect)
            if not optimal_order:
                return None

            logger.info(f"Route: {len(optimal_order)} bins, {total_dist:.2f} km")

            
            available_truck = Truck.query.outerjoin(Route, (Truck.truck_id == Route.truck_id) & (Route.status == 'PENDING')) \
                                     .filter(Route.route_id == None).first()

            tid = available_truck.truck_id if available_truck else None
            if available_truck:
                logger.info(f"Assigning {available_truck.reg_number}")
            else:
                logger.warning("No trucks free — saving route unassigned.")

            new_route = Route(truck_id=tid, total_distance_km=total_dist, generated_at=datetime.now(timezone.utc), status='PENDING', area_name=area_name)
            db.session.add(new_route)
            db.session.flush() 

            for i, b in enumerate(optimal_order):
                db.session.add(RouteBin(route_id=new_route.route_id, bin_id=b.bin_id, sequence_order=i+1))

            db.session.commit()
            logger.info(f"Route {new_route.route_id} saved.")
            return new_route

    except Exception as e:
        logger.error(f"Route optimization error: {e}")
        db.session.rollback()
