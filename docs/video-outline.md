# Video outline (≤10 min)

## Part 1: client pitch (≤5 min)

1. **The problem (30s):** "Every morning before 09:20 you buy tomorrow's power. Wind covers a big share of it, and you're buying against a forecast. Two questions: what did the forecast say when you had to decide, and how much should you trust it?"
2. **Decision timeline (60s):** drag the cutoff. Show the forecast runs lighting up, the auction gates, and "latest forecast in hand" changing from 04:30 → 07:30 → 09:30. Point out that a 09:00 decision misses the 09:30 run.
3. **Tomorrow's wind (90s):** pick a day such as 15 Jan. Read the headline: "count on 7.4 GW" against a forecast of 11.6 GW. Show the band and the actual line inside it. Step through a few days, including a calm one.
4. **Forecast accuracy (90s):** "Forecasts ran 1.7 GW high." Then MAE 2.0 GW, error growing with lead time, and the hour-of-day pattern. Move the cutoff to 12:00 to show that MAE drops to ~1.9 GW. That is the value of deciding later, or of a later forecast run.
5. **Next steps (30s):** more months and seasons, solar, demand, bias-corrected forecasts, alerts when the band is wide.

## Part 2: tech lead walkthrough (≤5 min)

1. **Architecture (60s):** React (Vite, TS, Recharts) → FastAPI → committed JSON snapshot ← `app/fetch.py` ← Elexon BMRS. One app serves the API and static UI, both in Docker and on Vercel.
2. **Domain rules in code (90s):** `analysis.select`, which picks the latest publish ≤ cutoff on D−1; scoring only on the hours; the likely range uses quantiles with the shown day left out. Explain why it's leave-one-out.
3. **Data facts found (45s):** 8 runs a day, ~66h horizon, hourly vs half-hourly resolution, 744 scored hours, UK time = UTC in January.
4. **Quality (45s):** `pytest` covers the cutoff boundary, the overwrite order, metrics on hand-computed numbers, real-snapshot API checks and 422 validation.
5. **Trade-offs and next steps (60s):** snapshot vs live fetch; no pandas; one month only; add timezone handling before BST; add caching per cutoff if traffic grows; AI-tool usage as stated in the README.
