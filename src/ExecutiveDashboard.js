// src/ExecutiveDashboard.js
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
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
  Cell
} from "recharts";
import "./App.css";
import { getUserRole, ROLES } from "./utils/getUserRole";

// ----- Utility -----
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}
const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
function getAll2025Months() {
  return MONTH_ORDER.map((m) => `${m} 2025`);
}

// ----- ExecutiveDashboard -----
function ExecutiveDashboard() {
  const [user, setUser] = useState(null);
  const [isExecutive, setIsExecutive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gaapData, setGaapData] = useState([]);
  const [error, setError] = useState("");

  // Auth check: enforce exec role with getUserRole
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsExecutive(getUserRole(currentUser?.email) === ROLES.EXECUTIVE);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Data fetching (GAAP only)
  useEffect(() => {
    if (!isExecutive) return;
    setLoading(true);
    const fetchData = async () => {
      try {
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        const docs = snap.docs.map((doc) => doc.data());
        setGaapData(docs);
        setError("");
      } catch (err) {
        console.error("Error fetching GAAP data:", err);
        setError("Failed to fetch data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // Real-time updates
    const unsub = onSnapshot(
      collection(db, "combined_sales_mrc"),
      (snapshot) => {
        setGaapData(snapshot.docs.map((doc) => doc.data()));
        setError("");
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("Error listening to real-time updates.");
      }
    );
    return () => unsub();
  }, [isExecutive]);

  // Computed values (memoized)
  const {
    ytdGAAP,
    mtdGAAP,
    monthlyTrend,
    wireMobBreakdown
  } = useMemo(() => {
    if (!gaapData.length) {
      return {
        ytdGAAP: 0,
        mtdGAAP: 0,
        monthlyTrend: [],
        wireMobBreakdown: [],
      };
    }
    const data2025 = gaapData.filter((row) => row.Month && row.Month.includes("2025"));
    const now = new Date();
    const currentMonth = `${MONTH_ORDER[now.getMonth()]} 2025`;
    let ytdSum = 0, mtdSum = 0;
    const monthlyAggregator = {};
    const wireMob = { wireline: 0, mobility: 0 };

    data2025.forEach((row) => {
      const gaap = row.GAAP || 0;
      const month = row.Month;
      const type = row.Type?.toLowerCase() || "";
      ytdSum += gaap;
      if (month === currentMonth) mtdSum += gaap;
      if (!monthlyAggregator[month]) monthlyAggregator[month] = { wireline: 0, mobility: 0 };
      if (type.includes("wireline")) {
        monthlyAggregator[month].wireline += gaap;
        wireMob.wireline += gaap;
      } else {
        monthlyAggregator[month].mobility += gaap;
        wireMob.mobility += gaap;
      }
    });

    // Trend array for all months in order
    const months = getAll2025Months();
    const trendArr = months.map((m) => {
      if (!monthlyAggregator[m]) return { month: m, wireline: 0, mobility: 0, total: 0 };
      const w = monthlyAggregator[m].wireline;
      const mob = monthlyAggregator[m].mobility;
      return { month: m, wireline: w, mobility: mob, total: w + mob };
    });

    return {
      ytdGAAP: ytdSum,
      mtdGAAP: mtdSum,
      monthlyTrend: trendArr,
      wireMobBreakdown: [
        { name: "Wireline", value: wireMob.wireline },
        { name: "Mobility", value: wireMob.mobility },
      ]
    };
  }, [gaapData]);

  // ---- Render ----
  if (loading) {
    return <div className="loader" role="status">Loading Executive GAAP Data...</div>;
  }
  if (!user || !isExecutive) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view Executive Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="App" style={{ padding: 20 }}>
      {/* Back to main dashboard */}
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/"
          className="refresh-btn"
          style={{ backgroundColor: "#9c27b0", marginRight: "10px" }}
        >
          ← Back to Main Dashboard
        </Link>
      </div>
      <h1 tabIndex={0}>Executive Dashboard (GAAP Revenue)</h1>
      {error && (
        <p className="error" style={{ color: "red" }}>
          {error}
        </p>
      )}
      {/* KPI Cards: YTD GAAP & MTD GAAP */}
      <div className="card-row" style={{ marginBottom: "2rem" }}>
        <div className="card metric-card" tabIndex={0} aria-label={`YTD GAAP: ${formatCurrency(ytdGAAP)}`}>
          <h2>YTD GAAP</h2>
          <p className="metric-value">{formatCurrency(ytdGAAP)}</p>
        </div>
        <div className="card metric-card" tabIndex={0} aria-label={`MTD GAAP: ${formatCurrency(mtdGAAP)}`}>
          <h2>MTD GAAP</h2>
          <p className="metric-value">{formatCurrency(mtdGAAP)}</p>
        </div>
      </div>
      {/* Monthly Trend (AreaChart) */}
      <div className="card chart-card fade-in" style={{ marginBottom: "2rem" }}>
        <h2 tabIndex={0}>Monthly GAAP Trend (Wireline / Mobility)</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                stroke="#fff"
                tick={{ fill: "#fff" }}
                fontSize={12}
              />
              <YAxis
                stroke="#fff"
                tick={{ fill: "#fff" }}
                fontSize={12}
                tickFormatter={formatCurrency}
              />
              <Tooltip
                formatter={formatCurrency}
                labelStyle={{ color: "#000" }}
                contentStyle={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  border: "1px solid #999",
                }}
                itemStyle={{ color: "#000" }}
              />
              <Legend wrapperStyle={{ color: "#fff", fontSize: "0.9rem" }} />
              <Area
                type="monotone"
                dataKey="wireline"
                stackId="1"
                stroke="#ff6f32"
                fill="#ff6f32"
                name="Wireline GAAP"
              />
              <Area
                type="monotone"
                dataKey="mobility"
                stackId="1"
                stroke="#00bfff"
                fill="#00bfff"
                name="Mobility GAAP"
              />
              <Area
                type="monotone"
                dataKey="total"
                stackId="2"
                stroke="#4caf50"
                fill="none"
                strokeWidth={3}
                name="Total GAAP"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Wireline vs. Mobility Pie Chart */}
      <div className="card chart-card fade-in" style={{ maxWidth: 500 }}>
        <h2 tabIndex={0}>Wireline vs Mobility GAAP (All 2025)</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={wireMobBreakdown}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                labelLine={false}
                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
              >
                <Cell fill="#ff6f32" />
                <Cell fill="#00bfff" />
              </Pie>
              <Legend wrapperStyle={{ color: "#fff", fontSize: "0.9rem" }} />
              <Tooltip
                formatter={formatCurrency}
                labelStyle={{ color: "#000" }}
                contentStyle={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  border: "1px solid #999",
                }}
                itemStyle={{ color: "#000" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
