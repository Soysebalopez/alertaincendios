"""Pure orchestration: chain a zone's forecast days forward and classify each.
No network — the endpoint feeds it weather and a start state."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.classify import danger_class
from fire_danger.openmeteo import DayWeather


def compute_zone_forecast(forecast: list[DayWeather],
                          start_state: tuple[float, float, float],
                          hemisphere: str) -> tuple[list[dict], tuple[float, float, float]]:
    """Chain the forecast forward and classify each day.

    Returns (results, carry_state). `carry_state` is the (ffmc, dmc, dc) AFTER
    the FIRST forecast day (today) — the value to persist so tomorrow's run
    continues the real day-by-day chain. Days 1..N advance an internal projected
    state that is NOT persisted (it's a forecast, not an observation), so the
    end-of-window state is intentionally not returned."""
    state = start_state
    carry_state = start_state
    results: list[dict] = []
    for i, day in enumerate(forecast):
        out = fwi.fwi_from_weather(
            temp=day.temp, rh=day.rh, wind=day.wind, rain=day.precip,
            month=day.month, hemisphere=hemisphere, prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        if i == 0:
            carry_state = state
        results.append({
            "target_date": day.date,
            "fwi": round(out["fwi"], 2),
            "isi": round(out["isi"], 2),
            "bui": round(out["bui"], 2),
            "danger_class": danger_class(out["fwi"]),
            "temp": day.temp, "rh": day.rh, "wind": day.wind, "precip": day.precip,
        })
    return results, carry_state
