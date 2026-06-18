"""Pure orchestration: chain a zone's forecast days forward and classify each.
No network — the endpoint feeds it weather and a start state."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.classify import danger_class
from fire_danger.openmeteo import DayWeather


def compute_zone_forecast(forecast: list[DayWeather],
                          start_state: tuple[float, float, float],
                          hemisphere: str) -> tuple[list[dict], tuple[float, float, float]]:
    state = start_state
    results: list[dict] = []
    for day in forecast:
        out = fwi.fwi_from_weather(
            temp=day.temp, rh=day.rh, wind=day.wind, rain=day.precip,
            month=day.month, hemisphere=hemisphere, prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        results.append({
            "target_date": day.date,
            "fwi": round(out["fwi"], 2),
            "isi": round(out["isi"], 2),
            "bui": round(out["bui"], 2),
            "danger_class": danger_class(out["fwi"]),
            "temp": day.temp, "rh": day.rh, "wind": day.wind, "precip": day.precip,
        })
    return results, state
