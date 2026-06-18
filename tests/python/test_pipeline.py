from fire_danger import fwi
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
    results, carry_state = compute_zone_forecast(forecast, start_state, hemisphere="south")
    assert [r["target_date"] for r in results] == ["2026-06-18", "2026-06-19"]
    assert all(r["danger_class"] in
               {"bajo", "moderado", "alto", "muy alto", "extremo"} for r in results)
    # state carried forward changes from the start
    assert carry_state != start_state
    # each row carries its drivers for the panel
    assert {"fwi", "isi", "bui", "temp", "rh", "wind", "precip"} <= set(results[0])


def test_carry_state_is_the_state_after_only_the_first_day():
    # The persisted carry_state must be today's step (day 0), NOT the end of the
    # 16-day projection. It must equal a single fwi_from_weather step from start.
    forecast = [
        _day("2026-06-18", 17.0, 42.0, 25.0),
        _day("2026-06-19", 20.0, 30.0, 30.0),
        _day("2026-06-20", 22.0, 25.0, 35.0),
    ]
    start_state = (85.0, 6.0, 15.0)
    _, carry_state = compute_zone_forecast(forecast, start_state, hemisphere="south")
    d0 = forecast[0]
    expected = fwi.fwi_from_weather(
        temp=d0.temp, rh=d0.rh, wind=d0.wind, rain=d0.precip,
        month=d0.month, hemisphere="south", prev=start_state)["state"]
    assert carry_state == (expected["ffmc"], expected["dmc"], expected["dc"])
