import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import NavBar from "./NavBar";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  LabelList,
  Legend,
} from "recharts";
import "./App.css";
import { getUserRole } from "./utils/getUserRole";

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const isWireless = (type) => type?.toLowerCase().includes("mobility");
const isWireline = (type) => type?.toLowerCase().includes("wireline");

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function getCurrentMonthYear() {
  const now = new Date();
  const month = MONTH_ORDER[now.getMonth()];
  const year = now.getFullYear();
  return `${month} ${year}`;
}

function getLastFourMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 4; i++) {
    const tempDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = MONTH_ORDER[tempDate.getMonth()];
    const year = tempDate.getFullYear();
    months.push(`${monthName} ${year}`);
  }
  return months.reverse();
}

function TotalMRC({ total }) {
  return (
    <div className="card metric-card" tabIndex={0} aria-label={`Total YTD MRC ${formatCurrency(total)}`}>
      <h2>Total YTD MRC</h2>
      <p className="metric-value">{formatCurrency(total)}</p>
    </div>
  );
}

function MTDCard({ salesData }) {
  const currentMonthYear = getCurrentMonthYear();
  const mtd = salesData
    .filter((sale) => sale.Month === currentMonthYear)
    .reduce((sum, sale) => sum + (sale.MRC || 0), 0);
  return (
    <div className="card metric-card" tabIndex={0} aria-label={`Month-to-Date MRC ${formatCurrency(mtd)}`}>
      <h2>Month-to-Date MRC</h2>
      <p className="metric-value">{formatCurrency(mtd)}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const wireless = payload.find(p => p.dataKey === "Wireless");
    const wireline = payload.find(p => p.dataKey === "Wireline");
    const total = payload.find(p => p.dataKey === "Total");
    return (
      <div className="recharts-tooltip">
        <p className="label" style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
        <p style={{ color: "var(--color-brand-orange)", margin: 0, fontWeight: 500 }}>
          Wireless (Mobility) MRC: {formatCurrency(wireless?.value || 0)}
        </p>
        <p style={{ color: "var(--color-brand-blue-light)", margin: 0, fontWeight: 500 }}>
          Wireline MRC: {formatCurrency(wireline?.value || 0)}
        </p>
        <p style={{ color: "var(--color-success)", fontWeight: 700, margin: "8px 0 0 0" }}>
          Total: {formatCurrency(total?.value || ((wireless?.value || 0) + (wireline?.value || 0)))}
        </p>
      </div>
    );
  }
  return null;
};

