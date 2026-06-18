from fire_danger.pipeline import compute_zone_forecast
from fire_danger.openmeteo import DayWeather


def _day(date, temp, rh, wind, precip=0.0):
    return DayWeather(date=date, month=int(date[5:7]), temp=temp, rh=rh, wind=wind, precip=precip)


def test_compute_zone_forecast_chains_and_classifies():
    forecast = [
        _day("2026-06-18", 17.0, 42.0, 25.0),
        _day("2026-06-19", 20.0, 30.0, 30.0),
    ]
    start_state = (85.0, 6.0, 15.0)
    results, final_state = compute_zone_forecast(forecast, start_state, hemisphere="south")
    assert [r["target_date"] for r in results] == ["2026-06-18", "2026-06-19"]
    assert all(r["danger_class"] in
               {"bajo", "moderado", "alto", "muy alto", "extremo"} for r in results)
    # state carried forward changes from the start
    assert final_state != start_state
    # each row carries its drivers for the panel
    assert {"fwi", "isi", "bui", "temp", "rh", "wind", "precip"} <= set(results[0])
