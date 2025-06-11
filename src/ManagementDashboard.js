// src/ManagementDashboard.js
import React, { useEffect, useState, useMemo } from "react";
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  Line,
} from "recharts";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import "./App.css";
import { getUserRole, ROLES } from "./utils/getUserRole";

// --- Utility ---
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
function getEffectiveMRC(mrc, type) {
  if (!mrc) return 0;
  if (type && type.toLowerCase().includes("upgrade")) return 15;
  return mrc;
}
const isDarkMode = () =>
  typeof window !== "undefined"
    ? document.documentElement.classList.contains("dark") ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

// Custom Tooltip Component for Recharts
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="recharts-tooltip">
        <p className="label">{`${label}`}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${entry.name}: ${formatCurrency(entry.value)}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// --- Data Builders ---
function buildMonthlyTrendData(salesData) {
  const months = getAll2025Months();
  const aggregator = {};
  months.forEach((m) => {
    aggregator[m] = { wireline: 0, wireless: 0, total: 0 };
  });

  salesData.forEach((sale) => {
    if (!sale.Month || !aggregator[sale.Month]) return;
    const eff = getEffectiveMRC(sale.MRC, sale.Type);
    aggregator[sale.Month].total += eff;
    if (sale.Type?.toLowerCase().includes("wireline")) {
      aggregator[sale.Month].wireline += eff;
    } else {
      aggregator[sale.Month].wireless += eff;
    }
  });

  return months.map((m) => ({
    month: m,
    wireline: aggregator[m].wireline,
    wireless: aggregator[m].wireless,
    total: aggregator[m].total,
  }));
}

function buildWireMobBreakdown(salesData) {
  let wirelineSum = 0;
  let mobilitySum = 0;
  salesData.forEach((sale) => {
    if (!sale.Month || !sale.Month.includes("2025")) return;
    const eff = getEffectiveMRC(sale.MRC, sale.Type);
    if (sale.Type?.toLowerCase().includes("wireline")) {
      wirelineSum += eff;
    } else {
      mobilitySum += eff;
    }
  });
  return [
    { name: "Wireline", value: wirelineSum },
    { name: "Mobility", value: mobilitySum },
  ];
}

function buildRankForMonth(salesData, monthStr) {
  const aggregator = {};
  salesData.forEach((sale) => {
    if (sale.Month === monthStr) {
      const seller = sale.Seller || "Unknown";
      const eff = getEffectiveMRC(sale.MRC, sale.Type);
      aggregator[seller] = (aggregator[seller] || 0) + eff;
    }
  });
  let arr = Object.entries(aggregator).map(([seller, total]) => ({ seller, total }));
  arr.sort((a, b) => b.total - a.total);
  arr.forEach((item, idx) => { item.rank = idx + 1; });
  return arr;
}
function buildAllMonthRanks(salesData) {
  const months = getAll2025Months();
  const result = {};
  months.forEach((m) => { result[m] = buildRankForMonth(salesData, m); });
  return result;
}
function buildSellerYTDTotals(salesData) {
  const data2025 = salesData.filter((s) => s.Month?.includes("2025"));
  const aggregator = {};
  data2025.forEach((sale) => {
    const seller = sale.Seller || "Unknown";
    aggregator[seller] = (aggregator[seller] || 0) + getEffectiveMRC(sale.MRC, sale.Type);
  });
  const arr = Object.entries(aggregator).map(([seller, total]) => ({ seller, total }));
  arr.sort((a, b) => b.total - a.total);
  arr.forEach((item, idx) => { item.rank = idx + 1; });
  const ytdMap = {};
  arr.forEach(({ seller, total, rank }) => { ytdMap[seller] = { total, rank }; });
  return ytdMap;
}

// --- Quota Data (Unchanged) ---
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

