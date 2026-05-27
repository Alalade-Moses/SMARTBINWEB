import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.routes_optimizer.optimizer import bin_needs_collection


def make_bin(fill=0.0, capacity=200.0, status='FILLING', predicted_full=None):
    return SimpleNamespace(
        current_fill_kg=fill,
        capacity_kg=capacity,
        status=status,
        predicted_full=predicted_full,
    )


class RouteOptimizerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def test_full_bin_is_eligible(self):
        bin_obj = make_bin(fill=200.0, status='FULL')

        self.assertTrue(bin_needs_collection(bin_obj, self.now))

    def test_seventy_percent_bin_is_eligible(self):
        bin_obj = make_bin(fill=140.0)

        self.assertTrue(bin_needs_collection(bin_obj, self.now))

    def test_prediction_within_one_hour_is_eligible(self):
        bin_obj = make_bin(fill=20.0, predicted_full=self.now + timedelta(minutes=45))

        self.assertTrue(bin_needs_collection(bin_obj, self.now))

    def test_prediction_four_hours_away_is_not_eligible(self):
        bin_obj = make_bin(fill=20.0, predicted_full=self.now + timedelta(hours=4))

        self.assertFalse(bin_needs_collection(bin_obj, self.now))

    def test_empty_bin_is_not_eligible_even_with_prediction(self):
        bin_obj = make_bin(status='EMPTY', predicted_full=self.now + timedelta(minutes=10))

        self.assertFalse(bin_needs_collection(bin_obj, self.now))

    def test_maintenance_bin_is_not_eligible_even_with_prediction(self):
        bin_obj = make_bin(status='MAINTENANCE', predicted_full=self.now + timedelta(minutes=10))

        self.assertFalse(bin_needs_collection(bin_obj, self.now))

    def test_naive_prediction_time_is_handled_as_utc(self):
        predicted_full = (self.now + timedelta(minutes=30)).replace(tzinfo=None)
        bin_obj = make_bin(fill=20.0, predicted_full=predicted_full)

        self.assertTrue(bin_needs_collection(bin_obj, self.now))

    def test_naive_now_time_is_handled_as_utc(self):
        now = self.now.replace(tzinfo=None)
        bin_obj = make_bin(fill=20.0, predicted_full=self.now + timedelta(minutes=30))

        self.assertTrue(bin_needs_collection(bin_obj, now))

    def test_zero_capacity_bin_is_not_eligible_unless_full(self):
        bin_obj = make_bin(fill=20.0, capacity=0.0, predicted_full=self.now + timedelta(minutes=10))

        self.assertFalse(bin_needs_collection(bin_obj, self.now))


if __name__ == '__main__':
    unittest.main()
