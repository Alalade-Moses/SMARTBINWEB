
from flask import Blueprint, jsonify, request
from app.models import Bin, Route, RouteBin, BinHistory, Truck, Admin, DailyStats
from app.database import db
from flask_jwt_extended import create_access_token, jwt_required
from datetime import datetime, timezone, timedelta
import logging
logger = logging.getLogger(__name__)


api_bp = Blueprint('api', __name__)

@api_bp.route('/login', methods=['POST'])
def login():
    username = request.json.get('username', None)
    password = request.json.get('password', None)

    admin = Admin.query.filter_by(username=username).first()
    if admin and admin.check_password(password):
        access_token = create_access_token(identity=username)
        return jsonify(access_token=access_token, role=admin.role)

    return jsonify({"msg": "Bad username or password"}), 401



@api_bp.route('/bins', methods=['GET'])
@jwt_required()
def get_bins():
    
    bins = Bin.query.all()
    bin_list = []
    for bin_obj in bins:
        last_collected = BinHistory.query.filter_by(bin_id=bin_obj.bin_id, fill_level_kg=0.0) \
                                       .order_by(BinHistory.read_time.desc()) \
                                       .first()

        bin_list.append({
            'id': bin_obj.bin_id,
            'lat': float(bin_obj.location_lat),
            'lon': float(bin_obj.location_lon),
            'capacity_kg': float(bin_obj.capacity_kg),
            'current_fill_kg': float(bin_obj.current_fill_kg),
            'status': bin_obj.status,
            'area_name': bin_obj.area_name,
            'predicted_full': bin_obj.predicted_full.strftime('%Y-%m-%dT%H:%M:%S+00:00') if bin_obj.predicted_full else None,
            'last_collected': last_collected.read_time.strftime('%Y-%m-%dT%H:%M:%S+00:00') if last_collected else None
        })
    return jsonify(bin_list)


@api_bp.route('/areas', methods=['GET'])
@jwt_required()
def get_areas():
    
    areas = db.session.query(Bin.area_name).distinct().all()
    area_list = [area[0] for area in areas]
    return jsonify(area_list)


