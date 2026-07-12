import unittest

from app.routers.dashboard import FOCUS_HABITS, _connection_state


class ConnectionStateTest(unittest.TestCase):
    def test_creation_minimum_connection_is_five_minutes(self):
        self.assertEqual(FOCUS_HABITS["creation"]["minimum"], 5)

    def test_touch_today_is_connected(self):
        self.assertEqual(_connection_state("creation", 0, 0), ("今日も接続中", "hot"))

    def test_one_day_off_stays_warm(self):
        self.assertEqual(_connection_state("creation", 1, 0), ("まだ温かい", "warm"))

    def test_two_days_is_observation_not_command(self):
        self.assertEqual(_connection_state("creation", 2, 0), ("少し離れている", "connected"))

    def test_four_days_is_reconnectable(self):
        self.assertEqual(_connection_state("creation", 4, 0), ("再接続できる", "reconnect"))

    def test_empty_social_field_is_quiet(self):
        self.assertEqual(_connection_state("life", None, 0), ("—", "quiet"))

    def test_body_between_routine_days_is_resting(self):
        self.assertEqual(_connection_state("body", 2, 3), ("休息日", "rest"))

    def test_body_routine_day_is_reconnectable(self):
        self.assertEqual(_connection_state("body", None, 6), ("再接続できる", "reconnect"))


if __name__ == "__main__":
    unittest.main()