function TotalRevenueForMonth({ salesData }) {
  const monthlyData = useMemo(() => {
    const agg = {};
    salesData.forEach((sale) => {
      const { Month, MRC, Type } = sale;
      if (!Month || !MRC) return;
      if (!agg[Month]) {
        agg[Month] = {
          Wireless: 0,
          Wireline: 0,
          Total: 0,
        };
      }
      agg[Month].Total += MRC;
      if (isWireless(Type)) {
        agg[Month].Wireless += MRC;
      } else if (isWireline(Type)) {
        agg[Month].Wireline += MRC;
      }
    });

    return Object.entries(agg)
      .map(([month, totals]) => ({
        month,
        ...totals,
      }))
      .filter((item) => item.month && item.month.includes(" "))
      .sort((a, b) => {
        const [mA, yA] = a.month.split(" ");
        const [mB, yB] = b.month.split(" ");
        const yearDiff = parseInt(yA, 10) - parseInt(yB, 10);
        if (yearDiff !== 0) return yearDiff;
        return MONTH_ORDER.indexOf(mA) - MONTH_ORDER.indexOf(mB);
      });
  }, [salesData]);

  return (
    <div className="card chart-card" tabIndex={0} aria-label="Total Revenue for Month with Wireline, Wireless, and Total MRC">
      <h2>
        <ChartBarIcon className="icon" /> Total Revenue for Month
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={monthlyData}
          margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis
            dataKey="month"
            stroke="var(--color-text-primary)"
            fontSize={13}
            tick={{ fontWeight: 600 }}
            interval={0}
          />
          <YAxis
            stroke="var(--color-text-primary)"
            fontSize={15}
            tick={{ fontWeight: 700, fill: "var(--color-text-primary)" }}
            tickFormatter={formatCurrency}
            width={100}
            interval="preserveStartEnd"
            allowDecimals={false}
            domain={[0, "auto"]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => {
              if (value === "Wireless") return <span style={{ color: "var(--color-brand-orange)" }}>Wireless (Mobility) MRC</span>;
              if (value === "Wireline") return <span style={{ color: "var(--color-brand-blue-light)" }}>Wireline MRC</span>;
              if (value === "Total") return <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Total Revenue</span>;
              return value;
            }}
          />
          <Bar dataKey="Wireless" stackId="a" fill="var(--color-brand-orange)" name="Wireless">
            <LabelList
              dataKey="Total"
              position="top"
              formatter={formatCurrency}
              style={{ fill: "var(--color-success)", fontWeight: 700, fontSize: 13 }}
            />
          </Bar>
          <Bar dataKey="Wireline" stackId="a" fill="var(--color-brand-blue-light)" name="Wireline" />
          <Line
            type="monotone"
            dataKey="Total"
            stroke="var(--color-success)"
            strokeWidth={3}
            dot={{ r: 4, stroke: 'var(--color-success)', fill: 'var(--color-success)' }}
            name="Total"
            legendType="line"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- Seller Stack Rank (YTD) ---- */
function SellerStackRank({ ranking }) {
  return (
    <div className="card leaderboard" tabIndex={0} aria-label="Seller Stack Rank YTD">
      <h2>
        <ChartBarIcon className="icon" /> Seller Stack Rank (YTD MRC)
      </h2>
      <ul>
        {ranking.map((seller, index) => (
          <li
            key={seller.Seller}
            className={
              index === 0 ? "gold" :
                index === 1 ? "silver" :
                  index === 2 ? "bronze" :
                    ""
            }
            tabIndex={0}
            aria-label={`#${index + 1} ${seller.Seller}: ${formatCurrency(seller.TotalMRC)}`}
          >
            <strong>{seller.Seller}</strong>
            <span>{formatCurrency(seller.TotalMRC)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- Current Month Sales Table ---- */
function SellerCurrentMonthDetailed({ salesData }) {
  const currentMonthYear = getCurrentMonthYear();
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("mrc");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [sellerSales, setSellerSales] = useState([]);
  const closeBtnRef = useRef();

  useEffect(() => {
    if (modalOpen && closeBtnRef.current) closeBtnRef.current.focus();
    function onKeyDown(e) {
      if (modalOpen && e.key === "Escape") setModalOpen(false);
    }
    if (modalOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const filteredSellers = useMemo(() => {
    let sellers = Object.values(
      salesData.reduce((acc, sale) => {
        if (sale.Month === currentMonthYear) {
          const name = sale.Seller || "Unknown";
          if (!acc[name]) {
            acc[name] = { Seller: name, TotalMRC: 0, Wireline: 0, Wireless: 0 };
          }
          acc[name].TotalMRC += sale.MRC || 0;
          if (isWireline(sale.Type)) {
            acc[name].Wireline += sale.MRC || 0;
          } else if (isWireless(sale.Type)) {
            acc[name].Wireless += sale.MRC || 0;
          }
        }
        return acc;
      }, {})
    );

    sellers = sellers.filter((s) =>
      s.Seller.toLowerCase().includes(sellerFilter.toLowerCase())
    );

    if (sortBy === "wireline") {
      sellers = [...sellers].sort((a, b) => b.Wireline - a.Wireline);
    } else if (sortBy === "wireless") {
      sellers = [...sellers].sort((a, b) => b.Wireless - a.Wireless);
    } else if (sortBy === "seller") {
      sellers = [...sellers].sort((a, b) => a.Seller.localeCompare(b.Seller));
    } else {
      sellers = [...sellers].sort((a, b) => b.TotalMRC - a.TotalMRC);
    }
    return sellers;
  }, [salesData, currentMonthYear, sellerFilter, sortBy]);

  const totals = useMemo(
    () =>
      filteredSellers.reduce(
        (acc, s) => ({
          TotalMRC: acc.TotalMRC + s.TotalMRC,
          Wireline: acc.Wireline + s.Wireline,
          Wireless: acc.Wireless + s.Wireless,
        }),
        { TotalMRC: 0, Wireline: 0, Wireless: 0 }
      ),
    [filteredSellers]
  );

  const handleSellerClick = (sellerName) => {
    setSelectedSeller(sellerName);
    const details = salesData.filter(
      (s) => s.Month === currentMonthYear && s.Seller === sellerName
    );
    setSellerSales(details);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedSeller(null);
    setSellerSales([]);
  };

  return (
    <div className="card current-month-card fade-in" tabIndex={0}>
      <h2>
        <ChartBarIcon className="icon" /> Current Month Sales ({currentMonthYear})
      </h2>
      <div className="controls">
        <div className="filter-controls">
          <label htmlFor="filter-seller">Filter Seller:</label>
          <input
            id="filter-seller"
            type="text"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            placeholder="Type seller name..."
            style={{
              background: "var(--color-card, #23273a)",
              color: "var(--color-text-primary, #fff)",
              border: "1px solid var(--color-brand-blue-light)"
            }}
          />
        </div>
        <div className="filter-controls">
          <label htmlFor="cm-sort">Sort By:</label>
          <select
            id="cm-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: "var(--color-card, #23273a)",
              color: "var(--color-text-primary, #fff)",
              border: "1px solid var(--color-brand-blue-light)"
            }}
          >
            <option value="mrc">Total MRC (High to Low)</option>
            <option value="wireline">Wireline (High to Low)</option>
            <option value="wireless">Wireless (High to Low)</option>
            <option value="seller">Seller (A-Z)</option>
          </select>
        </div>
      </div>
      <div className="table-container" tabIndex={0} style={{ maxHeight: 350, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Seller</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Total MRC</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Wireline</th>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Wireless</th>
            </tr>
          </thead>
          <tbody>
            {filteredSellers.map((seller, index) => (
              <tr
                key={seller.Seller}
                onClick={() => handleSellerClick(seller.Seller)}
                className="sales-table-row"
                tabIndex={0}
                aria-label={`Details for ${seller.Seller}`}
              >
                <td
                  className={
                    index === 0 ? "gold" :
                      index === 1 ? "silver" :
                        index === 2 ? "bronze" :
                          ""
                  }
                >
                  {seller.Seller}
                </td>
                <td>{formatCurrency(seller.TotalMRC)}</td>
                <td>{formatCurrency(seller.Wireline)}</td>
                <td>{formatCurrency(seller.Wireless)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{formatCurrency(totals.TotalMRC)}</td>
              <td>{formatCurrency(totals.Wireline)}</td>
              <td>{formatCurrency(totals.Wireless)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {modalOpen && (
        <div
          className="modal-backdrop"
          tabIndex={-1}
          aria-modal="true"
          role="dialog"
        >
          <div className="modal-content">
            <h2>
              {selectedSeller} - {currentMonthYear} Detailed Sales
            </h2>
            <div className="account-info">
              {sellerSales.map((sale, i) => (
                <div className="utility-row" key={i}>
                  <span className="row-label">MRC:</span>
                  <span className="row-value">{formatCurrency(sale.MRC)}</span>
                  <span className="row-label" style={{ marginLeft: 12 }}>Type:</span>
                  <span className="row-value">{sale.Type}</span>
                </div>
              ))}
            </div>
            <button
              className="refresh-btn refresh-btn--neutral w-100"
              onClick={closeModal}
              autoFocus
              ref={closeBtnRef}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Rolling 4 Months Table ---- */
function Rolling4Months({ salesData }) {
  const months = getLastFourMonths();
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("total");

  const aggregatedData = useMemo(() => {
    const dataBySeller = {};
    salesData.forEach(sale => {
      const { Seller, Month, MRC } = sale;
      if (!Seller || !Month || typeof MRC !== 'number') return;

      if (months.includes(Month)) {
        if (!dataBySeller[Seller]) {
          dataBySeller[Seller] = { Seller, TotalOverallMRC: 0 };
          months.forEach(m => {
            dataBySeller[Seller][m] = 0;
          });
        }
        dataBySeller[Seller][Month] += MRC;
        dataBySeller[Seller].TotalOverallMRC += MRC;
      }
    });

    let result = Object.values(dataBySeller);

    if (sellerFilter.trim() !== "") {
      result = result.filter(seller =>
        seller.Seller.toLowerCase().includes(sellerFilter.toLowerCase())
      );
    }

    if (sortBy === "total") {
      result.sort((a, b) => b.TotalOverallMRC - a.TotalOverallMRC);
    } else if (months.includes(sortBy)) {
      result.sort((a, b) => b[sortBy] - a[sortBy]);
    } else if (sortBy === "seller") {
      result.sort((a, b) => a.Seller.localeCompare(b.Seller));
    }

    return result;
  }, [salesData, months, sellerFilter, sortBy]);

  const grandTotals = useMemo(() => {
    const totals = { TotalOverallMRC: 0 };
    months.forEach(month => {
      totals[month] = 0;
    });

    aggregatedData.forEach(seller => {
      totals.TotalOverallMRC += seller.TotalOverallMRC;
      months.forEach(month => {
        totals[month] += seller[month] || 0;
      });
    });
    return totals;
  }, [aggregatedData, months]);

  // CSV Export Function
  const exportToCSV = () => {
    let csv = ["Seller", ...months, "4-Month Total"].join(",") + "\n";
    aggregatedData.forEach((seller) => {
      const row = [
        `"${seller.Seller}"`,
        ...months.map(m => seller[m] != null ? seller[m].toFixed(2) : "0.00"),
        seller.TotalOverallMRC != null ? seller.TotalOverallMRC.toFixed(2) : "0.00"
      ];
      csv += row.join(",") + "\n";
    });
    csv += [
      `"Grand Total"`,
      ...months.map(m => grandTotals[m] != null ? grandTotals[m].toFixed(2) : "0.00"),
      grandTotals.TotalOverallMRC != null ? grandTotals.TotalOverallMRC.toFixed(2) : "0.00"
    ].join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "netspark_rolling4months.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="card rolling-months fade-in">
      <h2>
        <ChartBarIcon className="icon" /> Rolling 4 Months Sales
      </h2>
      <p style={{ marginBottom: "8px" }}>
        Total MRC per seller for the last four months.
      </p>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
        <div className="filter-controls">
          <label htmlFor="r4-filter-seller">Filter Seller:</label>
          <input
            id="r4-filter-seller"
            type="text"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            placeholder="Type seller name..."
            style={{
              background: "var(--color-card, #23273a)",
              color: "var(--color-text-primary, #fff)",
              border: "1px solid var(--color-brand-blue-light)"
            }}
          />
        </div>
        <div className="filter-controls">
          <label htmlFor="r4-sort">Sort By:</label>
          <select
            id="r4-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: "var(--color-card, #23273a)",
              color: "var(--color-text-primary, #fff)",
              border: "1px solid var(--color-brand-blue-light)"
            }}
          >
            <option value="total">Overall Total (High to Low)</option>
            <option value="seller">Seller (A-Z)</option>
            {months.map(month => (
              <option key={month} value={month}>{month} (High to Low)</option>
            ))}
          </select>
        </div>
        <button
          className="refresh-btn"
          style={{ marginLeft: "auto" }}
          onClick={exportToCSV}
        >
          Export CSV
        </button>
      </div>
      <div className="table-container" style={{ maxHeight: 350, overflowY: "auto" }}>
        <table className="rolling-table">
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>Seller</th>
              {months.map(month => (
                <th key={month} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>{month}</th>
              ))}
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--color-card, #23273a)" }}>4-Month Total</th>
            </tr>
          </thead>
          <tbody>
            {aggregatedData.length > 0 ? (
              aggregatedData.map((seller, idx) => (
                <tr key={seller.Seller + idx}>
                  <td style={{ textAlign: "left" }}>{seller.Seller}</td>
                  {months.map(month => (
                    <td key={month + seller.Seller}>{formatCurrency(seller[month] || 0)}</td>
                  ))}
                  <td>{formatCurrency(seller.TotalOverallMRC)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={months.length + 2} style={{ textAlign: "center", fontStyle: "italic" }}>
                  No sellers match filter or no data for the last 4 months.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Grand Total</td>
              {months.map(month => (
                <td key={`total-${month}`}>{formatCurrency(grandTotals[month])}</td>
              ))}
              <td>{formatCurrency(grandTotals.TotalOverallMRC)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Main Dashboard Component
function Dashboard({ user, theme, setTheme }) {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const docsRef = useRef(new Set());

  const fetchSalesData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const snap = await getDocs(collection(db, "combined_sales_mrc"));
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSalesData(data);
      setLastUpdated(new Date().toLocaleTimeString());
      docsRef.current = new Set(data.map((d) => d.id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError("Failed to fetch sales data. Please try again later.");
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalesData();
    const unsubscribe = onSnapshot(
      collection(db, "combined_sales_mrc"),
      (snapshot) => {
        const updated = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setSalesData(updated);
        setLastUpdated(new Date().toLocaleTimeString());
        docsRef.current = new Set(updated.map((d) => d.id));
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError("Error listening to real-time updates.");
      }
    );
    return () => unsubscribe();
  }, [fetchSalesData]);

  const totalMRC = useMemo(
    () => salesData.reduce((sum, s) => sum + (s.MRC || 0), 0),
    [salesData]
  );

  const sellerRanking = useMemo(
    () =>
      Object.values(
        salesData.reduce((acc, sale) => {
          const name = sale.Seller || "Unknown";
          if (!acc[name]) acc[name] = { Seller: name, TotalMRC: 0 };
          acc[name].TotalMRC += sale.MRC || 0;
          return acc;
        }, {})
      ).sort((a, b) => b.TotalMRC - a.TotalMRC),
    [salesData]
  );

  if (loading) return <div className="loader" role="status">Loading...</div>;
  if (error) return <div className="error" role="alert">{error}</div>;
  if (!salesData.length) return <div className="no-data" role="status">No sales data available.</div>;

  return (
    <div className="App">
      <NavBar user={user} theme={theme} setTheme={setTheme} />
      <div className="dashboard-stack">
        <div className="card-row">
          <TotalMRC total={totalMRC} />
          <MTDCard salesData={salesData} />
        </div>
        <TotalRevenueForMonth salesData={salesData} />
        <SellerStackRank ranking={sellerRanking} />
        <SellerCurrentMonthDetailed salesData={salesData} />
        <Rolling4Months salesData={salesData} />
      </div>
    </div>
  );
}

export default Dashboard;
