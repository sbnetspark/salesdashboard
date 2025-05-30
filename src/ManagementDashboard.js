// src/ManagementDashboard.js
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
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

// --- Data Builders ---
function buildMonthlyTrendData(salesData) {
  const months = getAll2025Months();
  const aggregator = {};
  months.forEach((m) => { aggregator[m] = { wireline: 0, wireless: 0 }; });
  salesData.forEach((sale) => {
    if (!sale.Month || !aggregator[sale.Month]) return;
    const eff = getEffectiveMRC(sale.MRC, sale.Type);
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
    total: aggregator[m].wireline + aggregator[m].wireless,
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

// --- Quota Data (hard-coded) ---
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

// --- ManagementDashboard Main Component ---
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

  // Auth check (uses getUserRole)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true);
      setUser(currentUser);
      setIsManagement(getUserRole(currentUser?.email) === ROLES.MANAGER || getUserRole(currentUser?.email) === ROLES.EXECUTIVE);
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

  // Build metrics when data loads
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

  if (loading) return <div className="loader" role="status">Loading management data...</div>;
  if (!user) return <div style={{ padding: 20 }}><p>You must be logged in to view the management dashboard.</p></div>;
  if (!isManagement) return <div style={{ padding: 20 }}><h2>Access Denied</h2><p>You do not have permission to view this page.</p></div>;

  // --- Render ---
  return (
    <div className="App" style={{ padding: 20 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/"
          className="refresh-btn"
          style={{
            backgroundColor: "#9c27b0",
            marginRight: "10px",
            textDecoration: "none",
          }}
        >
          ← Back to Main Dashboard
        </Link>
      </div>
      <h1 style={{ marginBottom: "1rem" }}>Management Dashboard (2025)</h1>
      {error && (
        <p className="error" style={{ color: "red" }}>
          {error}
        </p>
      )}
      <h2 style={{ marginTop: 40 }}>MRC-Based (Upgrades = $15)</h2>
      <div className="card-row" style={{ marginBottom: "2rem" }}>
        <div className="card metric-card">
          <h2>YTD MRC</h2>
          <p className="metric-value">{formatCurrency(ytdMRC)}</p>
        </div>
        <div className="card metric-card">
          <h2>MTD MRC</h2>
          <p className="metric-value">{formatCurrency(mtdMRC)}</p>
        </div>
      </div>
      <div className="card chart-card fade-in" style={{ marginBottom: "2rem" }}>
        <h2>
          <ChartBarIcon className="icon" /> Monthly Trend (Wireline / Wireless / Total)
        </h2>
        <p style={{ marginBottom: "8px" }}>
          For any "Upgrade" row, MRC is forced to $15 in this management view.
        </p>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={monthlyTrend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
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
                name="Wireline"
              />
              <Area
                type="monotone"
                dataKey="wireless"
                stackId="1"
                stroke="#00bfff"
                fill="#00bfff"
                name="Wireless"
              />
              <Area
                type="monotone"
                dataKey="total"
                stackId="2"
                stroke="#4caf50"
                fill="none"
                strokeWidth={3}
                name="Total"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div
        className="card chart-card fade-in"
        style={{ marginBottom: "2rem", maxWidth: 500 }}
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

/********************************************
  6) Quota Performance (MRC) 
********************************************/
function SortableQuotaPerformance({
  data,
  monthlyQuotas,
  setError,
  sortBy,
  onSortChange,
}) {
  const now = new Date();
  const currentMonthStr = `${MONTH_ORDER[now.getMonth()]} 2025`;

  // Build row data
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

  // Sort
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
                    <div
                      style={{
                        backgroundColor: "#444",
                        width: "120px",
                        height: "8px",
                        borderRadius: "4px",
                        marginTop: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: "#ff6f32",
                          width: `${Math.min(pct, 100).toFixed(0)}%`,
                          height: "100%",
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

/********************************************
  7) Month-by-Month Stack Rank (MRC 2025) + YTD
********************************************/
function StackRankYTD({ allMonthRanks, sortMonth, onSortMonthChange, sellerYTDTotals }) {
  const months = getAll2025Months();

  // Gather all unique sellers
  const allSellersSet = new Set();
  months.forEach((m) => {
    (allMonthRanks[m] || []).forEach((r) => allSellersSet.add(r.seller));
  });
  const allSellers = Array.from(allSellersSet);

  // If a user chooses a month => sort by that month's rank
  if (sortMonth && allMonthRanks[sortMonth]) {
    const ranksArr = allMonthRanks[sortMonth];
    const rankMap = {};
    ranksArr.forEach((r) => {
      rankMap[r.seller] = r.rank;
    });
    allSellers.sort((a, b) => (rankMap[a] || 9999) - (rankMap[b] || 9999));
  } else {
    // default: sort A-Z
    allSellers.sort((a, b) => a.localeCompare(b));
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
            <option value="">(Seller Name A-Z)</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p>
        Ranks by total MRC each month. Choose a month to reorder by that month’s rank.
      </p>
      <div className="table-container" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Seller</th>
              {months.map((m) => (
                <th key={m} style={{ textAlign: "center" }}>
                  {m}
                </th>
              ))}
              {/* YTD columns */}
              <th style={{ textAlign: "center" }}>YTD MRC</th>
              <th style={{ textAlign: "center" }}>YTD Rank</th>
            </tr>
          </thead>
          <tbody>
            {allSellers.map((seller) => {
              const ytdData = sellerYTDTotals[seller] || { total: 0, rank: "—" };
              return (
                <tr key={seller}>
                  <td>{seller}</td>
                  {months.map((m, idx) => {
                    const rankObj = (allMonthRanks[m] || []).find((r) => r.seller === seller);
                    const rank = rankObj ? rankObj.rank : null;

                    if (idx === 0) {
                      // First month => no arrow comparison
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
                              style={{
                                marginLeft: 6,
                                color:
                                  movement > 0
                                    ? "green"
                                    : movement < 0
                                    ? "red"
                                    : "inherit",
                              }}
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
                  {/* YTD columns */}
                  <td style={{ textAlign: "center" }}>
                    {formatCurrency(ytdData.total)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {ytdData.rank}
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

/********************************************
  8) Quota Attainment Chart 
********************************************/
function QuotaAttainmentChart({ data, monthlyQuotas }) {
  const months = getAll2025Months();

  // Build list of sellers
  const sellers = monthlyQuotas.map((rep) => rep.Representative).sort();
  const [selectedRep, setSelectedRep] = useState(sellers[0] || "");

  // Build chart data for selected rep, across all months
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
              stroke="#fff"
              tick={{ fill: "#fff" }}
            />
            <YAxis
              stroke="#fff"
              tick={{ fill: "#fff" }}
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

            {/* Quota bar => orange */}
            <Bar dataKey="Quota" fill="#ff6f32" name="Quota" />

            {/* MRC bar => color-coded if under 50% => red, else #00bfff */}
            <Bar
              dataKey="MRC"
              name="MRC"
              shape={(props) => {
                const { x, y, width, height, payload } = props;
                const color = payload.under50 ? "red" : "#00bfff";
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
