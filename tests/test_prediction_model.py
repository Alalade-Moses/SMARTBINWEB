import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.ml.prediction_model import predict_full_time_for_bin


def make_bin(fill, capacity=200.0, status='FILLING'):
    return SimpleNamespace(
        current_fill_kg=fill,
        capacity_kg=capacity,
        status=status,
    )


def make_history(fills, start=None, gap_seconds=30):
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [
        SimpleNamespace(
            fill_level_kg=fill,
            read_time=start + timedelta(seconds=index * gap_seconds),
        )
        for index, fill in enumerate(fills)
    ]


class PredictionModelTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def test_steady_recent_growth_predicts_within_minutes(self):
        bin_obj = make_bin(fill=60.0)
        history = make_history([50, 52, 54, 56, 58, 60])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNotNone(predicted)
        self.assertEqual(predicted, self.now + timedelta(minutes=35))

    def test_full_bin_predicts_now(self):
        bin_obj = make_bin(fill=200.0, status='FULL')
        history = make_history([190, 195, 200])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertEqual(predicted, self.now)

    def test_at_capacity_predicts_now_even_if_status_lags(self):
        bin_obj = make_bin(fill=200.0)
        history = make_history([190, 195, 200])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertEqual(predicted, self.now)

    def test_empty_bin_clears_prediction(self):
        bin_obj = make_bin(fill=0.0, status='EMPTY')
        history = make_history([0, 1, 2, 3, 0])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNone(predicted)

    def test_recent_collection_ignores_previous_cycle(self):
        bin_obj = make_bin(fill=40.0)
        history = make_history([120, 130, 140, 0, 10, 20, 30, 35, 40])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNotNone(predicted)
        self.assertLess(predicted - self.now, timedelta(hours=1))

    def test_long_wall_clock_gap_does_not_create_multiday_eta(self):
        bin_obj = make_bin(fill=60.0)
        history = make_history([50, 52, 54, 56, 58, 60], gap_seconds=86400)

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNotNone(predicted)
        self.assertEqual(predicted, self.now + timedelta(minutes=35))

    def test_too_few_points_clears_prediction(self):
        bin_obj = make_bin(fill=60.0)
        history = make_history([54, 56, 58, 60])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNone(predicted)

    def test_no_recent_growth_clears_prediction(self):
        bin_obj = make_bin(fill=60.0)
        history = make_history([60, 60, 60, 60, 60])

        predicted = predict_full_time_for_bin(bin_obj, history, now_utc=self.now)

        self.assertIsNone(predicted)


if __name__ == '__main__':
    unittest.main()
