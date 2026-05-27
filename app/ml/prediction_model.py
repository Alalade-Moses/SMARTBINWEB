from datetime import datetime, timedelta, timezone
import logging

from app.database import db
from app.models import Bin, BinHistory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SIMULATION_TICK_SECONDS = 30
MIN_RECENT_POINTS = 5
MAX_RECENT_POINTS = 20
MIN_AVERAGE_KG_PER_TICK = 0.05


def _ensure_aware_utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _current_cycle_history(history_data):

    if not history_data:
        return []

    latest_reset_index = 0
    previous_fill = history_data[0].fill_level_kg

    for index, record in enumerate(history_data):
        current_fill = record.fill_level_kg
        if current_fill <= 0 or current_fill < previous_fill:
            latest_reset_index = index
        previous_fill = current_fill

    return history_data[latest_reset_index:]


def _average_recent_fill_per_tick(history_data):
    recent_history = _current_cycle_history(history_data)[-MAX_RECENT_POINTS:]

    if len(recent_history) < MIN_RECENT_POINTS:
        return None

    deltas = []
    for previous, current in zip(recent_history, recent_history[1:]):
        delta = current.fill_level_kg - previous.fill_level_kg
        deltas.append(max(0.0, delta))

    if not deltas:
        return None

    average_kg_per_tick = sum(deltas) / len(deltas)
    if average_kg_per_tick < MIN_AVERAGE_KG_PER_TICK:
        return None

    return average_kg_per_tick


def predict_full_time_for_bin(bin_obj, history_data, now_utc=None):
    now_utc = now_utc or datetime.now(timezone.utc)
    now_utc = _ensure_aware_utc(now_utc)

    if bin_obj.status == 'FULL':
        return now_utc

    if bin_obj.status == 'EMPTY' or bin_obj.current_fill_kg <= 0:
        return None

    remaining_kg = max(0.0, bin_obj.capacity_kg - bin_obj.current_fill_kg)
    if remaining_kg <= 0:
        return now_utc

    average_kg_per_tick = _average_recent_fill_per_tick(history_data)
    if average_kg_per_tick is None:
        return None

    ticks_remaining = remaining_kg / average_kg_per_tick
    seconds_remaining = max(0.0, ticks_remaining * SIMULATION_TICK_SECONDS)
    return now_utc + timedelta(seconds=seconds_remaining)



def train_and_predict_full_times(app):
    logger.info(f"[{datetime.now()}] Running ML prediction...")

    try:
        with app.app_context():
            
            with db.session.no_autoflush:
                bins = Bin.query.all()
                if not bins:
                    logger.info("ML: No bins found to process.")
                    return

                for bin_obj in bins:
                    logger.info(f"Processing predictions for Bin {bin_obj.bin_id}...")

                    history_data = BinHistory.query.filter_by(bin_id=bin_obj.bin_id) \
                                                  .order_by(BinHistory.read_time.asc()) \
                                                  .all()

                    predicted_full_datetime = predict_full_time_for_bin(bin_obj, history_data)

                    if predicted_full_datetime:
                        logger.info(
                            f"Bin {bin_obj.bin_id}: Predicted full by {predicted_full_datetime.isoformat()} "
                            f"(Current: {bin_obj.current_fill_kg}/{bin_obj.capacity_kg} kg)"
                        )
                    else:
                        logger.info(
                            f"Bin {bin_obj.bin_id}: No valid prediction "
                            f"(insufficient recent growth, empty bin, or too few current-cycle points)."
                        )

                    bin_to_update = db.session.query(Bin).filter_by(bin_id=bin_obj.bin_id).first()
                    if bin_to_update:
                        bin_to_update.predicted_full = predicted_full_datetime
                        db.session.add(bin_to_update)

            
            import time as _time
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    db.session.commit()
                    logger.info("ML prediction complete for all bins.")
                    break
                except Exception as commit_error:
                    db.session.rollback()
                    if attempt < max_retries - 1:
                        logger.warning(f"Deadlock on commit attempt {attempt + 1}, retrying...")
                        _time.sleep(1)
                    else:
                        logger.error(f"Failed to commit after {max_retries} attempts: {commit_error}")
    except Exception as e:
        logger.error(f"Error during ML prediction: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
