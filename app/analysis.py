"""Pure analysis: which forecast the desk had at decision time, and how wrong it was."""
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import sqrt
from statistics import fmean, quantiles


def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def cutoff_for(day: date, hour: int) -> str:
    """Decision for delivery `day` is taken on the previous day at `hour`:00 UK time."""
    return _iso(datetime(day.year, day.month, day.day) - timedelta(days=1) + timedelta(hours=hour))


def select(forecasts, hour):
    """{startTime: (publishTime, MW)} using, per target hour, the latest forecast published at or before
    that delivery day's cutoff. `forecasts` must be sorted by publishTime."""
    out = {}
    for pub, start, mw in forecasts:
        if pub <= cutoff_for(_dt(start).date(), hour):
            out[start] = (pub, mw)  # later publishes overwrite earlier ones
    return out


def errors(forecasts, actuals, hour):
    """[(startTime, forecast, actual, forecast - actual)] for every scored hour."""
    sel = select(forecasts, hour)
    return [(s, mw, actuals[s], mw - actuals[s]) for s, (_, mw) in sorted(sel.items()) if s in actuals]


def metrics(errs):
    e = [x[3] for x in errs]
    act = [x[2] for x in errs]
    p = quantiles(e, n=20, method="inclusive")  # 5% steps
    return {
        "n": len(e),
        "mae": fmean(abs(x) for x in e),
        "rmse": sqrt(fmean(x * x for x in e)),
        "bias": fmean(e),
        "nmae": fmean(abs(x) for x in e) / fmean(act),
        "p10": p[1], "p25": p[4], "p50": p[9], "p75": p[14], "p90": p[17],
    }


def mae_by(errs, key):
    groups = defaultdict(list)
    for row in errs:
        groups[key(row)].append(abs(row[3]))
    return [{"key": k, "mae": fmean(v), "n": len(v)} for k, v in sorted(groups.items())]


def mae_by_lead(forecasts, actuals, bucket=6):
    """MAE of every published forecast, grouped by hours-ahead (independent of the cutoff rule)."""
    rows = [(None, mw, actuals[s], mw - actuals[s], (_dt(s) - _dt(p)).total_seconds() / 3600)
            for p, s, mw in forecasts if s in actuals]
    return mae_by([r for r in rows if r[4] >= 0], lambda r: int(r[4] // bucket) * bucket)


def accuracy(forecasts, actuals, hour):
    errs = errors(forecasts, actuals, hour)
    return {
        "metrics": metrics(errs),
        "byHour": mae_by(errs, lambda r: int(r[0][11:13])),
        "byLead": mae_by_lead(forecasts, actuals),
        "series": [{"t": s, "forecast": f, "actual": a, "error": e} for s, f, a, e in errs],
    }


def day_view(forecasts, actuals, day: date, hour):
    """One delivery day: forecast used, actuals, and a P10–P90 band from the other days' errors."""
    prefix = day.isoformat()
    sel = select(forecasts, hour)
    # Leave the shown day out so the band isn't fitted on the very errors it's drawn against.
    m = metrics([r for r in errors(forecasts, actuals, hour) if not r[0].startswith(prefix)])
    start = datetime(day.year, day.month, day.day)
    points = []
    for i in range(48):
        t = _iso(start + timedelta(minutes=30 * i))
        f = sel.get(t, (None, None))[1]
        points.append({
            "t": t, "actual": actuals.get(t), "forecast": f,
            # error = forecast - actual, so actual ≈ forecast - error
            "lo": None if f is None else max(0.0, f - m["p90"]),
            "hi": None if f is None else f - m["p10"],
            "lo50": None if f is None else max(0.0, f - m["p75"]),
            "hi50": None if f is None else f - m["p25"],
        })
    fc = [p for p in points if p["forecast"] is not None]
    return {
        "date": prefix,
        "cutoff": cutoff_for(day, hour),
        "publishTime": max((sel[p["t"]][0] for p in fc), default=None),
        "points": points,
        "summary": {
            "meanForecast": fmean(p["forecast"] for p in fc) if fc else None,
            "minForecast": min((p["forecast"] for p in fc), default=None),
            "meanLow": fmean(p["lo"] for p in fc) if fc else None,
            "meanActual": fmean(a for p in points if (a := p["actual"]) is not None),
            "p10": m["p10"], "p90": m["p90"], "mae": m["mae"],
        },
    }
