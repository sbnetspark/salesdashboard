// src/ManagementDashboard.js
import React, { useEffect, useState } from "react";
import NavBar from "./NavBar";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Line,
} from "recharts";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import "./App.css";
import { getUserRole, ROLES } from "./utils/getUserRole";

/* ---------- constants & helpers ---------- */
const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const getAll2025Months = () => MONTH_ORDER.map((m) => `${m} 2025`);

const BRAND_BLUE   = "var(--color-brand-blue-light)";
const BRAND_ORANGE = "var(--color-brand-orange)";
const BRAND_GREEN  = "var(--color-success)";
const BRAND_RED    = "var(--color-error)";

const isDarkMode = () =>
  typeof window !== "undefined" &&
  (document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches);

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v ?? 0);

const getEffectiveMRC = (mrc = 0, type = "") =>
  type.toLowerCase().includes("upgrade") ? 15 : mrc;

/* ---------- tooltip ---------- */
const CustomTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="recharts-tooltip">
      <p className="label" style={{ fontWeight: 600 }}>{label}</p>
      <p style={{ color: "var(--color-brand-orange)", fontWeight: 500, margin: 0 }}>
        Wireless (Mobility) MRC: {formatCurrency(payload.find(p => p.dataKey === "wireless")?.value || 0)}
      </p>
      <p style={{ color: "var(--color-brand-blue-light)", fontWeight: 500, margin: 0 }}>
        Wireline MRC: {formatCurrency(payload.find(p => p.dataKey === "wireline")?.value || 0)}
      </p>
      <p style={{ color: "var(--color-success)", fontWeight: 700, margin: "8px 0 0 0" }}>
        Total: {formatCurrency(payload.find(p => p.dataKey === "total")?.value ||
          ((payload.find(p => p.dataKey === "wireless")?.value || 0) +
           (payload.find(p => p.dataKey === "wireline")?.value || 0)
          ))}
      </p>
    </div>
  ) : null;

/* ---------- data builders ---------- */
function buildMonthlyTrend(rows) {
  const agg = Object.fromEntries(
    getAll2025Months().map((m) => [m, { wireline: 0, wireless: 0, total: 0 }])
  );
  rows.forEach((r) => {
    if (!r.Month || !agg[r.Month]) return;
    const eff = getEffectiveMRC(r.MRC, r.Type);
    const key = r.Type?.toLowerCase().includes("wireline") ? "wireline" : "wireless";
    agg[r.Month][key]  += eff;
    agg[r.Month].total += eff;
  });
  return getAll2025Months().map((m) => ({ month: m, ...agg[m] }));
}

function buildWireMob(rows) {
  let wire = 0, mob = 0;
  rows.forEach((r) => {
    if (typeof r.Month !== "string" || !r.Month.includes("2025")) return;
    const eff = getEffectiveMRC(r.MRC, r.Type);
    r.Type?.toLowerCase().includes("wireline") ? (wire += eff) : (mob += eff);
  });
  return [
    { name: "Wireline", value: wire },
    { name: "Mobility", value: mob },
  ];
}

function buildRankForMonth(rows, month) {
  const map = {};
  rows.forEach((r) => {
    if (r.Month !== month) return;
    const seller = r.Seller || "Unknown";
    map[seller] = (map[seller] ?? 0) + getEffectiveMRC(r.MRC, r.Type);
  });
  return Object.entries(map)
    .map(([seller, total]) => ({ seller, total }))
    .sort((a, b) => b.total - a.total)
    .map((obj, i) => ({ ...obj, rank: i + 1 }));
}
const buildAllRanks = (rows) =>
  Object.fromEntries(getAll2025Months().map((m) => [m, buildRankForMonth(rows, m)]));

function buildYTDTotals(rows) {
  const map = {};
  rows
    .filter((r) => typeof r.Month === "string" && r.Month.includes("2025"))
    .forEach((r) => {
      const s = r.Seller || "Unknown";
      map[s] = (map[s] ?? 0) + getEffectiveMRC(r.MRC, r.Type);
    });
  return Object.entries(map)
    .map(([s, t]) => ({ s, t }))
    .sort((a, b) => b.t - a.t)
    .reduce((acc, cur, i) => {
      acc[cur.s] = { total: cur.t, rank: i + 1 };
      return acc;
    }, {});
}

