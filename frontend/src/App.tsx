import { useEffect, useRef, useState } from 'react'
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { get, type Accuracy, type Day } from './api'

const FIRST = '2026-01-02'
const LAST = '2026-02-01'
// Forecast runs seen every day in the Jan 2026 WINDFOR data (UK time = UTC in January).
const RUNS = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30']
const GATES = ['09:20', '09:50'] // EPEX, N2EX day-ahead gate closures

// Chart colours: on the deep panel and on the dark glass cards.
const DEEP = { tick: 'rgba(224,232,255,0.6)', grid: 'rgba(224,232,255,0.1)', forecast: '#ffffff', actual: '#f0cfcb', band: '#6f86ff' }
const GLASS = { tick: 'rgba(224,232,255,0.5)', grid: 'rgba(224,232,255,0.08)', bar: '#8fa2ff', warm: '#e2bfbb' }

const gw = (mw: number | null | undefined, d = 1) => (mw == null ? '–' : (mw / 1000).toFixed(d))
const hhmm = (iso: string) => iso.slice(11, 16)
const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`
const dayList = () => { const out = []; for (let t = Date.parse(FIRST); t <= Date.parse(LAST); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out }
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })
const longDate = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
const mono = { fontFamily: 'var(--mono)', fontSize: 11 }

type Tab = 'day' | 'accuracy' | 'method'

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (['day', 'accuracy', 'method'].includes(location.hash.slice(1)) ? location.hash.slice(1) as Tab : 'day'))
  useEffect(() => { history.replaceState(null, '', `#${tab}`) }, [tab])
  const [cutoff, setCutoff] = useState(9)
  const [date, setDate] = useState('2026-01-15')

  return (
    <>
      <div className="sky" aria-hidden><i className="haze" /><i className="arc" /><i className="edge" /></div>
      <div className="shell">
        <header className="nav glass">
          <div className="brand"><img src="/logo.svg" alt="" />Wind Desk</div>
          <nav className="seg" aria-label="Views">
            {([['day', 'Tomorrow'], ['accuracy', 'Accuracy'], ['method', 'Method']] as const).map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>
          <span className="chip">Elexon BMRS · Jan 2026 pilot</span>
        </header>

        {tab === 'day' && <DayView date={date} setDate={setDate} cutoff={cutoff} setCutoff={setCutoff} />}
        {tab === 'accuracy' && <AccuracyView cutoff={cutoff} setCutoff={setCutoff} />}
        {tab === 'method' && <Method />}
      </div>
    </>
  )
}

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setError(null)
    get<T>(path).then((d) => live && setData(d)).catch((e) => live && setError(String(e)))
    return () => { live = false }
  }, [path])
  return { data, error }
}

function Timeline({ cutoff, setCutoff, step }: { cutoff: number; setCutoff: (h: number) => void; step?: number }) {
  const run = [...RUNS].reverse().find((r) => minutes(r) <= cutoff * 60)
  const pct = (t: string) => `${(minutes(t) / 1440) * 100}%`
  return (
    <section className="glass card timeline" aria-label="Decision time">
      <div className="card-head">
        <h2>{step && <span className="step">{step}</span>}Decision time</h2>
        <span className="pill">{pad(cutoff)} the day before</span>
      </div>
      <p className="muted small">
        Latest forecast in hand: <b>{run ? `${run} run` : '22:30 run, two days before'}</b>. Auctions close at 09:20 and 09:50.
      </p>
      <div className="track">
        <div className="known" style={{ width: pct(pad(cutoff)) }} />
        {GATES.map((g) => <span key={g} className="gate" style={{ left: pct(g) }} />)}
        {RUNS.map((r) => (
          <span key={r} className={`run${minutes(r) <= cutoff * 60 ? ' in' : ''}${r === run ? ' used' : ''}`} style={{ left: pct(r) }} />
        ))}
        <span className="handle" style={{ left: pct(pad(cutoff)) }} />
        <input
          type="range" min={0} max={23} value={cutoff} onChange={(e) => setCutoff(+e.target.value)}
          aria-label="Decision hour" aria-valuetext={`${pad(cutoff)}, using the ${run ?? 'previous evening'} forecast run`}
        />
      </div>
      <div className="ticks" aria-hidden>
        {[0, 6, 12, 18].map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{pad(h)}</span>)}
        <span style={{ right: 0 }}>24:00</span>
      </div>
      <p className="key small">
        <span><i className="k-run" />forecast published</span>
        <span><i className="k-gate" />auction closes</span>
      </p>
    </section>
  )
}

