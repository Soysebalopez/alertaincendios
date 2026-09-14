"""WHI-907 part 4 — choosing which SMN WRF files to download. Runs start at
00 and 12 UTC and their hourly files appear over time, so the sync uses the
newest run whose first hours are all published."""
from datetime import datetime, timezone

from smn_wrf import extract


def key(day: str, run: str, lead: int) -> str:
    return f"DATA/WRF/DET/{day[:4]}/{day[4:6]}/{day[6:]}/{run}/WRFDETAR_01H_{day}_{run}_{lead:03d}.nc"


def test_candidate_run_prefixes_are_newest_first():
    now = datetime(2026, 9, 14, 15, 30, tzinfo=timezone.utc)
    assert extract.candidate_run_prefixes(now) == [
        "DATA/WRF/DET/2026/09/14/12/",
        "DATA/WRF/DET/2026/09/14/00/",
        "DATA/WRF/DET/2026/09/13/12/",
    ]


def test_before_noon_the_newest_candidate_is_todays_00z_run():
    now = datetime(2026, 9, 14, 9, 0, tzinfo=timezone.utc)
    assert extract.candidate_run_prefixes(now) == [
        "DATA/WRF/DET/2026/09/14/00/",
        "DATA/WRF/DET/2026/09/13/12/",
        "DATA/WRF/DET/2026/09/13/00/",
    ]


def test_picks_the_newest_complete_run():
    keys = [key("20260914", "00", h) for h in range(0, 73)] + [key("20260914", "12", h) for h in range(0, 6)]
    assert extract.pick_run_keys(keys, max_lead=12) == [key("20260914", "00", h) for h in range(0, 13)]


def test_prefers_the_newer_run_once_it_is_complete():
    keys = [key("20260914", "00", h) for h in range(0, 13)] + [key("20260914", "12", h) for h in range(0, 13)]
    assert extract.pick_run_keys(keys, max_lead=12) == [key("20260914", "12", h) for h in range(0, 13)]


def test_returns_nothing_when_no_run_is_complete():
    assert extract.pick_run_keys([key("20260914", "12", h) for h in range(0, 4)], max_lead=12) == []


def test_ignores_unrelated_files():
    keys = [key("20260914", "00", h) for h in range(0, 13)] + ["DATA/WRF/DET/2026/09/14/00/README.txt"]
    assert len(extract.pick_run_keys(keys, max_lead=12)) == 13
