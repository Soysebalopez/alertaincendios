"""WHI-907 part 2 — real lightning flashes from the GOES-19 GLM L2 product.
Variable names and units match the real files (inspected 2026-09-14): the
flash time is an offset in seconds whose base date lives in the `units`
attribute; files are opened with decode_times=False."""
import numpy as np
import pytest
import xarray as xr

from glm import extract

ARGENTINA_SOUTH = (-56.0, -74.0, -21.0, -53.0)  # (min_lat, min_lng, max_lat, max_lng)
UNITS = "seconds since 2026-09-14 14:00:00.000"


def make_glm(lats, lons, offsets, quality=None, units=UNITS):
    n = len(lats)
    dim = ("number_of_flashes",)
    return xr.Dataset(
        data_vars={
            "flash_lat": (dim, np.array(lats, dtype="float32")),
            "flash_lon": (dim, np.array(lons, dtype="float32")),
            "flash_time_offset_of_first_event": (dim, np.array(offsets, dtype="float64"), {"units": units}),
            "flash_energy": (dim, np.full(n, 2.5e-14)),
            "flash_area": (dim, np.full(n, 1.1e8)),
            "flash_quality_flag": (dim, np.array(quality if quality is not None else [0] * n, dtype="int16")),
        },
        attrs={"time_coverage_start": "2026-09-14T14:00:00.0Z"},
    )


def test_keeps_only_flashes_inside_the_bbox():
    ds = make_glm(lats=[-38.7, -20.0], lons=[-62.3, -45.0], offsets=[1.0, 2.0])
    flashes = extract.flashes_in_bbox(ds, ARGENTINA_SOUTH)
    assert len(flashes) == 1
    assert flashes[0]["lat"] == pytest.approx(-38.7, abs=1e-4)
    assert flashes[0]["lng"] == pytest.approx(-62.3, abs=1e-4)


def test_flash_time_comes_from_the_units_base_plus_offset():
    ds = make_glm(lats=[-38.7], lons=[-62.3], offsets=[5.5])
    assert extract.flashes_in_bbox(ds, ARGENTINA_SOUTH)[0]["flash_at"] == "2026-09-14T14:00:05.500Z"


def test_units_without_milliseconds_also_parse():
    ds = make_glm(lats=[-38.7], lons=[-62.3], offsets=[0.25], units="seconds since 2026-09-14 14:00:20")
    assert extract.flashes_in_bbox(ds, ARGENTINA_SOUTH)[0]["flash_at"] == "2026-09-14T14:00:20.250Z"


def test_bad_quality_flashes_are_dropped():
    ds = make_glm(lats=[-38.7, -38.8], lons=[-62.3, -62.4], offsets=[1.0, 2.0], quality=[0, 3])
    assert len(extract.flashes_in_bbox(ds, ARGENTINA_SOUTH)) == 1


def test_energy_and_area_are_kept():
    flash = extract.flashes_in_bbox(make_glm(lats=[-38.7], lons=[-62.3], offsets=[1.0]), ARGENTINA_SOUTH)[0]
    assert flash["energy_j"] == pytest.approx(2.5e-14)
    assert flash["area_m2"] == pytest.approx(1.1e8)


def test_a_file_without_flashes_returns_an_empty_list():
    assert extract.flashes_in_bbox(make_glm(lats=[], lons=[], offsets=[]), ARGENTINA_SOUTH) == []


def test_decoded_times_are_rejected():
    """If someone opens the file with decode_times=True the offsets become
    datetimes and the units attribute disappears: fail loudly, don't guess."""
    ds = make_glm(lats=[-38.7], lons=[-62.3], offsets=[1.0])
    del ds["flash_time_offset_of_first_event"].attrs["units"]
    with pytest.raises(ValueError):
        extract.flashes_in_bbox(ds, ARGENTINA_SOUTH)