function DayStrip({ date, setDate, cutoff }: { date: string; setDate: (d: string) => void; cutoff: number }) {
  const { data } = useApi<Accuracy>(`/api/accuracy?cutoff=${cutoff}`)
  const ref = useRef<HTMLDivElement>(null)
  const miss = new Map<string, number[]>()
  data?.series.forEach((r) => { const k = r.t.slice(0, 10); miss.set(k, [...(miss.get(k) ?? []), Math.abs(r.error)]) })
  const dayMae = (d: string) => { const v = miss.get(d); return v ? v.reduce((a, b) => a + b, 0) / v.length : 0 }

  useEffect(() => {
    ref.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [date])

  return (
    <section className="glass card strip-card" aria-label="Delivery day">
      <div className="card-head">
        <h2><span className="step">2</span>Delivery day</h2>
        <span className="pill">{fmt(date, { month: 'long', year: 'numeric' })}</span>
      </div>
      <p className="muted small">Dot size shows how far that day’s forecast missed.</p>
      <div className="strip" ref={ref}>
        {dayList().map((d) => (
          <button key={d} className={d === date ? 'on' : ''} onClick={() => setDate(d)} aria-pressed={d === date} aria-label={longDate(d)}>
            <span className="wd">{fmt(d, { weekday: 'narrow' })}</span>
            <span className="dn">{+d.slice(8)}</span>
            <span className="miss" style={{ transform: `scale(${0.35 + Math.min(dayMae(d) / 4000, 1)})` }} />
          </button>
        ))}
      </div>
    </section>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <p>{children}</p>
    </div>
  )
}

function DayView({ date, setDate, cutoff, setCutoff }: { date: string; setDate: (d: string) => void; cutoff: number; setCutoff: (h: number) => void }) {
  const { data, error } = useApi<Day>(`/api/day?date=${date}&cutoff=${cutoff}`)
  const s = data?.summary

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">{longDate(date)} · decided the day before at {pad(cutoff)}</p>
        <h1>Count on <em>{gw(s?.meanLow)} GW</em> of wind</h1>
        <p className="lede">
          The forecast says {gw(s?.meanForecast)} GW on average. In January, metered wind came in above this
          planning level in 9 hours out of 10, so buy cover for the gap.
        </p>
      </section>

      <div className="controls">
        <Timeline cutoff={cutoff} setCutoff={setCutoff} step={1} />
        <DayStrip date={date} setDate={setDate} cutoff={cutoff} />
      </div>

      <section className="deep">
        {error && <p className="state">Couldn’t load {longDate(date)}. {error}</p>}
        {!data && !error && <p className="state">Loading {longDate(date)}…</p>}
        {data && s && (
          <>
            <div className="stats">
              <Stat label="Forecast in hand" value={`${gw(s.meanForecast)} GW`}>
                Average over the day, from the {data.publishTime ? `${longDate(data.publishTime)} ${hhmm(data.publishTime)}` : '–'} run.
              </Stat>
              <Stat label="Plan on" value={`${gw(s.meanLow)} GW`}>
                Lower edge of the likely range. The <b>lowest forecast hour</b> is {gw(s.minForecast)} GW.
              </Stat>
              <Stat label="What actually blew" value={`${gw(s.meanActual)} GW`}>
                Metered average for the day. A typical forecast miss is ±{gw(s.mae)} GW.
              </Stat>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={data.points} margin={{ top: 16, right: 4, bottom: 0, left: 12 }}>
                <CartesianGrid stroke={DEEP.grid} strokeDasharray="3 4" />
                <XAxis dataKey="t" tickFormatter={(t, i) => (i ? hhmm(t) : "")} interval={7} tick={{ ...mono, fill: DEEP.tick }} axisLine={false} tickLine={false} />
                <YAxis orientation="right" tickFormatter={(v) => `${gw(v, 0)} GW`} tick={{ ...mono, fill: DEEP.tick }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<DayTip />} cursor={{ stroke: 'rgba(255,255,255,0.4)' }} />
                <Area dataKey={(d) => [d.lo, d.hi]} fill={DEEP.band} fillOpacity={0.16} stroke="none" connectNulls isAnimationActive={false} />
                <Area dataKey={(d) => [d.lo50, d.hi50]} fill={DEEP.band} fillOpacity={0.3} stroke="none" connectNulls isAnimationActive={false} />
                <Line dataKey="forecast" stroke={DEEP.forecast} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="actual" stroke={DEEP.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="key small on-deep">
              <span><i className="k-line dash" />forecast</span>
              <span><i className="k-band" />likely range: 50% and 80% of January misses, this day left out</span>
              <span><i className="k-line sun" />actual</span>
            </p>
          </>
        )}
      </section>
    </main>
  )
}

function DayTip({ active, payload }: { active?: boolean; payload?: { payload: Day['points'][number] }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tip">
      <b>{hhmm(p.t)}</b>
      {p.forecast != null && <div>Forecast {gw(p.forecast, 2)} GW</div>}
      {p.lo != null && <div>Likely {gw(p.lo)}–{gw(p.hi)} GW</div>}
      <div>Actual {gw(p.actual, 2)} GW</div>
    </div>
  )
}

function AccuracyView({ cutoff, setCutoff }: { cutoff: number; setCutoff: (h: number) => void }) {
  const { data, error } = useApi<Accuracy>(`/api/accuracy?cutoff=${cutoff}`)
  const m = data?.metrics

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">744 delivery hours, 2 Jan – 1 Feb 2026</p>
        <h1>Forecasts ran <em>{gw(m && Math.abs(m.bias))} GW</em> {m && m.bias < 0 ? 'low' : 'high'}</h1>
        <p className="lede">
          That’s the average gap between the forecast in hand at {pad(cutoff)} the day before and metered wind.
          Move the decision time to see how much a later forecast run helps.
        </p>
      </section>

      <div className="controls single"><Timeline cutoff={cutoff} setCutoff={setCutoff} /></div>

      <section className="deep">
        {error && <p className="state">Couldn’t load accuracy. {error}</p>}
        {!data && !error && <p className="state">Scoring 744 delivery hours…</p>}
        {data && m && (
          <>
            <div className="stats four">
              <Stat label="Typical miss (MAE)" value={`${gw(m.mae, 2)} GW`}>Mean absolute error, which is {(m.nmae * 100).toFixed(0)}% of average output.</Stat>
              <Stat label="RMSE" value={`${gw(m.rmse, 2)} GW`}>Weights big misses more heavily than MAE does.</Stat>
              <Stat label="Median miss" value={`${m.p50 > 0 ? '+' : ''}${gw(m.p50)} GW`}>Half of all hours missed by more than this.</Stat>
              <Stat label="80% of misses" value={`${gw(m.p10)} to +${gw(m.p90)}`}>Forecast minus actual, in GW. Positive means the forecast was too high.</Stat>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.series} margin={{ top: 16, right: 4, bottom: 0, left: 12 }}>
                <CartesianGrid stroke={DEEP.grid} strokeDasharray="3 4" />
                <XAxis dataKey="t" tickFormatter={(t) => fmt(t, { day: 'numeric', month: 'short' }).toUpperCase()} minTickGap={50} tick={{ ...mono, fill: DEEP.tick }} axisLine={false} tickLine={false} />
                <YAxis orientation="right" tickFormatter={(v) => `${gw(v, 0)} GW`} tick={{ ...mono, fill: DEEP.tick }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={{ display: 'none' }} cursor={{ stroke: 'rgba(255,255,255,0.4)' }} />
                <Line dataKey="forecast" stroke={DEEP.forecast} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                <Line dataKey="actual" stroke={DEEP.actual} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="key small on-deep">
              <span><i className="k-line dash" />forecast in hand at {pad(cutoff)}</span>
              <span><i className="k-line sun" />actual</span>
            </p>
          </>
        )}
      </section>

      {data && (
        <div className="grid3">
          <ChartCard title="Spread of misses" note="Hours per 0.5 GW bin, forecast minus actual">
            <BarChart data={histogram(data.series.map((r) => r.error), 500)} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GLASS.grid} vertical={false} />
              <XAxis dataKey="x" tickFormatter={(v) => (v % 1000 ? '' : gw(v, 0))} interval={0} tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} width={28} />
              <Tooltip formatter={(v: number) => [`${v} hours`, 'Count']} labelFormatter={(x: number) => `${gw(x)} to ${gw(x + 500)} GW`} contentStyle={tipStyle} />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.5)" strokeDasharray="2 2" />
              <Bar dataKey="n" fill={GLASS.warm} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartCard>
          <ChartCard title="By hour of day" note="Typical miss (MAE), GW">
            <BarChart data={data.byHour} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GLASS.grid} vertical={false} />
              <XAxis dataKey="key" tickFormatter={(h) => pad(h).slice(0, 2)} interval={5} tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => gw(v)} tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} width={28} />
              <Tooltip formatter={(v: number) => [`${gw(v, 2)} GW`, 'MAE']} labelFormatter={(h: number) => pad(h)} contentStyle={tipStyle} />
              <Bar dataKey="mae" fill={GLASS.bar} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartCard>
          <ChartCard title="By lead time" note="Typical miss (MAE) of every January run, GW">
            <LineChart data={data.byLead} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GLASS.grid} vertical={false} />
              <XAxis dataKey="key" tickFormatter={(h) => `${h}h`} tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => gw(v)} tick={{ ...mono, fill: GLASS.tick }} axisLine={false} tickLine={false} width={28} domain={[0, 'auto']} />
              <Tooltip formatter={(v: number) => [`${gw(v, 2)} GW`, 'MAE']} labelFormatter={(h: number) => `${h}–${h + 6} hours ahead`} contentStyle={tipStyle} />
              <Line dataKey="mae" stroke={GLASS.bar} strokeWidth={2.5} dot={{ r: 3, fill: '#000', strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ChartCard>
        </div>
      )}
    </main>
  )
}

