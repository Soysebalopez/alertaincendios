import json
from pathlib import Path

from fire_danger.openmeteo import parse_daily, DayWeather

FIX = Path(__file__).parent / "fixtures" / "openmeteo_forecast.json"


def test_parse_daily_reduces_hourly_to_days():
    raw = json.loads(FIX.read_text())
    days = parse_daily(raw, noon_hour=12)
    assert len(days) >= 1
    d0 = days[0]
    assert isinstance(d0, DayWeather)
    # noon values are taken from the hourly arrays; precip is the 24h sum
    assert d0.month in range(1, 13)
    assert d0.rh <= 100.0
    assert d0.precip >= 0.0
    assert d0.wind >= 0.0


def test_fetch_forecast_multi_returns_one_series_per_point(monkeypatch):
    import fire_danger.openmeteo as om
    raw = json.loads(FIX.read_text())

    class _Resp:
        def raise_for_status(self): pass
        def json(self): return [raw, raw]  # Open-Meteo returns a list for many points

    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(om.requests, "get", fake_get)

    series = om.fetch_forecast_multi([(-53.7, -67.7), (-54.8, -68.3)], days=3)
    assert len(series) == 2
    assert all(len(s) >= 1 for s in series)
    assert isinstance(series[0][0], DayWeather)
    # coords are encoded as comma-separated lists, in order
    assert captured["params"]["latitude"] == "-53.7,-54.8"
    assert captured["params"]["longitude"] == "-67.7,-68.3"
