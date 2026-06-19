"""Pure metrics for the FWI validation: align two series and compute
correlation + bias (overall and by austral season)."""
import pandas as pd
from scipy.stats import spearmanr, pearsonr

def align(ours: pd.DataFrame, cems: pd.DataFrame) -> pd.DataFrame:
    return ours.merge(cems, on=["point", "date"], how="inner")

def season(date_str: str) -> str:
    m = int(date_str[5:7])
    return "verano" if m in (12, 1, 2, 3) else "invierno" if m in (6, 7, 8, 9) else "transicion"

def compute_metrics(df: pd.DataFrame) -> dict:
    d = df.dropna(subset=["fwi_ours", "fwi_cems"])
    sp = spearmanr(d["fwi_ours"], d["fwi_cems"]).correlation
    pe = pearsonr(d["fwi_ours"], d["fwi_cems"])[0]
    mean_bias = float((d["fwi_ours"] - d["fwi_cems"]).mean())
    by_season = {}
    d = d.assign(_season=d["date"].map(season))
    for s, g in d.groupby("_season"):
        by_season[s] = float((g["fwi_ours"] - g["fwi_cems"]).mean())
    return {"n": len(d), "spearman": float(sp), "pearson": float(pe),
            "mean_bias": mean_bias, "bias_by_season": by_season}
