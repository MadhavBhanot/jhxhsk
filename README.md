# Wind Desk

A pilot tool for a GB utility's day-ahead buying desk. It answers two questions for January 2026:

1. **What wind forecast did we have when we had to buy?** For each delivery day, it shows the latest national wind forecast published before the decision time on the day before. The decision time defaults to 09:00, just before the EPEX (09:20) and N2EX (09:50) day-ahead auctions close.
2. **How far off are those forecasts?** MAE, RMSE, bias, error as a % of mean output, the 10th/50th/90th percentile errors, error by hour of day and by lead time. On each day the forecast is drawn with a likely range, which gives one buying number: *"count on X GW"*.

**Live app:** https://winddesk-pearl.vercel.app

## Run it

**Docker** (API and UI on one port):

```bash
docker build -t wind-desk .
docker run -p 8000:8000 wind-desk
```

Then open http://localhost:8000.

**Without Docker:**

```bash
pip install -r requirements-dev.txt
cd frontend && npm ci && npm run build && cd ..
uvicorn app.main:app --port 8000
```

For frontend hot reload, run `cd frontend && npm run dev` (port 5173; it proxies `/api` to port 8000).

**Tests:** `pytest`

**Refresh the data snapshot:** `python -m app.fetch` (pulls from the public Elexon BMRS API; no key needed).

**Deploy:** import the repo into Vercel. `vercel.json` uses [Vercel Services](https://vercel.com/docs/services): the React app (`frontend/`) is built and served as static files, the FastAPI app (`app.main:app`) runs as a function, and `/api/*` is routed to it. Docker runs the same FastAPI app, which also serves the built UI itself.

## Files

| Path | What it is |
|---|---|
| `app/fetch.py` | Downloads WINDFOR (forecast) and FUELHH WIND (actual) for the January 2026 window into `data/` |
| `app/data.py` | Loads the snapshot; holds the delivery window constants |
| `app/analysis.py` | Pure functions: forecast selection at the cutoff, errors, metrics, MAE by hour and by lead time, single-day view |
| `app/main.py` | FastAPI: `GET /api/day?date=&cutoff=`, `GET /api/accuracy?cutoff=`; also serves `frontend/dist` |
| `data/windfor.json`, `data/fuelhh.json` | Committed snapshot: `[publishTime, startTime, MW]` and `[startTime, MW]` |
| `tests/test_analysis.py` | Unit tests on hand-built fixtures, plus API checks against the real snapshot |
| `frontend/src/App.tsx` | The React app: decision timeline, "Tomorrow's wind", "Forecast accuracy", "How it works" |
| `frontend/src/api.ts` | Response types and fetch helper |
| `frontend/src/index.css` | All styling |
| `Dockerfile` | Multi-stage: Node builds the UI, Python serves API and UI |
| `vercel.json` | Vercel Services config: `web` (Vite) and `api` (FastAPI) services, with `/api/*` routed to the API |
| `docs/video-outline.md` | Script for the demo video |

## Method

- **Scope:** purchase decisions made 1–31 Jan 2026, i.e. delivery days 2 Jan – 1 Feb 2026. In January, UK time equals UTC, so no timezone conversion is needed (noted in `app/data.py`).
- **Forecast in hand:** for each delivery hour, the latest WINDFOR value with `publishTime ≤ cutoff on D−1`. Forecast runs are published at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30, so a 09:00 decision uses the 07:30 run.
- **Scoring:** error = forecast − actual, on the hours where both exist. WINDFOR is hourly and FUELHH is half-hourly, so the :30 actuals are plotted but not scored. That gives 744 scored hours per cutoff.
- **Likely range:** forecast − P90 error to forecast − P10 error, using January errors with the displayed day left out.
- **Main finding:** at a 09:00 cutoff the forecast ran about 1.7 GW above metered wind (MAE 2.0 GW, 18% of mean output), and error grows steadily with lead time. The pilot measures this gap but doesn't explain it. Likely causes are curtailment and differences in what each dataset covers.

## Design choices

- **Committed snapshot, not live calls:** January 2026 is history and won't change. The demo can't break if Elexon is slow or down, and serverless cold starts stay fast.
- **Standard-library analysis, no pandas:** ~18k rows is small, the function bundle stays light, and the logic is easy to unit-test.
- **One FastAPI app serves both API and UI:** the same code runs in Docker and on Vercel.

## AI tools

This project was built with help from Claude Code (Anthropic). It was used for planning, domain research, writing code and tests, and checking the UI in a browser. All design decisions and outputs were reviewed by the author.
