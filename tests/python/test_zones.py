from fire_danger.zones import ZONES, Zone

# Phase-1 zone set (TDF + Patagonia). IDs are stable — they key rows in danger_zones
# and the per-zone cuts in danger_thresholds.json, so a rename is a breaking change.
EXPECTED_IDS = [
    "tdf-norte-estepa", "tdf-sur-bosque",
    "santa-cruz-estepa", "santa-cruz-bosque-andino",
    "chubut-estepa", "chubut-bosque-andino",
    "rio-negro-estepa", "rio-negro-bosque-andino",
    "neuquen-estepa", "neuquen-bosque-andino",
]


def test_tdf_zone_ids_stable():
    # The original two TDF zones must keep their ids and lead the list (regression guard).
    ids = [z.id for z in ZONES]
    assert ids[:2] == ["tdf-norte-estepa", "tdf-sur-bosque"]


def test_phase1_zone_set_present_and_unique():
    ids = [z.id for z in ZONES]
    assert ids == EXPECTED_IDS
    assert len(ids) == len(set(ids))  # ids unique


def test_zone_structural_invariants():
    for z in ZONES:
        assert isinstance(z, Zone)
        assert z.hemisphere == "south"
        assert z.province  # non-empty province id
        # representative point sits inside its own bbox
        s, n, w, e = z.bbox
        assert s <= z.lat <= n
        assert w <= z.lng <= e
        assert s < n and w < e  # well-formed box
