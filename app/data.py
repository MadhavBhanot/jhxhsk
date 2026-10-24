import json
from functools import cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Decisions made Jan 1–31 2026 → delivery days Jan 2 – Feb 1.
# shortcut: London == UTC in Jan/Feb (GMT); needs zoneinfo if the window ever spans BST.
DELIVERY_START = "2026-01-02T00:00:00Z"
DELIVERY_END = "2026-02-02T00:00:00Z"


@cache
def forecasts():
    """[(publishTime, startTime, MW)], ISO-8601 UTC strings sort chronologically."""
    return [tuple(r) for r in json.loads((DATA_DIR / "windfor.json").read_text())]


@cache
def actuals():
    """{startTime: MW}, half-hourly."""
    return dict(json.loads((DATA_DIR / "fuelhh.json").read_text()))