const tipStyle = { borderRadius: 12, border: '1px solid rgba(184,198,255,0.25)', background: 'rgba(2,4,30,0.88)', color: '#e0e8ff', fontFamily: 'var(--mono)', fontSize: 12 }

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactElement }) {
  return (
    <section className="glass card">
      <h2>{title}</h2>
      <p className="muted small">{note}</p>
      <ResponsiveContainer width="100%" height={200}>{children}</ResponsiveContainer>
    </section>
  )
}

function histogram(values: number[], width: number) {
  const bins = new Map<number, number>()
  for (const v of values) {
    const x = Math.floor(v / width) * width
    bins.set(x, (bins.get(x) ?? 0) + 1)
  }
  const keys = [...bins.keys()]
  const out = []
  for (let x = Math.min(...keys); x <= Math.max(...keys); x += width) out.push({ x, n: bins.get(x) ?? 0 })
  return out
}

function Method() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Method</p>
        <h1>How the <em>numbers</em> are made</h1>
      </section>
      <article className="glass card method">
        <h2>The question</h2>
        <p>
          Day-ahead power for delivery day D is bought on day D−1, before the GB auctions close (EPEX at 09:20, Nord Pool N2EX
          at 09:50 UK time). Wind depends on the weather, so the desk buys against a forecast. This tool shows the forecast that
          was actually in hand at decision time, and how far forecasts like it have missed in the past.
        </p>
        <h2>Data</h2>
        <ul>
          <li><b>Actual wind</b>: Elexon BMRS <code>FUELHH</code>, fuel type <code>WIND</code>, half-hourly national metered output.</li>
          <li><b>Forecast wind</b>: Elexon BMRS <code>WINDFOR</code>, an hourly national forecast published 8 times a day and reaching about 3 days ahead.</li>
          <li>Scope: purchase decisions made 1–31 January 2026, which means delivery days 2 January – 1 February 2026.</li>
        </ul>
        <h2>Rules</h2>
        <ul>
          <li>For each delivery hour, the forecast used is the latest one published at or before the decision time on the day before.</li>
          <li>A miss is forecast minus actual. Only hours with both values are scored; the half-past actuals are plotted but not scored.</li>
          <li>The likely range is the forecast shifted by the 10th–90th (outer band) and 25th–75th (inner band) percentiles of January’s misses. The day being viewed is left out, so it isn’t judged against itself.</li>
          <li>“Count on” is the average lower edge of the outer band. Metered wind beat it in about 9 hours out of 10.</li>
        </ul>
        <h2>Limits</h2>
        <ul>
          <li>This covers one winter month, so it says little about summer wind patterns.</li>
          <li>The forecast runs consistently high against metered output. Wind farms being curtailed and differences in what each dataset covers are likely causes. This pilot measures the gap rather than explaining it.</li>
        </ul>
      </article>
    </main>
  )
}
