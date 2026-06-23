import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.openmeteo import DayWeather  # noqa: E402
from fwi_cache import cached_fetch  # noqa: E402


def _block():
    return [[DayWeather(date="2021-01-01", month=1, temp=10.0, rh=50.0, wind=5.0, precip=0.0)]]


def test_caches_and_resumes_without_refetch(tmp_path):
    calls = []

    def fetch():
        calls.append(1)
        return _block()

    r1 = cached_fetch(tmp_path, "z-2021-32pts", fetch)
    r2 = cached_fetch(tmp_path, "z-2021-32pts", fetch)

    assert len(calls) == 1                      # second call did NOT re-fetch
    assert r1 == r2                             # same data both times
    assert r1[0][0].temp == 10.0               # reconstructed DayWeather
    assert (tmp_path / "z-2021-32pts.json").exists()


def test_distinct_keys_each_fetch(tmp_path):
    calls = []

    def fetch():
        calls.append(1)
        return _block()

    cached_fetch(tmp_path, "a", fetch)
    cached_fetch(tmp_path, "b", fetch)

    assert len(calls) == 2                      # distinct keys → two fetches
