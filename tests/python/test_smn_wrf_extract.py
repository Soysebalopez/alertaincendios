"""WHI-907 part 4 — extract a small window of the SMN WRF 4 km forecast around
Bahía Blanca. Variable names, units and grid layout match the real files
(inspected 2026-09-14): 2D `lat`/`lon` coordinates, `magViento10` in m/s,
`dirViento10` in degrees, `T2` in °C and `HR2` in percent."""
import math

import numpy as np
import pytest
import xarray as xr

from smn_wrf import extract

BAHIA = (-38.72, -62.27)


def make_ds(speed_ms=10.0, direction=330.0, temp=25.0, rh=20.0, units="meter / second"):
    lats = np.array([[-38.68] * 3, [-38.72] * 3, [-38.76] * 3])
    lons = np.array([[-62.32, -62.27, -62.22]] * 3)
    shape = (1, 3, 3)
    return xr.Dataset(
        data_vars={
            "magViento10": (("time", "y", "x"), np.full(shape, speed_ms), {"units": units}),
            "dirViento10": (("time", "y", "x"), np.full(shape, direction), {"units": "degree"}),
            "T2": (("time", "y", "x"), np.full(shape, temp), {"units": "degree_Celsius"}),
            "HR2": (("time", "y", "x"), np.full(shape, rh), {"units": "percent"}),
        },
        coords={"lat": (("y", "x"), lats), "lon": (("y", "x"), lons)},
    )


def test_parse_key_gives_run_and_valid_time():
    key = "DATA/WRF/DET/2026/09/14/00/WRFDETAR_01H_20260914_00_003.nc"
    assert extract.parse_key(key) == ("2026-09-14T00:00:00Z", "2026-09-14T03:00:00Z")


def test_parse_key_crosses_midnight():
    key = "DATA/WRF/DET/2026/09/14/12/WRFDETAR_01H_20260914_12_015.nc"
    assert extract.parse_key(key) == ("2026-09-14T12:00:00Z", "2026-09-15T03:00:00Z")


def test_parse_key_rejects_other_files():
    with pytest.raises(ValueError):
        extract.parse_key("DATA/WRF/DET/2026/09/14/00/README.txt")


def test_small_radius_returns_only_the_nearest_cell_with_converted_values():
    rows = extract.points_near(make_ds(), *BAHIA, radius_km=2)
    assert len(rows) == 1
    row = rows[0]
    assert (row["lat"], row["lng"]) == BAHIA
    assert row["wind_kmh"] == pytest.approx(36.0)  # 10 m/s
    assert row["wind_from_deg"] == pytest.approx(330.0)
    assert row["temp_c"] == pytest.approx(25.0)
    assert row["rh_pct"] == pytest.approx(20.0)


def test_larger_radius_includes_the_neighbours():
    # Grid spacing is ~4.4 km; the 9 cells are all within 10 km of the center.
    assert len(extract.points_near(make_ds(), *BAHIA, radius_km=10)) == 9


def test_direction_is_normalised_to_0_360():
    rows = extract.points_near(make_ds(direction=360.0), *BAHIA, radius_km=2)
    assert rows[0]["wind_from_deg"] == pytest.approx(0.0)


def test_missing_values_are_skipped():
    ds = make_ds()
    ds["magViento10"].values[0, 1, 1] = math.nan
    rows = extract.points_near(ds, *BAHIA, radius_km=2)
    assert rows == []


def test_unknown_speed_units_fail_loudly():
    with pytest.raises(ValueError):
        extract.points_near(make_ds(units="knots"), *BAHIA, radius_km=2)
