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
