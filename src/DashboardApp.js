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
  Line, // Import Line for the total MRC line
} from "recharts";
import "./App.css";
import { getUserRole } from "./utils/getUserRole"; // Ensure this utility is correctly imported

// Utility Functions (Unchanged)
const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
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
  // Return in chronological order (oldest to newest) for table headers
  return months.reverse();
}

// KPI Components (Unchanged)
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

// Total Revenue for Month Chart (Enhanced for Stacked Bars + Line)
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
      if (Type?.toLowerCase().includes("wireless")) {
        agg[Month].Wireless += MRC;
      } else if (Type?.toLowerCase().includes("wireline")) {
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


  return (
    <div className="card chart-card" tabIndex={0} aria-label="Total Revenue for Month with Wireline, Wireless, and Total MRC">
      <h2>
        <ChartBarIcon className="icon" /> Total Revenue for Month
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="month" stroke="var(--color-text-primary)" fontSize={13} hide={window.innerWidth < 600} />
          <YAxis stroke="var(--color-text-primary)" fontSize={13} tickFormatter={formatCurrency} />
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
          <Bar dataKey="Wireless" stackId="a" fill="#00C49F" name="Wireless MRC" /> {/* Green for Wireless */}
          <Bar dataKey="Wireline" stackId="a" fill="#0088FE" name="Wireline MRC" /> {/* Blue for Wireline */}
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#FF5F00"
            strokeWidth={2}
            dot={{ r: 4 }}
            name="Total MRC"
            label={{ position: 'top', formatter: formatCurrency, fill: 'var(--color-text-secondary)', fontSize: 11 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


// Seller Stack Rank (Enhanced Styling - no code changes here, relies on App.css)
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
            // Removed inline style as it's now handled by CSS classes for better separation
          >
            <strong>{seller.Seller}</strong>
            <span>{formatCurrency(seller.TotalMRC)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Current Month Drill-Down (Unchanged)
function SellerCurrentMonthDetailed({ salesData }) {
  const currentMonthYear = getCurrentMonthYear();
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("mrc");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [sellerSales, setSellerSales] = useState([]);
  const modalRef = useRef();

  useEffect(() => {
    if (modalOpen && modalRef.current) modalRef.current.focus();
  }, [modalOpen]);
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
          if (sale.Type?.toLowerCase().includes("wireline")) {
            acc[name].Wireline += sale.MRC || 0;
          } else {
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
      <div className="controls" style={{ marginBottom: "10px", flexWrap: "wrap" }}>
        <div className="filters">
          <label htmlFor="filter-seller">Filter Seller:</label>
          <input
            id="filter-seller"
            type="text"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            placeholder="Type seller name..."
            style={{
              marginLeft: "5px",
              padding: "5px",
              borderRadius: "6px",
              border: "1px solid #999",
              minWidth: 80,
            }}
          />
        </div>
        <div className="sort" style={{ marginLeft: 10 }}>
          <label htmlFor="cm-sort">Sort By:</label>
          <select
            id="cm-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ marginLeft: 5 }}
          >
            <option value="mrc">Total MRC (High to Low)</option>
            <option value="wireline">Wireline (High to Low)</option>
            <option value="wireless">Wireless (High to Low)</option>
            <option value="seller">Seller (A-Z)</option>
          </select>
        </div>
      </div>
      <div className="table-container" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Seller</th>
              <th>Total MRC</th>
              <th>Wireline</th>
              <th>Wireless</th>
            </tr>
          </thead>
          <tbody>
            {filteredSellers.map((seller, index) => (
              <tr
                key={seller.Seller}
                onClick={() => handleSellerClick(seller.Seller)}
                style={{ cursor: "pointer" }}
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
          ref={modalRef}
          aria-modal="true"
          role="dialog"
        >
          <div className="modal-content">
            <h2>
              {selectedSeller} - {currentMonthYear} Detailed Sales
            </h2>
            <div className="table-container" style={{ maxHeight: "300px" }}>
              <table>
                <thead>
                  <tr>
                    <th>MRC</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerSales.map((sale, i) => (
                    <tr key={i}>
                      <td>{formatCurrency(sale.MRC)}</td>
                      <td>{sale.Type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="refresh-btn" onClick={closeModal} autoFocus>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function Rolling4Months({ salesData }) {
  const months = getLastFourMonths(); // This now returns months in chronological order
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("total"); // Default sort by total across 4 months

  // Aggregate data for the rolling 4 months
  const aggregatedData = useMemo(() => {
    const dataBySeller = {};

    salesData.forEach(sale => {
      const { Seller, Month, MRC } = sale;
      if (!Seller || !Month || typeof MRC !== 'number') return;

      if (months.includes(Month)) { // Only include sales within the last 4 months
        if (!dataBySeller[Seller]) {
          dataBySeller[Seller] = { Seller, TotalOverallMRC: 0 };
          months.forEach(m => {
            dataBySeller[Seller][m] = 0; // Initialize MRC for each month
          });
        }
        dataBySeller[Seller][Month] += MRC;
        dataBySeller[Seller].TotalOverallMRC += MRC;
      }
    });

    let result = Object.values(dataBySeller);

    // Apply seller filter
    if (sellerFilter.trim() !== "") {
      result = result.filter(seller =>
        seller.Seller.toLowerCase().includes(sellerFilter.toLowerCase())
      );
    }

    // Apply sorting
    if (sortBy === "total") {
      result.sort((a, b) => b.TotalOverallMRC - a.TotalOverallMRC);
    } else if (months.includes(sortBy)) { // Sort by a specific month's MRC
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

  return (
    <div className="card rolling-months fade-in">
      <h2>
        <ChartBarIcon className="icon" /> Rolling 4 Months Sales
      </h2>
      <p style={{ marginBottom: "8px" }}>
        Total MRC per seller for the last four months.
      </p>
      <div className="controls" style={{ marginBottom: "12px", display: 'flex', gap: '10px', flexWrap: "wrap" }}>
        <div className="filter-controls">
          <label htmlFor="r4-filter-seller">Filter Seller:</label>
          <input
            id="r4-filter-seller"
            type="text"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            placeholder="Type seller name..."
          />
        </div>
        <div className="filter-controls">
          <label htmlFor="r4-sort">Sort By:</label>
          <select
            id="r4-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="total">Overall Total (High to Low)</option>
            <option value="seller">Seller (A-Z)</option>
            {months.map(month => (
              <option key={month} value={month}>{month} (High to Low)</option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-container">
        <table className="rolling-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Seller</th>
              {months.map(month => (
                <th key={month}>{month}</th>
              ))}
              <th>4-Month Total</th>
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
  // const [newSales, setNewSales] = useState([]); // REMOVED: No longer needed for toast
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
        // REMOVED: Logic for detecting new sales and setting newSales state
        docsRef.current = new Set(updated.map((d) => d.id));
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError("Error listening to real-time updates.");
      }
    );
    return () => unsubscribe();
  }, [fetchSalesData]);

  // REMOVED: useEffect for clearing newSales toasts is no longer needed
  // useEffect(() => {
  //   if (newSales.length > 0) {
  //     const timers = newSales.map((sale) =>
  //       setTimeout(() => {
  //         setNewSales((prev) => prev.filter((s) => s.id !== sale.id));
  //       }, 5000)
  //     );
  //     return () => timers.forEach((t) => clearTimeout(t));
  //   }
  // }, [newSales]);


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
      {/* REMOVED: Toast container for recent sales notifications */}
      {/* <div className="toast-container" aria-live="polite">
        {newSales.map((n) => (
          <div key={n.id} className="modal-content" tabIndex={0}>
            {n.message}
          </div>
        ))}
      </div> */}
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
      {/* REMOVED: Last updated notification for recent sales */}
      {/* {lastUpdated && (
        <div className="modal-content" aria-label="New sales data updated">
          New sales data loaded at {lastUpdated}!
        </div>
      )} */}
    </div>
  );
}

export default Dashboard;