// ---------- Main Component ----------
function ManagementDashboard() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isManagement, setIsManagement] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [error, setError] = useState("");
  const [ytdMRC, setYtdMRC] = useState(0);
  const [mtdMRC, setMtdMRC] = useState(0);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [wireMobBreakdown, setWireMobBreakdown] = useState([]);
  const [allMonthRanks, setAllMonthRanks] = useState({});
  const [stackRankSortMonth, setStackRankSortMonth] = useState("");
  const [sellerYTDTotals, setSellerYTDTotals] = useState({});
  const [quotaSortBy, setQuotaSortBy] = useState("sellerAsc");

  // Auth check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true);
      setUser(currentUser);
      setIsManagement(
        getUserRole(currentUser?.email) === ROLES.MANAGER ||
        getUserRole(currentUser?.email) === ROLES.EXECUTIVE
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch data
  useEffect(() => {
    if (!isManagement) return;
    async function fetchData() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        const allSales = snap.docs.map((doc) => doc.data());
        setSalesData(allSales);
        setError("");
      } catch (err) {
        console.error("Error fetching management data:", err);
        setError("Failed to fetch management data. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isManagement]);

  // Build metrics
  useEffect(() => {
    if (!salesData.length) {
      setYtdMRC(0);
      setMtdMRC(0);
      setMonthlyTrend([]);
      setWireMobBreakdown([]);
      setAllMonthRanks({});
      setSellerYTDTotals({});
      return;
    }
    const data2025 = salesData.filter((s) => s.Month && s.Month.includes("2025"));
    const now = new Date();
    const currentMonthStr = `${MONTH_ORDER[now.getMonth()]} 2025`;
    let ytdTotal = 0, mtdTotal = 0;
    data2025.forEach((sale) => {
      const effMRC = getEffectiveMRC(sale.MRC, sale.Type);
      ytdTotal += effMRC;
      if (sale.Month === currentMonthStr) mtdTotal += effMRC;
    });
    setYtdMRC(ytdTotal);
    setMtdMRC(mtdTotal);
    setMonthlyTrend(buildMonthlyTrendData(data2025));
    setWireMobBreakdown(buildWireMobBreakdown(data2025));
    setAllMonthRanks(buildAllMonthRanks(data2025));
    setSellerYTDTotals(buildSellerYTDTotals(data2025));
  }, [salesData]);

  // UI/UX Responsive Header & Navigation
  if (loading) return <div className="loader" role="status">Loading management data...</div>;
  if (!user) return <div style={{ padding: 20 }}><p>You must be logged in to view the management dashboard.</p></div>;
  if (!isManagement) return <div style={{ padding: 20 }}><h2>Access Denied</h2><p>You do not have permission to view this page.</p></div>;

  return (
    <div className="App" style={{ padding: window.innerWidth < 700 ? 7 : 22, maxWidth: 1280 }}>
      <NavBar user={user} />
      {error && (
        <p className="error" style={{ color: "red" }}>
          {error}
        </p>
      )}

      {/* ---- Metric Cards ---- */}
      <div className="card-row" style={{ marginBottom: "1.5rem" }}>
        <div className="card metric-card" tabIndex={0}>
          <h2>YTD MRC</h2>
          <p className="metric-value">{formatCurrency(ytdMRC)}</p>
        </div>
        <div className="card metric-card" tabIndex={0}>
          <h2>MTD MRC</h2>
          <p className="metric-value">{formatCurrency(mtdMRC)}</p>
        </div>
      </div>

      {/* ---- Monthly Trend Area Chart ---- */}
      <div className="card chart-card fade-in" style={{ marginBottom: "1.3rem" }}>
        <h2>
          <ChartBarIcon className="icon" /> Monthly Trend (Wireline / Wireless / Total)
        </h2>
        <p style={{ marginBottom: "8px" }}>
          For any "Upgrade" row, MRC is forced to $15 in this management view.
        </p>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={monthlyTrend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis
                dataKey="month"
                stroke="var(--color-text-primary)"
                tick={{ fill: "var(--color-text-primary)", fontWeight: 600 }}
                fontSize={14}
              />
              <YAxis
                stroke={isDarkMode() ? "#fff" : "#222"}
                tick={{
                  fill: isDarkMode() ? "#fff" : "#222",
                  fontWeight: 700,
                  fontSize: 15
                }}
                fontSize={15}
                tickFormatter={formatCurrency}
                width={100}
                allowDecimals={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={<CustomTooltip />}
                labelStyle={{ color: "#000" }}
                contentStyle={{
                  backgroundColor: "rgba(255,255,255,0.92)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: "7px",
                }}
                itemStyle={{ color: "#000" }}
              />
              <Legend wrapperStyle={{ color: "var(--color-text-primary)", fontSize: "0.92rem" }} />
              <Area
                type="monotone"
                dataKey="wireless"
                stackId="a"
                stroke="var(--color-brand-orange)"
                fill="var(--color-brand-orange)"
                name="Wireless (Mobility) MRC"
              />
              <Area
                type="monotone"
                dataKey="wireline"
                stackId="a"
                stroke="var(--color-brand-blue-light)"
                fill="var(--color-brand-blue-light)"
                name="Wireline MRC"
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-accent)"
                strokeWidth={3}
                dot={{ r: 4, stroke: 'var(--color-accent)', fill: 'var(--color-accent)' }}
                name="Total MRC"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---- Pie Chart Breakdown ---- */}
      <div
        className="card chart-card fade-in"
        style={{
          marginBottom: "1.6rem",
          maxWidth: window.innerWidth < 500 ? "100%" : 450,
          marginLeft: 0
        }}
      >
        <h2>
          <ChartBarIcon className="icon" /> Wireline vs. Mobility Breakdown (MRC 2025)
        </h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={wireMobBreakdown}
                dataKey="value"
                nameKey="name"
                outerRadius={window.innerWidth < 500 ? 60 : 100}
                labelLine={false}
                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
              >
                <Cell fill="var(--color-brand-blue-light)" />
                <Cell fill="var(--color-brand-orange)" />
              </Pie>
              <Legend wrapperStyle={{ color: "var(--color-text-primary)", fontSize: "0.9rem" }} />
              <Tooltip
                formatter={formatCurrency}
                labelStyle={{ color: "#000" }}
                contentStyle={{
                  backgroundColor: "rgba(255,255,255,0.92)",
                  border: "1px solid var(--color-brand-blue-light)",
                  borderRadius: "7px",
                }}
                itemStyle={{ color: "#000" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <SortableQuotaPerformance
        data={salesData}
        monthlyQuotas={monthlyQuotas}
        setError={setError}
        sortBy={quotaSortBy}
        onSortChange={setQuotaSortBy}
      />
      <StackRankYTD
        allMonthRanks={allMonthRanks}
        sortMonth={stackRankSortMonth}
        onSortMonthChange={setStackRankSortMonth}
        sellerYTDTotals={sellerYTDTotals}
      />
      <QuotaAttainmentChart
        data={salesData}
        monthlyQuotas={monthlyQuotas}
      />
    </div>
  );
}

function SortableQuotaPerformance({
  data,
  monthlyQuotas,
  setError,
  sortBy,
  onSortChange,
}) {
  const now = new Date();
  const currentMonthStr = `${MONTH_ORDER[now.getMonth()]} 2025`;

  let rowData = monthlyQuotas.map((rep) => {
    const repRows = data.filter(
      (s) =>
        s.Month === currentMonthStr &&
        (s.Seller || "").toLowerCase() === rep.Representative.toLowerCase()
    );
    const repTotal = repRows.reduce(
      (sum, row) => sum + getEffectiveMRC(row.MRC, row.Type),
      0
    );
    const progressPct = rep.Quota ? (repTotal / rep.Quota) * 100 : 0;

    return {
      repName: rep.Representative,
      quota: rep.Quota,
      currentMRC: repTotal,
      progress: progressPct,
    };
  });

  if (sortBy === "sellerAsc") {
    rowData.sort((a, b) => a.repName.localeCompare(b.repName));
  } else if (sortBy === "sellerDesc") {
    rowData.sort((a, b) => b.repName.localeCompare(a.repName));
  } else if (sortBy === "mrcAsc") {
    rowData.sort((a, b) => a.currentMRC - b.currentMRC);
  } else if (sortBy === "mrcDesc") {
    rowData.sort((a, b) => b.currentMRC - a.currentMRC);
  } else if (sortBy === "progressAsc") {
    rowData.sort((a, b) => a.progress - b.progress);
  } else if (sortBy === "progressDesc") {
    rowData.sort((a, b) => b.progress - a.progress);
  }

  return (
    <div className="card fade-in" style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Quota Performance (MRC)</h2>
        <div>
          <label>Sort By:</label>{" "}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            style={{ marginLeft: 6 }}
          >
            <optgroup label="Seller Name">
              <option value="sellerAsc">A → Z</option>
              <option value="sellerDesc">Z → A</option>
            </optgroup>
            <optgroup label="Current MRC">
              <option value="mrcAsc">Low → High</option>
              <option value="mrcDesc">High → Low</option>
            </optgroup>
            <optgroup label="Progress %">
              <option value="progressAsc">Low → High</option>
              <option value="progressDesc">High → Low</option>
            </optgroup>
          </select>
        </div>
      </div>
      <p>
        Each seller’s monthly quota vs. their MRC (with upgrades forced to $15).
      </p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Representative</th>
              <th>Monthly Quota</th>
              <th>Current Month MRC</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {rowData.map((rep) => {
              const pct = rep.progress;
              return (
                <tr key={rep.repName}>
                  <td>{rep.repName}</td>
                  <td>{formatCurrency(rep.quota)}</td>
                  <td>{formatCurrency(rep.currentMRC)}</td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(pct, 100).toFixed(0)}%`,
                        }}
                      />
                    </div>
                    <span style={{ marginLeft: 8 }}>{pct.toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StackRankYTD({ allMonthRanks, sortMonth, onSortMonthChange, sellerYTDTotals }) {
  const months = getAll2025Months();

  const allSellersSet = new Set();
  months.forEach((m) => {
    (allMonthRanks[m] || []).forEach((r) => allSellersSet.add(r.seller));
  });
  const allSellers = Array.from(allSellersSet);

  // Always sort by YTD rank if not sorting by a specific month
  if (!sortMonth) {
    allSellers.sort((a, b) => {
      const aRank = (sellerYTDTotals[a]?.rank) || 9999;
      const bRank = (sellerYTDTotals[b]?.rank) || 9999;
      return aRank - bRank;
    });
  } else if (sortMonth && allMonthRanks[sortMonth]) {
    const ranksArr = allMonthRanks[sortMonth];
    const rankMap = {};
    ranksArr.forEach((r) => {
      rankMap[r.seller] = r.rank;
    });
    allSellers.sort((a, b) => (rankMap[a] || 9999) - (rankMap[b] || 9999));
  }

  if (!allSellers.length) return null;

  return (
    <div className="card fade-in" style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Month-by-Month Stack Ranking (MRC 2025)</h2>
        <div>
          <label>Sort By Month:</label>{" "}
          <select
            value={sortMonth}
            onChange={(e) => onSortMonthChange(e.target.value)}
            style={{ marginLeft: 6 }}
          >
            <option value="">(YTD Rank)</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p>
        <b>YTD Stack Rank is always the far left column and is sorted by YTD Rank by default.</b>
        Choose a month to reorder by that month’s rank.
      </p>
      <div className="table-container" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>YTD Rank</th>
              <th>Seller</th>
              {months.map((m) => (
                <th key={m} style={{ textAlign: "center" }}>
                  {m}
                </th>
              ))}
              <th style={{ textAlign: "center" }}>YTD MRC</th>
            </tr>
          </thead>
          <tbody>
            {allSellers.map((seller) => {
              const ytdData = sellerYTDTotals[seller] || { total: 0, rank: "—" };
              return (
                <tr key={seller}>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{ytdData.rank}</td>
                  <td>{seller}</td>
                  {months.map((m, idx) => {
                    const rankObj = (allMonthRanks[m] || []).find((r) => r.seller === seller);
                    const rank = rankObj ? rankObj.rank : null;

                    if (idx === 0) {
                      return (
                        <td key={m} style={{ textAlign: "center" }}>
                          {rank || "—"}
                        </td>
                      );
                    } else {
                      const prevMonth = months[idx - 1];
                      const prevObj = (allMonthRanks[prevMonth] || []).find(
                        (x) => x.seller === seller
                      );
                      const prevRank = prevObj ? prevObj.rank : null;
                      let movement = null;
                      if (rank != null && prevRank != null) {
                        movement = prevRank - rank;
                      }
                      return (
                        <td key={m} style={{ textAlign: "center" }}>
                          {rank || "—"}
                          {movement != null && (
                            <span
                              className={`movement ${movement > 0 ? "movement-up" : movement < 0 ? "movement-down" : "movement-same"}`}
                            >
                              {movement > 0
                                ? `↑${movement}`
                                : movement < 0
                                ? `↓${Math.abs(movement)}`
                                : "—"}
                            </span>
                          )}
                        </td>
                      );
                    }
                  })}
                  <td style={{ textAlign: "center", fontWeight: 700 }}>
                    {formatCurrency(ytdData.total)}
                  </td>
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

  const sellers = monthlyQuotas.map((rep) => rep.Representative).sort();
  const [selectedRep, setSelectedRep] = useState(sellers[0] || "");

  const chartData = months.map((m) => {
    const quotaRow = monthlyQuotas.find(
      (r) => r.Representative.toLowerCase() === selectedRep.toLowerCase()
    );
    const monthlyQuota = quotaRow ? quotaRow.Quota : 0;

    const repRows = data.filter(
      (s) =>
        s.Month === m &&
        (s.Seller || "").toLowerCase() === selectedRep.toLowerCase()
    );
    const totalMRC = repRows.reduce((sum, row) => {
      return sum + getEffectiveMRC(row.MRC, row.Type);
    }, 0);

    return {
      month: m,
      MRC: totalMRC,
      Quota: monthlyQuota,
      under50: totalMRC < 0.5 * monthlyQuota,
    };
  });

  return (
    <div className="card chart-card fade-in" style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Quota Attainment by Rep (MRC, 2025)</h2>
        <div>
          <label>Select Rep:</label>{" "}
          <select value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)}>
            {sellers.map((repName) => (
              <option key={repName} value={repName}>
                {repName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p>
        Compare {selectedRep}'s MRC vs. Quota for each 2025 month (Upgrades = $15).
      </p>
      <div style={{ width: "100%", height: 400 }}>
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              stroke="var(--color-text-primary)"
              tick={{ fill: "var(--color-text-primary)", fontWeight: 600 }}
              fontSize={13}
            />
            <YAxis
              stroke="var(--color-text-primary)"
              tick={{ fill: "var(--color-text-primary)", fontWeight: 700, fontSize: 14 }}
              tickFormatter={formatCurrency}
              width={100}
            />
            <Tooltip
              formatter={formatCurrency}
              labelStyle={{ color: "#000" }}
              contentStyle={{
                backgroundColor: "rgba(255,255,255,0.92)",
                border: "1px solid var(--color-accent)",
                borderRadius: "7px",
              }}
              itemStyle={{ color: "#000" }}
            />
            <Legend wrapperStyle={{ color: "var(--color-text-primary)", fontSize: "0.9rem" }} />
            <Bar dataKey="Quota" fill="var(--color-accent)" name="Quota" />
            <Bar
              dataKey="MRC"
              name="MRC"
              shape={(props) => {
                const { x, y, width, height, payload } = props;
                const color = payload.under50 ? "var(--color-brand-blue-light)" : "var(--color-brand-orange)";
                return <rect x={x} y={y} width={width} height={height} fill={color} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ManagementDashboard;
