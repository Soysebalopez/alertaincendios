from fire_danger.supabase_io import forecast_rows, grid_state_row, state_row
from fire_danger.zones import ZONES


def test_forecast_rows_shape():
    zone = ZONES[0]
    computed = "2026-06-18"
    results = [
        {"target_date": "2026-06-18", "fwi": 10.1, "isi": 10.9, "bui": 8.5,
         "danger_class": "alto", "temp": 17.0, "rh": 42.0, "wind": 25.0, "precip": 0.0},
    ]
    rows = forecast_rows(zone.id, computed, results)
    assert rows[0] == {
        "zone_id": "tdf-norte-estepa", "computed_at": "2026-06-18",
        "target_date": "2026-06-18", "fwi": 10.1, "danger_class": "alto",
        "isi": 10.9, "bui": 8.5, "temp": 17.0, "rh": 42.0, "wind": 25.0, "precip": 0.0,
    }


def test_state_row_shape():
    assert state_row("tdf-sur-bosque", "2026-06-18", (87.7, 8.5, 19.0)) == {
        "zone_id": "tdf-sur-bosque", "date": "2026-06-18",
        "ffmc": 87.7, "dmc": 8.5, "dc": 19.0,
    }


def test_grid_state_row_shape():
    row = grid_state_row("tdf-norte-estepa", "2026-06-18",
                         [(87.7, 8.5, 19.0), (90.1, 12.0, 25.0)])
    assert row["zone_id"] == "tdf-norte-estepa"
    assert row["date"] == "2026-06-18"
    assert row["grid_state"] == [
        {"ffmc": 87.7, "dmc": 8.5, "dc": 19.0},
        {"ffmc": 90.1, "dmc": 12.0, "dc": 25.0},
    ]
    # legacy NOT-NULL scalars fall back to the first grid point
    assert (row["ffmc"], row["dmc"], row["dc"]) == (87.7, 8.5, 19.0)
