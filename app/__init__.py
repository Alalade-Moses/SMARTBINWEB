from flask import Flask
from config import Config
from app.database import db
from flask_apscheduler import APScheduler
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from app.simulation.iot_simulator import simulate_waste_generation
from app.ml.prediction_model import train_and_predict_full_times
from app.routes_optimizer.optimizer import generate_collection_route

scheduler = APScheduler()
DEPOT_LOCATION = (28.5355, 77.3910) 


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app) 
    JWTManager(app)
    CORS(app)

    
    if not scheduler.running:
        scheduler.init_app(app)

        # Job 1: Simulate IoT bin data every 30 seconds
        scheduler.add_job(
            id='simulate_waste',
            func=simulate_waste_generation,
            trigger='interval',
            seconds=30,
            args=[app] 
        )

        # Job 2: Run ML predictions every 5 minutes
        scheduler.add_job(
            id='predict_full_times',
            func=train_and_predict_full_times,
            trigger='interval',
            minutes=5,
            args=[app] 
        )

        # Job 3: Generate new optimal routes every 15 minutes for all areas
        def generate_all_routes():
            with app.app_context():
                from app.models import Bin
                areas = db.session.query(Bin.area_name).distinct().all()
                area_names = [a[0] for a in areas]

                # Default depots for each area
                depots = {
                    "Lagos (Ikeja)": (6.5950, 3.3420),
                    "Lagos (Lekki)": (6.4600, 3.5700),
                    "Lagos (Victoria Island)": (6.4200, 3.4100),
                    "Noida": (28.5355, 77.3910),
                    "Delhi": (28.6139, 77.2090),
                    "Gurugram": (28.4595, 77.0266)
                }

                for name in area_names:
                    coords = depots.get(name, DEPOT_LOCATION)
                    generate_collection_route(app, coords[0], coords[1], area_name=name)

        scheduler.add_job(
            id='generate_route',
            func=generate_all_routes,
            trigger='interval',
            minutes=15
        )

        scheduler.start()

    from app.api.routes import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    @app.route('/hello')
    def hello():
        return 'Hello, Smart Waste System!'

    return app
