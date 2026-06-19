# tests/python/test_grids.py
from fire_danger.grids import grid_points
from fire_danger.zones import ZONES


def test_grid_points_loads_each_zone_inside_its_bbox():
    for zone in ZONES:
        pts = grid_points(zone.id)
        assert len(pts) > 10, f"{zone.id} grid too small"
        s, n, w, e = zone.bbox
        for lat, lng in pts:
            assert s <= lat <= n and w <= lng <= e


def test_grid_points_missing_zone_returns_empty_tuple():
    assert grid_points("does-not-exist") == ()
