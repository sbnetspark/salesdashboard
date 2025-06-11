import React, { useEffect, useState, useMemo } from "react";
import NavBar from "./NavBar";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
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
} from "recharts";
import "./App.css";
import { getUserRole, ROLES } from "./utils/getUserRole";

/* ---------- Helpers & Theme ---------- */
const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const BRAND_BLUE   = "var(--color-brand-blue-light)";
const BRAND_ORANGE = "var(--color-brand-orange)";
const BRAND_GREEN  = "var(--color-brand-green, #4caf50)";
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
  }).format(v || 0);

const getAll2025Months = () => MONTH_ORDER.map((m) => `${m} 2025`);
const isWireline = (t = "") => /wireline/i.test(t);
const isMobility = (t = "") => /mobility|wireless/i.test(t);

/* =================================================================== */
/*                          Main Component                             */
/* =================================================================== */
function ExecutiveDashboard({ theme, setTheme }) {
  const [user, setUser]         = useState(null);
  const [isExec, setIsExec]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [gaapRows, setGaapRows] = useState([]);
  const [error, setError]       = useState("");

  /* --- Auth --- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cur) => {
      setUser(cur);
      setIsExec(getUserRole(cur?.email) === ROLES.EXECUTIVE);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* --- Fetch + realtime --- */
  useEffect(() => {
    if (!isExec) return;

    const fetchOnce = async () => {
      try {
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        setGaapRows(snap.docs.map((d) => d.data()));
        setError("");
      } catch (e) {
        console.error(e);
        setError("Failed to fetch GAAP data.");
      }
    };
    fetchOnce();

    const unsub = onSnapshot(
      collection(db, "combined_sales_mrc"),
      (snap) => setGaapRows(snap.docs.map((d) => d.data())),
      (e) => console.error(e)
    );
    return () => unsub();
  }, [isExec]);

  /* --- Computed values --- */
  const {
    ytdGAAP,
    mtdGAAP,
    monthlyTrend,
    wireMobBreakdown
  } = useMemo(() => {
    if (!gaapRows.length)
      return { ytdGAAP: 0, mtdGAAP: 0, monthlyTrend: [], wireMobBreakdown: [] };

    const months = getAll2025Months();
    const now    = new Date();
    const curMon = `${MONTH_ORDER[now.getMonth()]} 2025`;

    let ytd = 0, mtd = 0;
    const monthlyAgg = {};
    const wm = { wireline: 0, mobility: 0 };

    gaapRows
      .filter((r) => r.Month?.includes("2025"))
      .forEach((r) => {
        const gaap   = Number(r.GAAP) || 0;
        const month  = r.Month;
        const type   = r.Type || "";
        const wire   = isWireline(type);
        ytd += gaap;
        if (month === curMon) mtd += gaap;

        if (!monthlyAgg[month]) monthlyAgg[month] = { wireline: 0, mobility: 0 };
        if (wire) {
          monthlyAgg[month].wireline += gaap;
          wm.wireline += gaap;
        } else if (isMobility(type)) {
          monthlyAgg[month].mobility += gaap;
          wm.mobility += gaap;
        }
      });

    /* build array in order */
    const fullTrend = months.map((m) => {
      const { wireline = 0, mobility = 0 } = monthlyAgg[m] || {};
      return { month: m, wireline, mobility, total: wireline + mobility };
    });

    /* ===== NEW: trim leading/trailing zero‑only months ===== */
    const firstIdx = fullTrend.findIndex((t) => t.total > 0);
    const lastIdx  = fullTrend.map((t) => t.total).lastIndexOf(
      fullTrend.slice().reverse().find((t) => t.total > 0)?.total ?? 0
    );
    const trimmedTrend =
      firstIdx === -1 ? [] : fullTrend.slice(firstIdx, lastIdx + 1);

    return {
      ytdGAAP: ytd,
      mtdGAAP: mtd,
      monthlyTrend: trimmedTrend,
      wireMobBreakdown: [
        { name: "Wireline", value: wm.wireline },
        { name: "Mobility", value: wm.mobility },
      ],
    };
  }, [gaapRows]);

  /* ---- Guards ---- */
  if (loading)
    return <div className="loader" role="status">Loading Executive Data…</div>;
  if (!user || !isExec)
    return (
      <main className="login-gate" aria-label="Access Denied">
        <div className="login-card">
          <h2>Access Denied</h2>
          <p className="error">Executive access required.</p>
        </div>
      </main>
    );

  /* ================================================================= */
  /*                              Render                               */
  /* ================================================================= */
  return (
    <div className="App">
      <NavBar user={user} theme={theme} setTheme={setTheme} />
      <div className="dashboard-stack">
        {!!error && <p className="error">{error}</p>}

        {/* KPI Cards */}
        <div className="card-row">
          <div className="card metric-card" tabIndex={0}>
            <h2>YTD&nbsp;GAAP</h2>
            <p className="metric-value">{formatCurrency(ytdGAAP)}</p>
          </div>
          <div className="card metric-card" tabIndex={0}>
            <h2>MTD&nbsp;GAAP</h2>
            <p className="metric-value">{formatCurrency(mtdGAAP)}</p>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="card chart-card fade-in">
          <h2>Monthly GAAP Trend (Wireline / Mobility / Total)</h2>
          <div style={{ width: "100%", height: 330 }}>
            <ResponsiveContainer>
              <AreaChart data={monthlyTrend} margin={{ top: 10, right: 25, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis
                  dataKey="month"
                  height={60}
                  tick={{
                    fill: "var(--color-text-primary)",
                    fontWeight: 600,
                    fontSize: 13,
                    angle: -35,
                    textAnchor: "end",
                  }}
                />
                <YAxis
                  width={110}
                  tick={{
                    fill: isDarkMode() ? "#fff" : "#222",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                  tickFormatter={formatCurrency}
                />
                <Tooltip formatter={formatCurrency} />
                <Legend wrapperStyle={{ color: "var(--color-text-primary)" }} />
                <Area
                  type="monotone"
                  dataKey="mobility"
                  stackId="a"
                  stroke={BRAND_BLUE}
                  fill={BRAND_BLUE}
                  name="Mobility GAAP"
                />
                <Area
                  type="monotone"
                  dataKey="wireline"
                  stackId="a"
                  stroke={BRAND_ORANGE}
                  fill={BRAND_ORANGE}
                  name="Wireline GAAP"
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stackId="b"
                  stroke={BRAND_GREEN}
                  fill="none"
                  strokeWidth={3}
                  name="Total GAAP"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Wireline vs Mobility Pie */}
        <div className="card chart-card fade-in" style={{ maxWidth: 460 }}>
          <h2>Wireline vs Mobility GAAP (2025)</h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={wireMobBreakdown}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  /* label disabled to remove clipped text */
                  labelLine={false}
                >
                  <Cell fill={BRAND_ORANGE} />
                  <Cell fill={BRAND_BLUE} />
                </Pie>
                <Legend wrapperStyle={{ color: "var(--color-text-primary)" }} />
                <Tooltip formatter={formatCurrency} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
