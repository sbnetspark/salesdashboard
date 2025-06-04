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
} from "recharts";
import "./App.css";
import { getUserRole } from "./utils/getUserRole";

// Utility
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
  return months;
}

// KPI Components
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

// Total Revenue for Month (Replaces MonthlyStackedBar)
function TotalRevenueForMonth({ salesData }) {
  const monthlyArray = useMemo(() => {
    const agg = {};
    salesData.forEach((sale) => {
      const { Month, MRC } = sale;
      if (!Month) return;
      if (!agg[Month]) agg[Month] = 0;
      agg[Month] += MRC || 0;
    });
    return Object.entries(agg)
      .map(([month, total]) => ({
        month,
        total,
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
    <div className="card chart-card" tabIndex={0} aria-label="Total Revenue for Month">
      <h2>
        <ChartBarIcon className="icon" /> Total Revenue for Month
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={monthlyArray}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#fff" fontSize={13} hide={window.innerWidth < 600} />
          <YAxis stroke="#fff" fontSize={13} tickFormatter={formatCurrency} />
          <Tooltip
            formatter={formatCurrency}
            labelStyle={{ color: "#000" }}
            contentStyle={{
              backgroundColor: "rgba(255,255,255,0.92)",
              border: "1px solid #ff6f32",
              borderRadius: "7px",
            }}
            itemStyle={{ color: "#000" }}
          />
          <Bar dataKey="total" fill="#ff6f32" name="Total MRC" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Seller Stack Rank (Enhanced Styling)
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
            style={{
              borderLeft: index < 3 ? `4px solid var(--${["gold", "silver", "bronze"][index]})` : "none",
            }}
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

// Rolling 4 Months (Updated from Rolling3Months)
function Rolling4Months({ salesData }) {
  const months = getLastFourMonths();
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("mrc");

  const monthCards = useMemo(() => {
    return months.map((mStr) => {
      const monthlySales = salesData.filter((s) => s.Month === mStr);
      const agg = {};

      monthlySales.forEach((s) => {
        const name = s.Seller || "Unknown";
        if (!agg[name]) agg[name] = { wireline: 0, wireless: 0 };
        if (s.Type?.toLowerCase().includes("wireline")) {
          agg[name].wireline += s.MRC || 0;
        } else {
          agg[name].wireless += s.MRC || 0;
        }
      });

      let resultArray = Object.entries(agg).map(([seller, obj]) => ({
        seller,
        wireline: obj.wireline,
        wireless: obj.wireless,
        total: obj.wireline + obj.wireless,
      }));

      if (sellerFilter.trim() !== "") {
        resultArray = resultArray.filter((r) =>
          r.seller.toLowerCase().includes(sellerFilter.toLowerCase())
        );
      }

      if (sortBy === "wireline") {
        resultArray.sort((a, b) => b.wireline - a.wireline);
      } else if (sortBy === "wireless") {
        resultArray.sort((a, b) => b.wireless - a.wireless);
      } else if (sortBy === "seller") {
        resultArray.sort((a, b) => a.seller.localeCompare(b.seller));
      } else {
        resultArray.sort((a, b) => b.total - a.total);
      }

      return {
        mStr,
        resultArray,
      };
    });
  }, [months, salesData, sellerFilter, sortBy]);

  return (
    <div className="card rolling-months fade-in">
      <h2>
        <ChartBarIcon className="icon" /> Rolling 4 Months
      </h2>
      <p style={{ marginBottom: "8px" }}>
        Aggregated by seller (Wireline + Wireless)
      </p>
      <div className="controls" style={{ marginBottom: "12px", flexWrap: "wrap" }}>
        <div className="filters">
          <label>Filter Seller:</label>
          <input
            type="text"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            placeholder="Type seller name..."
            style={{
              marginLeft: "4px",
              padding: "5px",
              borderRadius: "6px",
              border: "1px solid #999",
              minWidth: 75,
            }}
          />
        </div>
        <div className="sort" style={{ marginLeft: 10 }}>
          <label htmlFor="r4-sort">Sort By:</label>
          <select
            id="r4-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ marginLeft: 4 }}
          >
            <option value="mrc">Total MRC (High to Low)</option>
            <option value="wireline">Wireline (High to Low)</option>
            <option value="wireless">Wireless (High to Low)</option>
            <option value="seller">Seller (A-Z)</option>
          </select>
        </div>
      </div>
      {monthCards.map(({ mStr, resultArray }) => (
        <div className="month-card" key={mStr}>
          <h3>{mStr}</h3>
          <div className="table-container">
            <table className="rolling-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Seller</th>
                  <th>Wireline</th>
                  <th>Wireless</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {resultArray.map((row, idx) => (
                  <tr key={row.seller + idx}>
                    <td style={{ textAlign: "left" }}>{row.seller}</td>
                    <td>{formatCurrency(row.wireline)}</td>
                    <td>{formatCurrency(row.wireless)}</td>
                    <td>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {resultArray.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", fontStyle: "italic" }}>
                      No sellers match filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Dashboard Component
function Dashboard({ user, theme, setTheme }) {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [newSales, setNewSales] = useState([]);
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
        updated.forEach((item) => {
          if (!docsRef.current.has(item.id)) {
            setNewSales((prev) => [
              ...prev,
              {
                id: item.id,
                message: `New Sale! Seller: ${item.Seller || "Unknown"} MRC: ${formatCurrency(item.MRC || 0)}`,
              },
            ]);
          }
        });
        docsRef.current = new Set(updated.map((d) => d.id));
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setError("Error listening to real-time updates.");
      }
    );
    return () => unsubscribe();
  }, [fetchSalesData]);

  useEffect(() => {
    if (newSales.length > 0) {
      const timers = newSales.map((sale) =>
        setTimeout(() => {
          setNewSales((prev) => prev.filter((s) => s.id !== sale.id));
        }, 5000)
      );
      return () => timers.forEach((t) => clearTimeout(t));
    }
  }, [newSales]);

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
      <div className="toast-container" aria-live="polite">
        {newSales.map((n) => (
          <div key={n.id} className="modal-content" tabIndex={0}>
            {n.message}
          </div>
        ))}
      </div>
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
      {lastUpdated && (
        <div className="modal-content" aria-label="New sales data updated">
          New sales data loaded at {lastUpdated}!
        </div>
      )}
    </div>
  );
}

export default Dashboard;