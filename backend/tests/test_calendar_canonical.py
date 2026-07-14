import unittest
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models import ScheduleBlock
from app.routers.soil import _soil_events


class CalendarCanonicalSourceTest(unittest.TestCase):
    def test_soil_events_read_only_schedule_blocks(self):
        block = SimpleNamespace(
            id=10,
            date=date(2026, 7, 14),
            start_time=time(20, 0),
            end_time=time(20, 30),
            title="創作",
            category="creation",
            note="[home-habit:creation]",
        )
        query = MagicMock()
        query.filter.return_value = query
        query.all.return_value = [block]
        db = MagicMock()
        db.query.return_value = query

        events = _soil_events(db, start=block.date, end=block.date)

        db.query.assert_called_once_with(ScheduleBlock)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_type"], "calendar")
        self.assertEqual(events[0]["category_key"], "creation")
        self.assertEqual(events[0]["duration_minutes"], 30)


if __name__ == "__main__":
    unittest.main()
