# scripts/fwi-validation/test_calibrate.py
from calibrate import thresholds_from_series


def test_thresholds_are_the_four_percentiles_and_monotonic():
    vals = [float(i) for i in range(1, 101)]   # 1..100
    out = thresholds_from_series({"z": vals})
    r = out["z"]
    assert set(r) == {"moderado", "alto", "muy alto", "extremo"}
    assert r["moderado"] < r["alto"] < r["muy alto"] < r["extremo"]
    # percentile(1..100, 97) ≈ 97.03 (linear interp)
    assert 96.0 < r["extremo"] < 98.0
    assert 29.0 < r["moderado"] < 31.0   # p30 ≈ 30.0


def test_raises_on_non_monotonic_series():
    import pytest
    # all-equal series -> percentiles collapse, not strictly increasing
    with pytest.raises(ValueError):
        thresholds_from_series({"z": [5.0] * 100})
