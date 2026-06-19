import pandas as pd
from metrics import align, season, compute_metrics

def test_align_joins_on_point_and_date():
    a = pd.DataFrame({"point": ["x"], "date": ["2020-01-01"], "fwi_ours": [10.0]})
    b = pd.DataFrame({"point": ["x"], "date": ["2020-01-01"], "fwi_cems": [9.0]})
    m = align(a, b)
    assert len(m) == 1 and m.iloc[0]["fwi_ours"] == 10.0 and m.iloc[0]["fwi_cems"] == 9.0

def test_season_maps_months():
    assert season("2020-01-15") == "verano"
    assert season("2020-07-15") == "invierno"

def test_metrics_perfect_correlation():
    df = pd.DataFrame({
        "point": ["x"]*4, "date": ["2020-12-01","2020-12-02","2020-07-01","2020-07-02"],
        "fwi_ours": [10.0, 20.0, 1.0, 2.0], "fwi_cems": [8.0, 18.0, 0.5, 1.5],
    })
    r = compute_metrics(df)
    assert r["spearman"] > 0.99
    assert abs(r["mean_bias"] - 1.25) < 1e-6
    assert "verano" in r["bias_by_season"] and "invierno" in r["bias_by_season"]
