from datetime import date

from fastapi.testclient import TestClient

from app import analysis
from app.main import app

F = [  # (publishTime, startTime, MW), sorted by publishTime
    ("2026-01-01T04:30:00Z", "2026-01-02T00:00:00Z", 100),
    ("2026-01-01T07:30:00Z", "2026-01-02T00:00:00Z", 200),
    ("2026-01-01T09:30:00Z", "2026-01-02T00:00:00Z", 999),  # after a 09:00 cutoff
    ("2026-01-01T07:30:00Z", "2026-01-02T01:00:00Z", 300),
]
A = {"2026-01-02T00:00:00Z": 150, "2026-01-02T00:30:00Z": 160, "2026-01-02T01:00:00Z": 350}


def test_cutoff_is_previous_day():
    assert analysis.cutoff_for(date(2026, 1, 2), 9) == "2026-01-01T09:00:00Z"


def test_select_latest_before_cutoff():
    assert analysis.select(F, 9)["2026-01-02T00:00:00Z"] == ("2026-01-01T07:30:00Z", 200)
    assert analysis.select(F, 10)["2026-01-02T00:00:00Z"][1] == 999
    assert "2026-01-02T00:00:00Z" not in analysis.select(F, 3)


def test_metrics():
    errs = analysis.errors(F, A, 9)
    assert [e[3] for e in errs] == [50, -50]  # :30 actual isn't scored
    m = analysis.metrics(errs)
    assert (m["mae"], m["rmse"], m["bias"]) == (50, 50, 0)
    assert m["nmae"] == 50 / 250


def test_lead_time_buckets():
    lead = analysis.mae_by_lead(F, A)
    assert [b["key"] for b in lead] == [12, 18]  # 14.5h / 16.5h → 12; 19.5h → 18


def test_api_on_real_snapshot():
    c = TestClient(app)
    acc = c.get("/api/accuracy?cutoff=9").json()
    assert acc["metrics"]["n"] == 31 * 24  # every delivery hour has a forecast and an actual
    d = c.get("/api/day?date=2026-01-15").json()
    assert d["publishTime"] == "2026-01-14T07:30:00Z"
    assert len(d["points"]) == 48
    assert c.get("/api/day?date=2026-03-01").status_code == 422
    assert c.get("/api/accuracy?cutoff=24").status_code == 422
    m = acc["metrics"]
    assert m["p10"] < m["p25"] < m["p50"] < m["p75"] < m["p90"]
