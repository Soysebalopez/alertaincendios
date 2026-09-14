"""Does a GOES-19 mesoscale sector cover Bahía Blanca? (WHI-907 part 6)

The 1-minute fire product (ABI-L2-FDCM, sectors M1 and M2) points wherever
NOAA places its mesoscale sectors — on 2026-09-14 M1 covered the central US.
A file is worth processing only when its sector covers the point we care
about. The sector limits live in the attributes of `geospatial_lat_lon_extent`
(inspected on a real file), stored as float32.
"""
from __future__ import annotations

from datetime import datetime

# Same GOES-R file naming as GLM: _sYYYYJJJHHMMSS + tenths of second.
from glm.extract import key_start

_EXTENT_VAR = "geospatial_lat_lon_extent"
# float32 attributes round a limit by up to ~1e-6°; keep a point on the edge inside.
_EDGE_TOLERANCE_DEG = 1e-4


def sector_extent(ds) -> tuple[float, float, float, float]:
    """(south, north, west, east) of the sector, from the file's extent attributes."""
    if _EXTENT_VAR not in ds.variables:
        raise ValueError("file has no geospatial_lat_lon_extent variable")
    attrs = ds[_EXTENT_VAR].attrs
    try:
        return (
            float(attrs["geospatial_southbound_latitude"]),
            float(attrs["geospatial_northbound_latitude"]),
            float(attrs["geospatial_westbound_longitude"]),
            float(attrs["geospatial_eastbound_longitude"]),
        )
    except KeyError as exc:
        raise ValueError(f"missing sector extent attribute: {exc}") from exc


def covers(extent: tuple[float, float, float, float], point: tuple[float, float]) -> bool:
    south, north, west, east = extent
    lat, lng = point
    tol = _EDGE_TOLERANCE_DEG
    return (south - tol) <= lat <= (north + tol) and (west - tol) <= lng <= (east + tol)


def keys_since(keys: list[str], since: datetime) -> list[str]:
    """Mesoscale file keys (either sector) whose scan started at or after `since`, oldest first."""
    dated: list[tuple[datetime, str]] = []
    for key in keys:
        try:
            start = key_start(key)
        except ValueError:
            continue
        if start >= since:
            dated.append((start, key))
    return [key for _, key in sorted(dated)]
