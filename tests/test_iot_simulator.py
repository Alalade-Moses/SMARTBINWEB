import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.simulation.iot_simulator import (
    FILL_PROFILES,
    calculate_next_fill_level,
    generate_waste_for_bin,
    get_bin_fill_profile,
)


def make_bin(bin_id, fill=0.0, capacity=200.0):
    return SimpleNamespace(
        bin_id=bin_id,
        current_fill_kg=fill,
        capacity_kg=capacity,
    )


class IotSimulatorTests(unittest.TestCase):
    def test_same_bin_id_always_maps_to_same_profile(self):
        self.assertEqual(get_bin_fill_profile(4), get_bin_fill_profile(4))
        self.assertEqual(get_bin_fill_profile(11), get_bin_fill_profile(11))

    def test_bin_ids_cover_all_profiles(self):
        profiles = {get_bin_fill_profile(bin_id) for bin_id in [1, 2, 3]}

        self.assertEqual(profiles, {'medium', 'high', 'low'})

    def test_generated_waste_uses_profile_bounds(self):
        for bin_id in [1, 2, 3]:
            profile = get_bin_fill_profile(bin_id)
            min_kg, max_kg = FILL_PROFILES[profile]
            midpoint = (min_kg + max_kg) / 2

            with patch('app.simulation.iot_simulator.random.uniform', return_value=midpoint) as mock_uniform:
                waste_added = generate_waste_for_bin(make_bin(bin_id))

            mock_uniform.assert_called_once_with(min_kg, max_kg)
            self.assertGreaterEqual(waste_added, min_kg)
            self.assertLessEqual(waste_added, max_kg)

    def test_generated_waste_is_rounded_to_two_decimals(self):
        with patch('app.simulation.iot_simulator.random.uniform', return_value=1.234):
            waste_added = generate_waste_for_bin(make_bin(1))

        self.assertEqual(waste_added, 1.23)

    def test_next_fill_level_never_exceeds_capacity(self):
        bin_obj = make_bin(1, fill=199.5, capacity=200.0)

        next_fill = calculate_next_fill_level(bin_obj, 2.2)

        self.assertEqual(next_fill, 200.0)

    def test_next_fill_level_is_rounded_to_two_decimals(self):
        bin_obj = make_bin(1, fill=10.111, capacity=200.0)

        next_fill = calculate_next_fill_level(bin_obj, 0.222)

        self.assertEqual(next_fill, 10.33)


if __name__ == '__main__':
    unittest.main()
