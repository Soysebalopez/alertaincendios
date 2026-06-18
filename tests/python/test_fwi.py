from fire_danger import fwi


def test_ffmc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.ffmc(d["input"]["temp"], d["input"]["rh"], d["input"]["wind"],
                   d["input"]["rain"], d["prev"]["ffmc"])
    assert round(got, 1) == d["expect"]["ffmc"]  # 87.7


def test_ffmc_clamped_to_101():
    assert fwi.ffmc(35.0, 5.0, 40.0, 0.0, 99.0) <= 101.0