@api_bp.route('/bins/<int:bin_id>/empty', methods=['POST'])
@jwt_required()
def empty_bin(bin_id):
    bin_to_empty = Bin.query.filter_by(bin_id=bin_id).first()

    if not bin_to_empty:
        return jsonify({"message": "Bin not found."}), 404

    try:
        bin_to_empty.current_fill_kg = 0.0
        bin_to_empty.status = 'EMPTY'
        bin_to_empty.predicted_full = None

        stops = RouteBin.query.filter_by(bin_id=bin_id).all()
        for stop in stops:
            if stop.status in ['PENDING', 'SKIPPED']:
                stop.status = 'COLLECTED' if stop.status == 'PENDING' else 'COLLECTED_SKIP'
                db.session.add(stop)
                if stop.route:
                    all_finished = all(s.status in ['COLLECTED', 'SKIPPED', 'COLLECTED_SKIP'] for s in stop.route.stops)
                    if all_finished:
                        stop.route.status = 'COMPLETED'
                        stop.route.completed_at = datetime.now(timezone.utc)

        history_entry = BinHistory(
            bin_id=bin_to_empty.bin_id,
            fill_level_kg=0.0,
            read_time=datetime.now(timezone.utc)
        )

        db.session.add(bin_to_empty)
        db.session.add(history_entry)
        db.session.commit()

        logger.info(f"Bin {bin_id} marked as EMPTY by API call.")

        return jsonify({
            'id': bin_to_empty.bin_id,
            'status': bin_to_empty.status,
            'current_fill_kg': bin_to_empty.current_fill_kg
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error emptying bin {bin_id}: {e}")
        return jsonify({"message": f"Error updating bin: {str(e)}"}), 500


@api_bp.route('/bins/<int:bin_id>/history', methods=['GET'])
@jwt_required()
def get_bin_history(bin_id):
    """
    Returns recent fill-level history for one bin, ordered oldest-to-newest.
    """
    bin_obj = Bin.query.get(bin_id)
    if not bin_obj:
        return jsonify({"message": "Bin not found."}), 404

    try:
        limit = int(request.args.get('limit', 20))
    except ValueError:
        limit = 20
    limit = max(1, min(limit, 100))

    history_rows = BinHistory.query.filter_by(bin_id=bin_id) \
                                   .order_by(BinHistory.read_time.desc()) \
                                   .limit(limit) \
                                   .all()
    history_rows.reverse()

    return jsonify([
        {
            "read_time": row.read_time.strftime('%Y-%m-%dT%H:%M:%S+00:00'),
            "fill_level_kg": float(row.fill_level_kg)
        }
        for row in history_rows
    ])


@api_bp.route('/bins/<int:bin_id>/status', methods=['POST'])
@jwt_required()
def update_bin_status(bin_id):
    """
    Updates maintenance status for a bin.
    """
    bin_obj = Bin.query.get(bin_id)
    if not bin_obj:
        return jsonify({"message": "Bin not found."}), 404

    requested_status = (request.get_json(silent=True) or {}).get('status')
    if requested_status not in ['MAINTENANCE', 'FILLING']:
        return jsonify({"message": "Status must be MAINTENANCE or FILLING."}), 400

    try:
        if requested_status == 'MAINTENANCE':
            bin_obj.status = 'MAINTENANCE'
            bin_obj.predicted_full = None

            
            pending_stops = RouteBin.query.filter_by(bin_id=bin_id, status='PENDING').all()
            for stop in pending_stops:
                stop.status = 'SKIPPED'
                logger.info(f"Route stop for Bin {bin_id} on Route {stop.route_id} marked as SKIPPED due to maintenance.")

                
                route = stop.route
                if all(s.status in ['COLLECTED', 'SKIPPED', 'COLLECTED_SKIP'] for s in route.stops):
                    route.status = 'COMPLETED'
                    route.completed_at = datetime.now(timezone.utc)
                    logger.info(f"Route {route.route_id} marked as COMPLETED after maintenance skip.")
        else:
            bin_obj.status = 'FULL' if bin_obj.current_fill_kg >= bin_obj.capacity_kg else 'FILLING'
            bin_obj.predicted_full = None

        db.session.add(bin_obj)
        db.session.commit()

        return jsonify({
            'id': bin_obj.bin_id,
            'status': bin_obj.status,
            'current_fill_kg': float(bin_obj.current_fill_kg)
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating bin {bin_id} status: {e}")
        return jsonify({"message": "Error updating bin status."}), 500


@api_bp.route('/stats/summary', methods=['GET'])
@jwt_required()
def get_stats_summary():
    
    areas = db.session.query(Bin.area_name).distinct().all()
    stats = []

    for area in areas:
        area_name = area[0]
        total_bins = Bin.query.filter_by(area_name=area_name).count()
        avg_fill = db.session.query(db.func.avg(Bin.current_fill_kg)) \
                            .filter(Bin.area_name == area_name).scalar() or 0.0
        urgent_count = Bin.query.filter(
            (Bin.area_name == area_name) &
            ((Bin.status == 'FULL') | (Bin.current_fill_kg / Bin.capacity_kg >= 0.7))
        ).count()

        stats.append({
            "area": area_name,
            "total_bins": total_bins,
            "avg_fill": round(float(avg_fill), 2),
            "urgent": urgent_count
        })

    return jsonify(stats)




@api_bp.route('/routes/latest', methods=['GET'])
@jwt_required()
def get_latest_route():
    
    area_name = request.args.get('area', 'Noida')

    latest_route = Route.query.filter_by(status='PENDING', area_name=area_name) \
                              .order_by(Route.generated_at.desc()) \
                              .first()

    if not latest_route:
        latest_route = Route.query.filter_by(status='COMPLETED', area_name=area_name) \
                                  .order_by(Route.generated_at.desc()) \
                                  .first()

    if not latest_route:
        return jsonify({"message": "No routes found for this area."}), 404

    stops = RouteBin.query.filter_by(route_id=latest_route.route_id) \
                           .order_by(RouteBin.sequence_order.asc()) \
                           .all()
    route_stops_list = []
    for stop in stops:
        route_stops_list.append({
            'sequence_order': stop.sequence_order,
            'bin_id': stop.bin_id,
            'lat': float(stop.bin.location_lat), 
            'lon': float(stop.bin.location_lon),
            'status': stop.status
        })

    
    truck_reg_number = None
    if latest_route.truck_id:
        truck = Truck.query.get(latest_route.truck_id)
        if truck:
            truck_reg_number = truck.reg_number

    
    route_data = {
        'route_id': latest_route.route_id,
        'generated_at': latest_route.generated_at.strftime('%Y-%m-%dT%H:%M:%S+00:00'),
        'completed_at': latest_route.completed_at.strftime('%Y-%m-%dT%H:%M:%S+00:00') if latest_route.completed_at else None,
        'total_distance_km': float(latest_route.total_distance_km),
        'status': latest_route.status,
        'stops': route_stops_list,
        'truck_id': latest_route.truck_id,
        'truck_reg_number': truck_reg_number 
    }

    return jsonify(route_data)




@api_bp.route('/trucks/status', methods=['GET'])
@jwt_required()
def get_truck_status():
    
    trucks = Truck.query.order_by(Truck.reg_number.asc()).all()
    truck_statuses = []

    
    now_utc = datetime.now(timezone.utc)
    ist_now = now_utc + timedelta(hours=5, minutes=30)
    ist_today = ist_now.date()

    
    ist_day_start_utc = datetime.combine(ist_today, datetime.min.time()) - timedelta(hours=5, minutes=30)
    ist_day_end_utc = ist_day_start_utc + timedelta(days=1)
    for truck in trucks:
        assigned_route = Route.query.filter_by(truck_id=truck.truck_id, status='PENDING') \
                                    .order_by(Route.generated_at.desc()) \
                                    .first()

        
        completed_today = Route.query.filter(
            Route.truck_id == truck.truck_id,
            Route.status == 'COMPLETED',
            Route.generated_at >= ist_day_start_utc,
            Route.generated_at < ist_day_end_utc
        ).all()
        distance_today = sum(r.total_distance_km for r in completed_today if r.total_distance_km)

        truck_statuses.append({
            "truck_id": truck.truck_id,
            "reg_number": truck.reg_number,
            "status": "Assigned" if assigned_route else "Available",
            "assigned_route_id": assigned_route.route_id if assigned_route else None,
            "assigned_area": assigned_route.area_name if assigned_route else None,
            "generated_at": assigned_route.generated_at.isoformat() if assigned_route else None,
            "distance_today_km": round(float(distance_today), 2)
        })

    return jsonify(truck_statuses)




@api_bp.route('/reset', methods=['POST'])
@jwt_required()
def reset_database():
    
    try:
        
        RouteBin.query.delete()
        Route.query.delete()
        BinHistory.query.delete()
        Truck.query.delete()

    
        truck1 = Truck(reg_number="TRUCK-001")
        truck2 = Truck(reg_number="TRUCK-002")
        truck3 = Truck(reg_number="TRUCK-003")
        db.session.add_all([truck1, truck2, truck3])

    
        bins = Bin.query.all()
        for bin_obj in bins:
            bin_obj.current_fill_kg = 0.0
            bin_obj.status = 'EMPTY'
            bin_obj.predicted_full = None

        db.session.commit()

        
        import random
        DailyStats.query.delete() 

        areas = ['Lagos (Ikeja)', 'Lagos (Lekki)', 'Lagos (Victoria Island)', 'Noida', 'Delhi', 'Gurugram']
        for i in range(7):
            day = datetime.now(timezone.utc).date() - timedelta(days=i)
            for area in areas:
                stat = DailyStats(
                    date=day,
                    area_name=area,
                    waste_collected_kg=random.uniform(50, 150),
                    fuel_saved_L=0.0,
                    co2_reduced_kg=0.0
                )
                stat.fuel_saved_L = random.uniform(0.6, 2.5)
                stat.co2_reduced_kg = stat.fuel_saved_L * 2.31
                db.session.add(stat)

        db.session.commit()
        logger.info("Database reset successful - bins emptied, routes cleared")

        return jsonify({
            "message": "Database reset successful. Bins emptied and 7-day trend data generated.",
            "status": "success"
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error resetting database: {e}")
        return jsonify({
            "message": "Error resetting database.",
            "error": str(e),
            "status": "error"
        }), 500
@api_bp.route('/stats/history', methods=['GET'])
@jwt_required()
def get_stats_history():
    
    try:
        stats = DailyStats.query.order_by(DailyStats.date.asc()).all()

        history_map = {}
        for s in stats:
            date_str = s.date.isoformat()
            if date_str not in history_map:
                history_map[date_str] = {
                    'date': date_str,
                    'total_waste': 0,
                    'noida': 0,
                    'delhi': 0,
                    'gurugram': 0,
                    'total_fuel': 0,
                    'total_co2': 0
                }
            history_map[date_str]['total_waste'] += s.waste_collected_kg
            history_map[date_str]['total_fuel'] += s.fuel_saved_L
            history_map[date_str]['total_co2'] += s.co2_reduced_kg
            history_map[date_str][s.area_name.lower()] = s.waste_collected_kg

        return jsonify(list(history_map.values()))
    except Exception as e:
        logger.error(f"Error fetching stats history: {e}")
        return jsonify({"error": str(e)}), 500
