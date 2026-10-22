from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from app.satellite.tasks import dispatch, schedule


def test_disabled_scheduler_never_queries_database():
    with patch("app.satellite.tasks.get_settings") as settings, patch("app.satellite.tasks.transaction") as db:
        settings.return_value.satellite_scheduler_enabled = False
        assert schedule.run() == 0
        db.assert_not_called()


def test_dispatch_broker_failure_preserves_outbox():
    connection = MagicMock()
    connection.execute.return_value.mappings.return_value.all.return_value = [{"capture_id": "capture", "user_id": "farmer"}]

    @contextmanager
    def transaction():
        yield connection

    with (
        patch("app.satellite.tasks.transaction", transaction),
        patch("app.satellite.tasks.process_capture.apply_async", side_effect=ConnectionError("broker down")),
    ):
        assert dispatch.run() == 0
    assert connection.execute.call_count == 1
    assert "SKIP LOCKED" in str(connection.execute.call_args.args[0])


def test_lock_loser_shortens_outbox_lease():
    from app.satellite import tasks

    guard = MagicMock()
    guard.execute.return_value.scalar.side_effect = ["field-1", False]
    engine_obj = MagicMock()
    engine_obj.connect.return_value.__enter__.return_value = guard
    connection = MagicMock()

    @contextmanager
    def transaction():
        yield connection

    with (
        patch("app.satellite.tasks.engine", return_value=engine_obj),
        patch("app.satellite.tasks.transaction", transaction),
    ):
        assert tasks.process_capture.run("capture", "farmer") == "ALREADY_RUNNING"
    sql = str(connection.execute.call_args.args[0])
    assert "satellite_task_outbox" in sql and "next_dispatch_at" in sql
    assert connection.execute.call_args.args[1]["s"] == tasks.ALREADY_RUNNING_RETRY_SECONDS <= 60
