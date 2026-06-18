from fire_danger import fwi


def test_ffmc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.ffmc(d["input"]["temp"], d["input"]["rh"], d["input"]["wind"],
                   d["input"]["rain"], d["prev"]["ffmc"])
    assert round(got, 1) == d["expect"]["ffmc"]  # 87.7


def test_ffmc_clamped_to_101():
    assert fwi.ffmc(35.0, 5.0, 40.0, 0.0, 99.0) <= 101.0


def test_dmc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.dmc(d["input"]["temp"], d["input"]["rh"], d["input"]["rain"],
                  d["prev"]["dmc"], d["input"]["month"], d["input"]["hemisphere"])
    assert round(got, 1) == d["expect"]["dmc"]  # 8.5


def test_dc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.dc(d["input"]["temp"], d["input"]["rain"], d["prev"]["dc"],
                 d["input"]["month"], d["input"]["hemisphere"])
    assert round(got, 1) == d["expect"]["dc"]  # 19.0


def test_isi_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.isi(d["input"]["wind"], d["expect"]["ffmc"])
    assert round(got, 1) == d["expect"]["isi"]  # 10.9
