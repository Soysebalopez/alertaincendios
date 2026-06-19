"""Open-Meteo client. Reduces hourly weather to one record per local day:
noon-local temp/RH/wind and the 24h precipitation sum — the inputs the FWI
expects. Forecast and historical (archive) endpoints share `parse_daily`."""
from __future__ import annotations

from dataclasses import dataclass

import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
TZ = "America/Argentina/Ushuaia"
_HOURLY = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"


@dataclass(frozen=True)
class DayWeather:
    date: str          # YYYY-MM-DD (local)
    month: int
    temp: float
    rh: float
    wind: float        # km/h
    precip: float      # mm, 24h sum


def parse_daily(raw: dict, noon_hour: int = 12) -> list[DayWeather]:
    h = raw["hourly"]
    times = h["time"]
    temps = h["temperature_2m"]
    rhs = h["relative_humidity_2m"]
    winds = h["wind_speed_10m"]
    precs = h["precipitation"]

    # group hourly indices by local date
    by_date: dict[str, list[int]] = {}
    for i, ts in enumerate(times):
        by_date.setdefault(ts[:10], []).append(i)

    out: list[DayWeather] = []
    for date in sorted(by_date):
        idxs = by_date[date]
        # noon-local index: the hour whose "HH" == noon_hour, else the middle
        noon = next((i for i in idxs if int(times[i][11:13]) == noon_hour), idxs[len(idxs) // 2])
        precip = sum(precs[i] or 0.0 for i in idxs)
        out.append(DayWeather(
            date=date,
            month=int(date[5:7]),
            temp=float(temps[noon]),
            rh=float(rhs[noon]),
            wind=float(winds[noon]),
            precip=float(precip),
        ))
    return out


def _get(url: str, params: dict) -> dict:
    resp = requests.get(url, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def fetch_forecast(lat: float, lng: float, days: int = 16) -> list[DayWeather]:
    raw = _get(FORECAST_URL, {
        "latitude": lat, "longitude": lng, "hourly": _HOURLY,
        "wind_speed_unit": "kmh", "timezone": TZ, "forecast_days": days,
    })
    return parse_daily(raw)


def fetch_history(lat: float, lng: float, start_date: str, end_date: str) -> list[DayWeather]:
    raw = _get(ARCHIVE_URL, {
        "latitude": lat, "longitude": lng, "hourly": _HOURLY,
        "wind_speed_unit": "kmh", "timezone": TZ,
        "start_date": start_date, "end_date": end_date,
    })
    return parse_daily(raw)


def _get_multi(url: str, params: dict) -> list[dict]:
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    # Open-Meteo returns a bare object for one location, a list for many.
    return data if isinstance(data, list) else [data]


def _points_params(points: list[tuple[float, float]]) -> dict:
    return {
        "latitude": ",".join(str(p[0]) for p in points),
        "longitude": ",".join(str(p[1]) for p in points),
        "hourly": _HOURLY, "wind_speed_unit": "kmh", "timezone": TZ,
    }


def fetch_forecast_multi(points: list[tuple[float, float]], days: int = 16) -> list[list[DayWeather]]:
    blocks = _get_multi(FORECAST_URL, {**_points_params(points), "forecast_days": days})
    return [parse_daily(b) for b in blocks]


def fetch_history_multi(points: list[tuple[float, float]],
                        start_date: str, end_date: str) -> list[list[DayWeather]]:
    blocks = _get_multi(ARCHIVE_URL, {**_points_params(points),
                                      "start_date": start_date, "end_date": end_date})
    return [parse_daily(b) for b in blocks]
