# tests/python/test_grids.py
from fire_danger.grids import grid_points
from fire_danger.zones import ZONES


def test_grid_points_loads_each_zone_inside_its_bbox():
    # Province zones are capped at MAX_POINTS=10 land points (Open-Meteo free-tier
    # weight budget — see build_grids.py); TDF predates the cap (32/39). The floor
    # just guards against a degenerate/empty grid.
    for zone in ZONES:
        pts = grid_points(zone.id)
        assert len(pts) >= 5, f"{zone.id} grid too small ({len(pts)})"
        s, n, w, e = zone.bbox
        for lat, lng in pts:
            assert s <= lat <= n and w <= lng <= e


def test_grid_points_missing_zone_returns_empty_tuple():
    assert grid_points("does-not-exist") == ()
