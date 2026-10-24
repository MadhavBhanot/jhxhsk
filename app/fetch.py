"""Pull the January-2026 wind snapshot from Elexon BMRS into data/*.json.

Run: python -m app.fetch
"""
import json
import urllib.request
from datetime import date, timedelta

from .data import DATA_DIR, DELIVERY_END, DELIVERY_START

API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def chunks(start, end, days=7):
    while start < end:
        stop = min(start + timedelta(days=days), end)
        yield start, stop
        start = stop


def fetch_forecasts():
    # Publishes from Dec 30 so the first decision (Jan 1 morning) has history behind it.
    rows = []
    for a, b in chunks(date(2025, 12, 30), date(2026, 2, 1)):
        rows += get(f"{API}/WINDFOR/stream?publishDateTimeFrom={a}T00:00:00Z&publishDateTimeTo={b}T00:00:00Z")
    out = {(r["publishTime"], r["startTime"]): r["generation"] for r in rows
           if DELIVERY_START <= r["startTime"] < DELIVERY_END}
    return [[p, s, g] for (p, s), g in sorted(out.items())]


def fetch_actuals():
    rows = []
    for a, b in chunks(date(2026, 1, 2), date(2026, 2, 2)):
        rows += get(f"{API}/FUELHH/stream?settlementDateFrom={a}&settlementDateTo={b - timedelta(days=1)}&fuelType=WIND")
    out = {r["startTime"]: r["generation"] for r in rows if DELIVERY_START <= r["startTime"] < DELIVERY_END}
    return [[s, g] for s, g in sorted(out.items())]


if __name__ == "__main__":
    DATA_DIR.mkdir(exist_ok=True)
    for name, fn in [("windfor", fetch_forecasts), ("fuelhh", fetch_actuals)]:
        data = fn()
        (DATA_DIR / f"{name}.json").write_text(json.dumps(data, separators=(",", ":")))
        print(name, len(data), "rows")
