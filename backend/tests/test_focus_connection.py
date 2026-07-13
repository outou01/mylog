import unittest
from datetime import date, datetime, time
from types import SimpleNamespace

from app.routers.dashboard import (
    FOCUS_HABITS,
    _connection_state,
    _habit_schedule_marker,
    _habit_schedule_times,
    _next_weekday,
    _seed_is_planted_today,
)


class ConnectionStateTest(unittest.TestCase):
    def test_home_habit_calendar_marker_is_stable(self):
        self.assertEqual(_habit_schedule_marker("reading"), "[home-habit:reading]")

    def test_home_habit_gets_an_initial_slot_ending_now(self):
        start, end = _habit_schedule_times(10, now=datetime(2026, 7, 13, 21, 13))
        self.assertEqual((start, end), (time(21, 3), time(21, 13)))

    def test_home_habit_keeps_a_slot_moved_in_calendar(self):
        start, end = _habit_schedule_times(
            10,
            existing_start=time(7, 30),
            existing_end=time(7, 40),
            now=datetime(2026, 7, 13, 21, 13),
        )
        self.assertEqual((start, end), (time(7, 30), time(7, 40)))

    def test_fixed_routine_uses_next_tuesday_and_sunday(self):
        sunday = date(2026, 7, 12)
        self.assertEqual(_next_weekday(sunday, 1), date(2026, 7, 14))
        self.assertEqual(_next_weekday(sunday, 6), sunday)

    def test_creation_minimum_connection_is_five_minutes(self):
        self.assertEqual(FOCUS_HABITS["creation"]["minimum"], 5)
        self.assertEqual(FOCUS_HABITS["creation"]["standard"], 15)

    def test_creation_is_due_every_day(self):
        from app.routers.dashboard import _habit_is_due
        self.assertTrue(all(_habit_is_due("creation", weekday) for weekday in range(7)))

    def test_category_schedule_satisfies_seed_suggestion(self):
        seed = SimpleNamespace(id=42, category="creation")
        self.assertTrue(_seed_is_planted_today(seed, set(), {"creation"}))
        self.assertTrue(_seed_is_planted_today(seed, {42}, set()))
        self.assertFalse(_seed_is_planted_today(seed, set(), {"reading"}))

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
