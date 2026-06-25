# scripts/fwi-validation/test_calibrate.py
from calibrate import thresholds_from_series
from fire_danger.classify import GLOBAL_FLOOR


def test_thresholds_are_the_four_percentiles_and_monotonic():
    vals = [float(i) for i in range(1, 101)]   # 1..100 — percentiles sit above the floor
    out = thresholds_from_series({"z": vals})
    r = out["z"]
    assert set(r) == {"moderado", "alto", "muy alto", "extremo"}
    assert r["moderado"] < r["alto"] < r["muy alto"] < r["extremo"]
    # percentile(1..100, 97) ≈ 97.03 (linear interp); floor (30) does not bind
    assert 96.0 < r["extremo"] < 98.0
    assert 29.0 < r["moderado"] < 31.0   # p30 ≈ 30.0, above the floor (5)


def test_floor_rescues_a_low_danger_zone():
    # A wet zone: >30% of days FWI 0 so p30=0, and all percentiles below the floor.
    # Without the floor this gives moderado=0 (no "bajo" class) and absurd "alto".
    vals = [0.0] * 40 + [1.0] * 30 + [3.0] * 20 + [6.0] * 7 + [9.0] * 3
    r = thresholds_from_series({"z": vals})["z"]
    assert r == GLOBAL_FLOOR                       # every cut floored to the generic minimum
    assert r["moderado"] >= 5.0                     # FWI 0 now classifies as "bajo", not "moderado"


def test_floor_only_lifts_below_floor_cuts():
    # Mixed: low p30 (floored) but high upper percentiles (kept from the zone).
    vals = [0.0] * 35 + [40.0] * 35 + [60.0] * 20 + [90.0] * 10
    r = thresholds_from_series({"z": vals})["z"]
    assert r["moderado"] == GLOBAL_FLOOR["moderado"]   # p30=0 -> floored
    assert r["alto"] > GLOBAL_FLOOR["alto"]            # p70 high -> kept (per-zone)
    assert r["extremo"] > GLOBAL_FLOOR["extremo"]


def test_raises_on_pathological_constant_high_series():
    import pytest
    # Constant high series: every percentile equal AND above all floors -> floored cuts
    # stay equal -> not strictly increasing. (Cannot happen for a real FWI series.)
    with pytest.raises(ValueError):
        thresholds_from_series({"z": [100.0] * 100})
