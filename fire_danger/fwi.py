"""Canadian Forest Fire Weather Index (FWI) System — the six standard equations
of Van Wagner & Pickett (1985), as used by the Argentine SNMF/SMN. Pure floats,
stdlib math only. Wind in km/h, temp in C, rh in %, rain in mm (last 24h)."""
from __future__ import annotations

import math

from fire_danger.daylength import dc_daylength, dmc_daylength


def ffmc(temp: float, rh: float, wind: float, rain: float, ffmc_prev: float) -> float:
    rh = min(rh, 100.0)
    mo = 147.2 * (101.0 - ffmc_prev) / (59.5 + ffmc_prev)
    if rain > 0.5:
        rf = rain - 0.5
        if mo <= 150.0:
            mr = mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
        else:
            mr = (mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
                  + 0.0015 * (mo - 150.0) ** 2 * math.sqrt(rf))
        mo = min(mr, 250.0)
    ed = (0.942 * rh ** 0.679 + 11.0 * math.exp((rh - 100.0) / 10.0)
          + 0.18 * (21.1 - temp) * (1.0 - math.exp(-0.115 * rh)))
    if mo > ed:
        ko = 0.424 * (1.0 - (rh / 100.0) ** 1.7) + 0.0694 * math.sqrt(wind) * (1.0 - (rh / 100.0) ** 8)
        kd = ko * 0.581 * math.exp(0.0365 * temp)
        m = ed + (mo - ed) * 10.0 ** (-kd)
    else:
        ew = (0.618 * rh ** 0.753 + 10.0 * math.exp((rh - 100.0) / 10.0)
              + 0.18 * (21.1 - temp) * (1.0 - math.exp(-0.115 * rh)))
        if mo < ew:
            kl = (0.424 * (1.0 - ((100.0 - rh) / 100.0) ** 1.7)
                  + 0.0694 * math.sqrt(wind) * (1.0 - ((100.0 - rh) / 100.0) ** 8))
            kw = kl * 0.581 * math.exp(0.0365 * temp)
            m = ew - (ew - mo) * 10.0 ** (-kw)
        else:
            m = mo
    result = 59.5 * (250.0 - m) / (147.2 + m)
    return max(0.0, min(result, 101.0))


def dmc(temp: float, rh: float, rain: float, dmc_prev: float,
        month: int, hemisphere: str) -> float:
    rh = min(rh, 100.0)
    t = max(temp, -1.1)
    le = dmc_daylength(month, hemisphere)
    rk = 1.894 * (t + 1.1) * (100.0 - rh) * le * 1e-4
    if rain > 1.5:
        re = 0.92 * rain - 1.27
        mo = 20.0 + math.exp(5.6348 - dmc_prev / 43.43)
        if dmc_prev <= 33.0:
            b = 100.0 / (0.5 + 0.3 * dmc_prev)
        elif dmc_prev <= 65.0:
            b = 14.0 - 1.3 * math.log(dmc_prev)
        else:
            b = 6.2 * math.log(dmc_prev) - 17.2
        mr = mo + 1000.0 * re / (48.77 + b * re)
        pr = 244.72 - 43.43 * math.log(mr - 20.0)
        dmc_prev = max(pr, 0.0)
    return max(dmc_prev + rk, 0.0)


def dc(temp: float, rain: float, dc_prev: float, month: int, hemisphere: str) -> float:
    t = max(temp, -2.8)
    lf = dc_daylength(month, hemisphere)
    pe = max((0.36 * (t + 2.8) + lf) / 2.0, 0.0)
    if rain > 2.8:
        rd = 0.83 * rain - 1.27
        qo = 800.0 * math.exp(-dc_prev / 400.0)
        qr = qo + 3.937 * rd
        dr = 400.0 * math.log(800.0 / qr)
        dc_prev = max(dr, 0.0)
    return max(dc_prev + pe, 0.0)
