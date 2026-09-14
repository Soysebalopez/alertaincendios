"""api/smn-wrf-sync.py writes each file's rows as soon as it reads them, and
stops starting downloads once its time budget is spent (WHI-907 part 4).

Vercel kills the function at 300 s. Measured on 2026-09-14 from a home link,
two SMN files took 334 s. Writing only at the end would lose every row of a
run that gets killed; writing file by file keeps the hours already read.
"""
import importlib.util
from pathlib import Path

import pytest

HANDLER = Path(__file__).resolve().parents[2] / "api" / "smn-wrf-sync.py"
KEYS = [f"DATA/WRF/DET/2026/09/14/00/WRFDETAR_01H_20260914_00_{lead:03d}.nc" for lead in range(3)]


@pytest.fixture
def sync(monkeypatch):
    spec = importlib.util.spec_from_file_location("smn_wrf_sync", HANDLER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.boto3, "client", lambda *args, **kwargs: object())
    monkeypatch.setattr(module, "list_keys", lambda client, prefixes: KEYS)
    monkeypatch.setattr(module, "MAX_LEAD_HOURS", 2)
    monkeypatch.setattr(module, "read_file_rows", lambda client, key: [{"key": key}, {"key": key}])
    return module


def test_rows_are_written_file_by_file(sync, monkeypatch):
    writes = []
    monkeypatch.setattr(sync, "upsert", lambda rows: (writes.append(len(rows)) or len(rows), None))
    result = sync.run_pipeline()
    assert writes == [2, 2, 2]
    assert result["ok"] is True
    assert (result["files_read"], result["rows"], result["inserted"], result["partial"]) == (3, 6, 6, False)


def test_no_new_download_starts_after_the_budget(sync, monkeypatch):
    monkeypatch.setattr(sync, "TIME_BUDGET_SECONDS", 0)
    monkeypatch.setattr(sync, "upsert", lambda rows: (len(rows), None))
    result = sync.run_pipeline()
    assert (result["files_read"], result["partial"]) == (0, True)


def test_a_missing_table_stops_after_the_first_file(sync, monkeypatch):
    read = []
    monkeypatch.setattr(sync, "read_file_rows", lambda client, key: read.append(key) or [{"key": key}])
    monkeypatch.setattr(sync, "upsert", lambda rows: (0, "table_missing"))
    result = sync.run_pipeline()
    assert len(read) == 1
    assert result["ok"] is True
    assert result["skipped"] == "table_missing"


def test_a_write_error_stops_and_is_reported(sync, monkeypatch):
    monkeypatch.setattr(sync, "upsert", lambda rows: (0, "supabase_status_500: boom"))
    result = sync.run_pipeline()
    assert result["ok"] is False
    assert result["files_read"] == 1
    assert result["error"].startswith("supabase_status_500")
