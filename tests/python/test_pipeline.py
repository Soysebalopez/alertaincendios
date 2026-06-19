from fire_danger import fwi
from fire_danger.pipeline import compute_zone_forecast, compute_zone_forecast_grid
from fire_danger.openmeteo import DayWeather
from fire_danger.aggregate import aggregate_fwi


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


def test_grid_of_one_point_matches_single_point():
    forecast = [_day("2026-06-18", 17.0, 42.0, 25.0), _day("2026-06-19", 20.0, 30.0, 30.0)]
    start = (85.0, 6.0, 15.0)
    single, single_carry = compute_zone_forecast(forecast, start, hemisphere="south")
    grid, grid_carries = compute_zone_forecast_grid([forecast], [start], hemisphere="south")
    assert grid == single
    assert grid_carries == [single_carry]


def test_grid_points_carry_independent_state():
    wet = [_day("2026-06-18", 10.0, 95.0, 5.0, precip=20.0)]
    dry = [_day("2026-06-18", 25.0, 15.0, 30.0, precip=0.0)]
    start = (85.0, 6.0, 15.0)
    _, carries = compute_zone_forecast_grid([wet, dry], [start, start], hemisphere="south")
    assert carries[0] != carries[1]  # different weather -> different per-point state


def test_grid_day_fwi_equals_p95_of_point_fwis():
    hot = [_day("2026-01-15", 30.0, 12.0, 35.0)]
    cool = [_day("2026-01-15", 14.0, 80.0, 8.0)]
    start = (85.0, 6.0, 15.0)
    res_hot, _ = compute_zone_forecast(hot, start, hemisphere="south")
    res_cool, _ = compute_zone_forecast(cool, start, hemisphere="south")
    res_grid, _ = compute_zone_forecast_grid([hot, cool], [start, start], hemisphere="south")
    assert res_grid[0]["fwi"] == round(aggregate_fwi([res_hot[0]["fwi"], res_cool[0]["fwi"]]), 2)
