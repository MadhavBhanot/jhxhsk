from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from . import analysis, data

app = FastAPI(title="Wind forecast monitor")

FIRST_DAY, LAST_DAY = date(2026, 1, 2), date(2026, 2, 1)
Cutoff = Query(9, ge=0, le=23, description="Decision hour (UK) on the day before delivery")


@app.get("/api/accuracy")
def accuracy(cutoff: int = Cutoff):
    return analysis.accuracy(data.forecasts(), data.actuals(), cutoff)


@app.get("/api/day")
def day(date: date = Query(...), cutoff: int = Cutoff):
    if not FIRST_DAY <= date <= LAST_DAY:
        raise HTTPException(422, f"date must be between {FIRST_DAY} and {LAST_DAY}")
    return analysis.day_view(data.forecasts(), data.actuals(), date, cutoff)


dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if dist.exists():  # absent in tests / API-only dev
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
