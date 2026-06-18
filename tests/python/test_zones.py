from fire_danger.zones import ZONES, Zone


def test_two_tdf_zones_with_stable_ids():
    ids = [z.id for z in ZONES]
    assert ids == ["tdf-norte-estepa", "tdf-sur-bosque"]
    for z in ZONES:
        assert isinstance(z, Zone)
        assert z.province == "tierra-del-fuego"
        assert z.hemisphere == "south"
        # representative point sits inside its own bbox
        s, n, w, e = z.bbox
        assert s <= z.lat <= n
        assert w <= z.lng <= e
