"""WHI-907 part 2 — choosing which GLM files to read. One file every 20 s;
the start time is encoded in the key as sYYYYJJJHHMMSS + tenths."""
from datetime import datetime, timezone

import pytest

from glm import extract


def glm_key(hour: int, minute: int, second: int, tenth: int = 0) -> str:
    return (
        f"GLM-L2-LCFA/2026/257/{hour:02d}/OR_GLM-L2-LCFA_G19_"
        f"s2026257{hour:02d}{minute:02d}{second:02d}{tenth}_e20262570000000_c20262570000000.nc"
    )


def test_start_time_comes_from_the_key():
    real = "GLM-L2-LCFA/2026/257/14/OR_GLM-L2-LCFA_G19_s20262571400000_e20262571400200_c20262571400218.nc"
    assert extract.key_start(real) == datetime(2026, 9, 14, 14, 0, 0, tzinfo=timezone.utc)


def test_start_time_keeps_the_tenths_of_second():
    assert extract.key_start(glm_key(14, 5, 20, 5)) == datetime(2026, 9, 14, 14, 5, 20, 500000, tzinfo=timezone.utc)


def test_keys_since_filters_and_sorts_by_start_time():
    keys = [glm_key(14, 6, 0), glm_key(14, 0, 0), glm_key(14, 5, 40), glm_key(13, 59, 40)]
    since = datetime(2026, 9, 14, 14, 0, 0, tzinfo=timezone.utc)
    assert extract.keys_since(keys, since) == [glm_key(14, 0, 0), glm_key(14, 5, 40), glm_key(14, 6, 0)]


def test_hour_prefixes_include_the_previous_hour_when_the_window_crosses_it():
    since = datetime(2026, 9, 14, 13, 57, tzinfo=timezone.utc)
    now = datetime(2026, 9, 14, 14, 3, tzinfo=timezone.utc)
    assert extract.hour_prefixes(since, now) == ["GLM-L2-LCFA/2026/257/13/", "GLM-L2-LCFA/2026/257/14/"]


def test_hour_prefixes_for_a_window_inside_one_hour():
    since = datetime(2026, 9, 14, 14, 1, tzinfo=timezone.utc)
    now = datetime(2026, 9, 14, 14, 7, tzinfo=timezone.utc)
    assert extract.hour_prefixes(since, now) == ["GLM-L2-LCFA/2026/257/14/"]


def test_key_start_rejects_other_files():
    with pytest.raises(ValueError):
        extract.key_start("GLM-L2-LCFA/2026/257/14/README")
