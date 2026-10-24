export type Metrics = { n: number; mae: number; rmse: number; bias: number; nmae: number; p10: number; p25: number; p50: number; p75: number; p90: number }
export type Bucket = { key: number; mae: number; n: number }
export type Accuracy = {
  metrics: Metrics
  byHour: Bucket[]
  byLead: Bucket[]
  series: { t: string; forecast: number; actual: number; error: number }[]
}
export type Point = { t: string; actual: number | null; forecast: number | null; lo: number | null; hi: number | null; lo50: number | null; hi50: number | null }
export type Day = {
  date: string
  cutoff: string
  publishTime: string | null
  points: Point[]
  summary: { meanForecast: number | null; minForecast: number | null; meanLow: number | null; meanActual: number; p10: number; p90: number; mae: number }
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}
