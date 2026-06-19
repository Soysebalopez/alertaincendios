"""Compare our FWI vs CEMS: metrics + plots + REPORT.md.

Reads ours_tdf.csv (compute_ours.py) and cems_tdf.csv (fetch_cems.py), computes
correlation + bias per point (via metrics.py), draws scatter plots, and writes
the verdict per the validation spec. The inner join restricts to the common
period (CEMS is 2014-2022, ours runs to 2023).
"""
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from metrics import align, compute_metrics  # noqa: E402


def verdict(spearman: float) -> str:
    if spearman > 0.85:
        return "**CONFIABLE** — luz verde a grilla + calibración por percentiles."
    if spearman >= 0.7:
        return "**ACEPTABLE con reservas** — revisar sesgo/inputs antes de comparar números absolutos."
    return "**PROBLEMA** — correlación baja; investigar el motor/inputs antes de avanzar."


def main() -> None:
    ours = pd.read_csv("ours_tdf.csv")
    cems = pd.read_csv("cems_tdf.csv")
    merged = align(ours, cems)

    lines = ["# Validación FWI — nuestro motor vs CEMS reanalysis (TDF, 2014–2022)\n"]
    lines.append(f"Días comparados (intersección): **{len(merged)}**\n")
    worst_sp = 1.0
    for point in sorted(merged["point"].unique()):
        sub = merged[merged["point"] == point]
        m = compute_metrics(sub)
        worst_sp = min(worst_sp, m["spearman"])
        lines.append(f"## {point}\n")
        lines.append(f"- n días: {m['n']}")
        lines.append(f"- **Spearman: {m['spearman']:.3f}** · Pearson: {m['pearson']:.3f}")
        lines.append(f"- Sesgo medio (nuestro − CEMS): {m['mean_bias']:+.2f}")
        lines.append("- Sesgo por temporada: "
                     + ", ".join(f"{k} {v:+.2f}" for k, v in m["bias_by_season"].items()) + "\n")
        plt.figure(figsize=(4, 4))
        plt.scatter(sub["fwi_cems"], sub["fwi_ours"], s=3, alpha=0.3)
        lim = max(sub["fwi_cems"].max(), sub["fwi_ours"].max())
        plt.plot([0, lim], [0, lim], "r--", lw=1)
        plt.xlabel("CEMS"); plt.ylabel("nuestro"); plt.title(f"{point} FWI")
        plt.tight_layout(); plt.savefig(f"scatter_{point}.png", dpi=80); plt.close()
        lines.append(f"![scatter {point}](scatter_{point}.png)\n")

    lines.append("## Veredicto\n")
    lines.append(verdict(worst_sp))
    with open("REPORT.md", "w") as f:
        f.write("\n".join(lines))
    print("wrote REPORT.md; worst Spearman =", round(worst_sp, 3))


if __name__ == "__main__":
    main()