/* ---------- quota data (unchanged) ---------- */
const monthlyQuotas = [
  { Representative: "Adam Meyer", Quota: 0 },
  { Representative: "Alicha Gricher", Quota: 6250 },
  { Representative: "Anthony Pantone", Quota: 8333 },
  { Representative: "Chris Kim", Quota: 15000 },
  { Representative: "Jesse Doyle", Quota: 10833 },
  { Representative: "Josh Rexwinkle", Quota: 8333 },
  { Representative: "Justin Logan", Quota: 7500 },
  { Representative: "Liz Deering", Quota: 7500 },
  { Representative: "Marc Sepulveda", Quota: 8666 },
  { Representative: "Marty Berke", Quota: 8000 },
  { Representative: "Michael Soo/Scott Mitchell", Quota: 8333 },
  { Representative: "Phil Hollenberg", Quota: 10000 },
  { Representative: "Randy Fuqua", Quota: 12500 },
  { Representative: "Suzette VanWyhe", Quota: 3750 },
  { Representative: "Tara Stiller", Quota: 6667 },
  { Representative: "Terry Patti", Quota: 7100 },
  { Representative: "Zach Moffett", Quota: 14166 },
];

/* =================================================================== */
/*                          Main component                             */
/* =================================================================== */
function ManagementDashboard({ theme, setTheme }) {
  const [loading, setLoading]   = useState(true);
  const [user, setUser]         = useState(null);
  const [isMgmt, setIsMgmt]     = useState(false);
  const [sales, setSales]       = useState([]);
  const [error, setError]       = useState("");

  const [ytd, setYtd]           = useState(0);
  const [mtd, setMtd]           = useState(0);
  const [trend, setTrend]       = useState([]);
  const [wireMob, setWireMob]   = useState([]);
  const [allRanks, setAllRanks] = useState({});
  const [ytdTotals, setYtdTotals] = useState({});

  const [sortMonth, setSortMonth] = useState("");
  const [quotaSort, setQuotaSort] = useState("sellerAsc");

  /* auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cur) => {
      setUser(cur);
      const role = getUserRole(cur?.email);
      setIsMgmt(role === ROLES.MANAGER || role === ROLES.EXECUTIVE);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* fetch */
  useEffect(() => {
    if (!isMgmt) return;
    (async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        setSales(snap.docs.map((d) => d.data()));
        setError("");
      } catch (e) {
        console.error(e);
        setError("Failed to fetch management data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isMgmt]);

  /* metrics */
  useEffect(() => {
    if (!sales.length) return;
    const rows2025 = sales.filter((r) => typeof r.Month === "string" && r.Month.includes("2025"));
    const now      = new Date();
    const curMon   = `${MONTH_ORDER[now.getMonth()]} 2025`;

    let y = 0, m = 0;
    rows2025.forEach((r) => {
      const eff = getEffectiveMRC(r.MRC, r.Type);
      y += eff;
      if (r.Month === curMon) m += eff;
    });

    setYtd(y);
    setMtd(m);
    setTrend(buildMonthlyTrend(rows2025));
    setWireMob(buildWireMob(rows2025));
    setAllRanks(buildAllRanks(rows2025));
    setYtdTotals(buildYTDTotals(rows2025));
  }, [sales]);

  /* guards */
  if (loading) return <div className="loader">Loading management data…</div>;
  if (!user)   return <Gate title="Login Required" text="Please sign in to view this page." />;
  if (!isMgmt) return <Gate title="Access Denied"  text="You do not have permission to view this page." />;

  /* render */
  return (
    <div className="App">
      <NavBar user={user} theme={theme} setTheme={setTheme} />

      <div className="dashboard-stack spaced-stack">
        {!!error && <p className="error">{error}</p>}

        {/* KPI cards */}
        <div className="card-row" style={{ gap: 32, marginBottom: 32 }}>
          <MetricCard title="YTD MRC" value={formatCurrency(ytd)} />
          <MetricCard title="MTD MRC" value={formatCurrency(mtd)} />
        </div>

        {/* Monthly Trend */}
        <div className="card chart-card fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 6 }}>
            <ChartBarIcon className="icon" /> Monthly Trend (Wireline / Wireless / Total)
          </h2>
          <p style={{ marginBottom: 10 }}>“Upgrade” rows count as $15 MRC.</p>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 10, right: 25, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis
                  dataKey="month"
                  height={60}
                  tick={{ fill: "var(--color-text-primary)", fontWeight: 600, angle: -35, textAnchor: "end" }}
                  interval={0}
                  tickFormatter={label => label.split(" ")[0]}
                />
                <YAxis
                  width={120}
                  tick={{ fill: isDarkMode() ? "#fff" : "#222", fontWeight: 700 }}
                  tickFormatter={formatCurrency}
                  interval="preserveStartEnd"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={value => {
                    if (value === "wireless") return <span style={{ color: "var(--color-brand-orange)" }}>Wireless (Mobility) MRC</span>;
                    if (value === "wireline")  return <span style={{ color: "var(--color-brand-blue-light)" }}>Wireline MRC</span>;
                    if (value === "total")     return <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Total MRC</span>;
                    return value;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="wireless"
                  stackId="mrc"
                  stroke={BRAND_ORANGE}
                  fill={BRAND_ORANGE}
                  fillOpacity={0.85}
                  name="Wireless (Mobility) MRC"
                />
                <Area
                  type="monotone"
                  dataKey="wireline"
                  stackId="mrc"
                  stroke={BRAND_BLUE}
                  fill={BRAND_BLUE}
                  fillOpacity={0.85}
                  name="Wireline MRC"
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={BRAND_GREEN}
                  strokeWidth={4}
                  dot={{ r: 4, stroke: BRAND_GREEN, fill: BRAND_GREEN }}
                  name="Total MRC"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Wireline vs Mobility Pie */}
        <div className="card chart-card fade-in" style={{ maxWidth: 450, marginBottom: 32 }}>
          <h2>
            <ChartBarIcon className="icon" /> Wireline vs Mobility Breakdown (MRC 2025)
          </h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={wireMob}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={105}
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                >
                  <Cell fill={BRAND_BLUE} />
                  <Cell fill={BRAND_ORANGE} />
                </Pie>
                <Legend wrapperStyle={{ color: "var(--color-text-primary)" }} />
                <Tooltip formatter={formatCurrency} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <SortableQuotaPerformance
          data={sales}
          monthlyQuotas={monthlyQuotas}
          sortBy={quotaSort}
          onSortChange={setQuotaSort}
        />
        <StackRankYTD
          allMonthRanks={allRanks}
          sortMonth={sortMonth}
          onSortMonthChange={setSortMonth}
          sellerYTDTotals={ytdTotals}
        />
        <QuotaAttainmentChart data={sales} monthlyQuotas={monthlyQuotas} />
      </div>
    </div>
  );
}

/* ---------------------- Sub components (FULL, no omissions) ----------------------- */
const Gate = ({ title, text }) => (
  <main className="login-gate">
    <div className="login-card">
      <h2>{title}</h2>
      <p className="error">{text}</p>
    </div>
  </main>
);

const MetricCard = ({ title, value }) => (
  <div className="card metric-card" tabIndex={0} style={{ minWidth: 200 }}>
    <h2>{title}</h2>
    <p className="metric-value">{value}</p>
  </div>
);

function SortableQuotaPerformance({ data, monthlyQuotas, sortBy, onSortChange }) {
  const now  = new Date();
  const curM = `${MONTH_ORDER[now.getMonth()]} 2025`;

  const rows = monthlyQuotas.map((rep) => {
    const repRows = data.filter(
      (s) => s.Month === curM && (s.Seller ?? "").toLowerCase() === rep.Representative.toLowerCase()
    );
    const mrc = repRows.reduce((sum, r) => sum + getEffectiveMRC(r.MRC, r.Type), 0);
    const pct = rep.Quota ? (mrc / rep.Quota) * 100 : 0;
    return { repName: rep.Representative, quota: rep.Quota, currentMRC: mrc, progress: pct };
  });

  const sortFns = {
    sellerAsc:    (a, b) => a.repName.localeCompare(b.repName),
    sellerDesc:   (a, b) => b.repName.localeCompare(a.repName),
    mrcAsc:       (a, b) => a.currentMRC - b.currentMRC,
    mrcDesc:      (a, b) => b.currentMRC - a.currentMRC,
    progressAsc:  (a, b) => a.progress - b.progress,
    progressDesc: (a, b) => b.progress - a.progress,
  };
  rows.sort(sortFns[sortBy]);

  return (
    <div className="card fade-in" style={{ marginBottom: 32 }}>
      <HeaderSelect
        title="Quota Performance (MRC)"
        id="quota-sort"
        label="Sort By:"
        value={sortBy}
        onChange={onSortChange}
        groups={{
          "Seller Name": [
            { value: "sellerAsc",  label: "A → Z" },
            { value: "sellerDesc", label: "Z → A" },
          ],
          "Current MRC": [
            { value: "mrcAsc", label: "Low → High" },
            { value: "mrcDesc", label: "High → Low" },
          ],
          "Progress %": [
            { value: "progressAsc",  label: "Low → High" },
            { value: "progressDesc", label: "High → Low" },
          ],
        }}
      />
      <p className="subdued">Monthly quota vs MRC (Upgrades = $15).</p>
      <div className="table-container" style={{ maxHeight: 350, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Representative</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Monthly Quota</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Current Month MRC</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ repName, quota, currentMRC, progress }) => (
              <tr key={repName}>
                <td>{repName}</td>
                <td>{formatCurrency(quota)}</td>
                <td>{formatCurrency(currentMRC)}</td>
                <td style={{ minWidth: 150 }}>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(progress, 100).toFixed(0)}%`,
                        background: `linear-gradient(90deg, ${BRAND_ORANGE}, ${BRAND_BLUE})`,
                      }}
                    />
                  </div>
                  <span style={{ marginLeft: 10, fontWeight: 700 }}>
                    {progress.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StackRankYTD({ allMonthRanks, sortMonth, onSortMonthChange, sellerYTDTotals }) {
  const months = getAll2025Months();
  const sellers = Array.from(
    new Set(months.flatMap((m) => allMonthRanks[m]?.map((r) => r.seller) ?? []))
  );

  if (sortMonth) {
    const rankMap = Object.fromEntries(allMonthRanks[sortMonth]?.map((r) => [r.seller, r.rank]) ?? []);
    sellers.sort((a, b) => (rankMap[a] ?? 9e9) - (rankMap[b] ?? 9e9));
  } else {
    sellers.sort((a, b) => (sellerYTDTotals[a]?.rank ?? 9e9) - (sellerYTDTotals[b]?.rank ?? 9e9));
  }

  if (!sellers.length) return null;

  return (
    <div className="card fade-in" style={{ marginBottom: 32 }}>
      <HeaderSelect
        title="Month‑by‑Month Stack Ranking (MRC 2025)"
        id="stack-select"
        label="Month:"
        value={sortMonth}
        onChange={onSortMonthChange}
        groups={{ Months: [{ value: "", label: "(YTD)" }, ...months.map((m) => ({ value: m, label: m }))] }}
      />
      <p className="subdued">Default sort = YTD rank. Select a month to reorder.</p>
      <div className="table-container" style={{ maxHeight: 350, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>YTD Rank</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Seller</th>
              {months.map((m) => (
                <th key={m} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>{m}</th>
              ))}
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>YTD MRC</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => {
              const ytd = sellerYTDTotals[s] ?? { total: 0, rank: "—" };
              return (
                <tr key={s}>
                  <td className="center bold">{ytd.rank}</td>
                  <td>{s}</td>
                  {months.map((m, idx) => {
                    const rObj = allMonthRanks[m]?.find((r) => r.seller === s);
                    const rank = rObj?.rank ?? "—";
                    const prev = idx ? allMonthRanks[months[idx - 1]]?.find((r) => r.seller === s)?.rank : null;
                    const delta = rank && prev ? prev - rank : null;
                    let arrow = "—";
                    if (delta > 0) arrow = `↑${delta}`;
                    else if (delta < 0) arrow = `↓${Math.abs(delta)}`;
                    return (
                      <td key={m} className="center">
                        {rank} <span className="movement">{arrow}</span>
                      </td>
                    );
                  })}
                  <td className="center bold">{formatCurrency(ytd.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotaAttainmentChart({ data, monthlyQuotas }) {
  const months = getAll2025Months();
  const reps = monthlyQuotas.map((r) => r.Representative).sort();
  const [sel, setSel] = useState(reps[0] ?? "");

  // Always build data with all months present
  const chartData = months.map((m) => {
    const quota = monthlyQuotas.find((r) => r.Representative === sel)?.Quota ?? 0;
    const rows  = data.filter(
      (s) => s.Month === m && (s.Seller ?? "").toLowerCase() === sel.toLowerCase()
    );
    const mrc   = rows.reduce((sum, r) => sum + getEffectiveMRC(r.MRC, r.Type), 0);
    const ratio = quota ? mrc / quota : 0;
    return { month: m, Quota: quota, MRC: mrc, ratio };
  });

  const getMRCColour = (ratio) =>
    ratio < 0.5 ? BRAND_RED : ratio < 1 ? BRAND_ORANGE : BRAND_GREEN;

  return (
    <div className="card chart-card fade-in" style={{ marginBottom: 32 }}>
      <HeaderSelect
        title="Quota Attainment by Rep (MRC 2025)"
        id="quota-attain"
        label="Rep:"
        value={sel}
        onChange={setSel}
        groups={{ Reps: reps.map((r) => ({ value: r, label: r })) }}
      />
      <p className="subdued">
        MRC bars: <span style={{ color: BRAND_RED }}>Red&nbsp;&lt;50%</span>,{" "}
        <span style={{ color: BRAND_ORANGE }}>Orange 50–99%</span>,{" "}
        <span style={{ color: BRAND_GREEN }}>Green ≥100%</span>.
      </p>
      {/* Chart always wide enough to fit all months/labels */}
      <div style={{ width: "100%", minWidth: 1100, height: 420 }}>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              height={60}
              interval={0}
              tickFormatter={label => label.split(" ")[0]}
              tick={{ fill: "var(--color-text-primary)", fontWeight: 600, angle: -35, textAnchor: "end" }}
            />
            <YAxis
              width={110}
              tick={{ fill: "var(--color-text-primary)", fontWeight: 700 }}
              tickFormatter={formatCurrency}
            />
            <Tooltip formatter={formatCurrency} />
            <Legend wrapperStyle={{ color: "var(--color-text-primary)" }} />
            <Bar dataKey="Quota" name="Quota" fill={BRAND_BLUE} radius={[4, 4, 0, 0]} />
            <Bar
              dataKey="MRC"
              name="MRC"
              radius={[4, 4, 0, 0]}
              shape={({ x, y, width, height, payload }) => (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={getMRCColour(payload.ratio)}
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HeaderSelect({ title, id, label, value, onChange, groups }) {
  return (
    <div className="card-header">
      <h2>{title}</h2>
      <div className="filter-controls" style={{ minWidth: 220 }}>
        <label htmlFor={id} style={{ fontWeight: 600, marginRight: 6 }}>
          {label}
        </label>
        <select
          id={id}
          className="branded-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            color: "var(--color-text-primary)",
            backgroundColor: "var(--color-card, #23273a)",
            border: "1px solid var(--color-brand-blue-light)"
          }}
        >
          {Object.entries(groups).map(([grp, opts]) => (
            <optgroup key={grp} label={grp}>
              {opts.map(({ value: v, label: l }) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export default ManagementDashboard;
