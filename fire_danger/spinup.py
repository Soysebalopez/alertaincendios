"""Seed a new zone's FWI state by replaying ~30 real historical days, so the
zone reports valid values from day 1 instead of a cold 2–4 week spin-up."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.openmeteo import DayWeather


def replay_state(history: list[DayWeather], hemisphere: str) -> dict:
    """Chain DEFAULT_STATE through the historical days; return the final state."""
    state = fwi.DEFAULT_STATE
    for day in history:
        out = fwi.fwi_from_weather(
            temp=day.temp, rh=day.rh, wind=day.wind, rain=day.precip,
            month=day.month, hemisphere=hemisphere, prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
    return {"ffmc": state[0], "dmc": state[1], "dc": state[2]}
