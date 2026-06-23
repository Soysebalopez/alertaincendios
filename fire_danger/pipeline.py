"""Pure orchestration: chain a zone's forecast days forward and classify each.
No network — the endpoint feeds it weather and a start state."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.aggregate import aggregate_fwi, leader_index
from fire_danger.classify import danger_class
from fire_danger.openmeteo import DayWeather


def compute_zone_forecast(forecast: list[DayWeather],
                          start_state: tuple[float, float, float],
                          hemisphere: str,
                          zone_id: str | None = None) -> tuple[list[dict], tuple[float, float, float]]:
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
            "danger_class": danger_class(out["fwi"], zone_id),
            "temp": day.temp, "rh": day.rh, "wind": day.wind, "precip": day.precip,
        })
    return results, carry_state


def compute_zone_forecast_grid(
    per_point_forecasts: list[list[DayWeather]],
    per_point_state: list[tuple[float, float, float]],
    hemisphere: str,
    zone_id: str | None = None,
) -> tuple[list[dict], list[tuple[float, float, float]]]:
    """Grid version of compute_zone_forecast. Chain the FWI per point — each point
    carries its OWN (ffmc,dmc,dc) forward, because the spatial heterogeneity lives
    in DC/DMC and sharing state would erase it — then aggregate each forecast day's
    N point-FWIs by p95. The row's components (isi/bui/temp/rh/wind/precip) come
    from the 'leader' point closest to that p95, so the row stays consistent with a
    real point. Returns (results, carry_states) — one carry_state per point, all to
    be persisted (each continues its own chain tomorrow)."""
    per_point_results: list[list[dict]] = []
    carry_states: list[tuple[float, float, float]] = []
    for forecast, start_state in zip(per_point_forecasts, per_point_state):
        results, carry = compute_zone_forecast(forecast, start_state, hemisphere)
        per_point_results.append(results)
        carry_states.append(carry)

    n_days = min(len(r) for r in per_point_results)
    aggregated: list[dict] = []
    for d in range(n_days):
        day_rows = [pr[d] for pr in per_point_results]
        fwis = [row["fwi"] for row in day_rows]
        agg = round(aggregate_fwi(fwis), 2)
        lead = day_rows[leader_index(fwis)]
        aggregated.append({
            "target_date": lead["target_date"],
            "fwi": agg,
            "isi": lead["isi"], "bui": lead["bui"],
            "danger_class": danger_class(agg, zone_id),
            "temp": lead["temp"], "rh": lead["rh"],
            "wind": lead["wind"], "precip": lead["precip"],
        })
    return aggregated, carry_states
