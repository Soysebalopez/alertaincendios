"""WHI-907 part 6 — the 1-minute GOES-19 fire product (ABI-L2-FDCM) points
wherever NOAA puts its mesoscale sector. We only process a file when the
sector covers Bahía Blanca. Attribute names match a real file inspected on
2026-09-14 (that day's M1 sector covered the central US)."""
from datetime import datetime, timezone

import numpy as np
import pytest
import xarray as xr

from goes_mesoscale import coverage

BAHIA = (-38.72, -62.27)


def make_ds(west, east, south, north):
    attrs = {
        "geospatial_westbound_longitude": np.float32(west),
        "geospatial_eastbound_longitude": np.float32(east),
        "geospatial_southbound_latitude": np.float32(south),
        "geospatial_northbound_latitude": np.float32(north),
    }
    return xr.Dataset({"geospatial_lat_lon_extent": ((), np.float32(0.0), attrs)})


def test_the_real_us_sector_does_not_cover_bahia():
    extent = coverage.sector_extent(make_ds(-110.12125, -89.33973, 32.685875, 47.418747))
    assert coverage.covers(extent, BAHIA) is False


def test_a_sector_over_the_pampas_covers_bahia():
    extent = coverage.sector_extent(make_ds(-72.0, -52.0, -47.0, -30.0))
    assert coverage.covers(extent, BAHIA) is True


def test_a_point_on_the_edge_counts_as_covered():
    extent = coverage.sector_extent(make_ds(-62.27, -52.0, -47.0, -38.72))
    assert coverage.covers(extent, BAHIA) is True


def test_a_file_without_the_extent_variable_fails_loudly():
    with pytest.raises(ValueError):
        coverage.sector_extent(xr.Dataset())


def test_mesoscale_keys_since_keep_both_sectors_newest_window_only():
    keys = [
        "ABI-L2-FDCM/2026/257/14/OR_ABI-L2-FDCM1-M6_G19_s20262571400291_e20262571400349_c20262571400446.nc",
        "ABI-L2-FDCM/2026/257/14/OR_ABI-L2-FDCM2-M6_G19_s20262571400591_e20262571401049_c20262571401146.nc",
        "ABI-L2-FDCM/2026/257/13/OR_ABI-L2-FDCM1-M6_G19_s20262571350291_e20262571350349_c20262571350446.nc",
    ]
    since = datetime(2026, 9, 14, 13, 55, tzinfo=timezone.utc)
    assert coverage.keys_since(keys, since) == keys[:2]
