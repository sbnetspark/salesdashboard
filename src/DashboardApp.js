// src/DashboardApp.js
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db, auth } from "./firebase";
import { signOut } from "firebase/auth";
import { Link, useLocation } from "react-router-dom";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import "./App.css";
import { getUserRole, ROLES } from "./utils/getUserRole";

// ---- Utility ----
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
function getLastThreeMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const tempDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = MONTH_ORDER[tempDate.getMonth()];
    const year = tempDate.getFullYear();
    months.push(`${monthName} ${year}`);
  }
  return months;
}

// ---- 1) KPI Components ----
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

// ---- 2) MonthlyStackedBar ----
function MonthlyStackedBar({ salesData }) {
  const monthlyArray = useMemo(() => {
    const agg = {};
    salesData.forEach((sale) => {
      const { Month, MRC, Type } = sale;
      if (!Month) return;
      if (!agg[Month]) agg[Month] = { wireline: 0, mobility: 0 };
      if (Type?.toLowerCase().includes("wireline")) {
        agg[Month].wireline += MRC || 0;
      } else {
        agg[Month].mobility += MRC || 0;
      }
    });
    return Object.entries(agg)
      .map(([month, vals]) => ({
        month,
        wireline: vals.wireline,
        mobility: vals.mobility,
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
    <div className="card chart-card" tabIndex={0} aria-label="Monthly Wireline vs. Mobility">
      <h2>
        <ChartBarIcon className="icon" /> Monthly Wireline vs. Mobility
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={monthlyArray}>
          <XAxis dataKey="month" stroke="#fff" fontSize={13} hide={window.innerWidth < 600} />
          <YAxis stroke="#fff" fontSize={13} />
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
          <Legend />
          <Bar dataKey="wireline" stackId="mrc" fill="#ff6f32" name="Wireline" />
          <Bar dataKey="mobility" stackId="mrc" fill="#00bfff" name="Mobility" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- 3) Seller Stack Rank ----
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
              index === 0 ? "gold"
                : index === 1 ? "silver"
                : index === 2 ? "bronze"
                : ""
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

// ---- 4) Current Month Drill-Down (Modal) ----
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

  // --- ALL filtering and sorting inside useMemo ---
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

    // Filter
    sellers = sellers.filter((s) =>
      s.Seller.toLowerCase().includes(sellerFilter.toLowerCase())
    );

    // Sort
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

/*------------------------------------------------
  5) Rolling 3 Months
------------------------------------------------*/
function Rolling3Months({ salesData }) {
  const months = getLastThreeMonths();
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState("mrc");

  // All filter/sort logic in a useMemo!
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

      // Filter by seller name
      if (sellerFilter.trim() !== "") {
        resultArray = resultArray.filter((r) =>
          r.seller.toLowerCase().includes(sellerFilter.toLowerCase())
        );
      }

      // Sort
      if (sortBy === "wireline") {
        resultArray.sort((a, b) => b.wireline - a.wireline);
      } else if (sortBy === "wireless") {
        resultArray.sort((a, b) => b.wireless - a.wireless);
      } else if (sortBy === "seller") {
        resultArray.sort((a, b) => a.seller.localeCompare(b.seller));
      } else {
        // "mrc"
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
        <ChartBarIcon className="icon" /> Rolling 3 Months
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
          <label htmlFor="r3-sort">Sort By:</label>
          <select
            id="r3-sort"
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

/*------------------------------------------------
  6) Individual Sales
------------------------------------------------*/
function IndividualSalesList({ sales }) {
  const [filters, setFilters] = useState({ month: "", seller: "", type: "" });
  const [sortBy, setSortBy] = useState("month");
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;
  const [showSellerTotals, setShowSellerTotals] = useState(false);

  const validSales = sales.filter(
    (s) => s.Month && s.Month.includes(" ")
  );

  const uniqueMonths = useMemo(() => [...new Set(validSales.map((s) => s.Month))].sort(
    (a, b) => {
      const [ma, ya] = a.split(" ");
      const [mb, yb] = b.split(" ");
      const yearDiff = parseInt(ya, 10) - parseInt(yb, 10);
      if (yearDiff !== 0) return yearDiff;
      return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
    }
  ), [validSales]);
  const uniqueSellers = useMemo(() => [...new Set(validSales.map((s) => s.Seller))].sort(), [validSales]);
  const uniqueTypes = useMemo(() => [...new Set(validSales.map((s) => s.Type))].sort(), [validSales]);

  const filteredSales = useMemo(() =>
    validSales.filter((sale) => {
      if (filters.month && sale.Month !== filters.month) return false;
      if (filters.seller && sale.Seller !== filters.seller) return false;
      if (filters.type && sale.Type !== filters.type) return false;
      return true;
    }), [filters, validSales]
  );

  const totalFilteredSales = useMemo(
    () => filteredSales.reduce((sum, sale) => sum + (sale.MRC || 0), 0),
    [filteredSales]
  );

  const sortedSales = useMemo(() => {
    function wirelineValue(obj) {
      return obj.Type?.toLowerCase().includes("wireline") ? (obj.MRC || 0) : 0;
    }
    function wirelessValue(obj) {
      return obj.Type?.toLowerCase().includes("wireless") ||
        obj.Type?.toLowerCase().includes("mobility")
        ? (obj.MRC || 0)
        : 0;
    }

    const arr = [...filteredSales];
    if (sortBy === "wireline") {
      arr.sort((a, b) => wirelineValue(b) - wirelineValue(a));
    } else if (sortBy === "wireless") {
      arr.sort((a, b) => wirelessValue(b) - wirelessValue(a));
    } else if (sortBy === "mrc") {
      arr.sort((a, b) => (b.MRC || 0) - (a.MRC || 0));
    } else if (sortBy === "seller") {
      arr.sort((a, b) => a.Seller.localeCompare(b.Seller));
    } else {
      // default "month"
      const [mA, yA] = a.Month.split(" ");
      const [mB, yB] = b.Month.split(" ");
      const yearDiff = parseInt(yA, 10) - parseInt(yB, 10);
      if (yearDiff !== 0) return yearDiff;
      return MONTH_ORDER.indexOf(mA) - MONTH_ORDER.indexOf(mB);
    }
    return arr;
  }, [filteredSales, sortBy]);

  const paginatedSales = sortedSales.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );
  const totalPages = Math.ceil(sortedSales.length / rowsPerPage);

  const sellerTotalsArray = useMemo(() => {
    const sellerTotalsObj = filteredSales.reduce((acc, sale) => {
      if (!acc[sale.Seller]) acc[sale.Seller] = 0;
      acc[sale.Seller] += sale.MRC || 0;
      return acc;
    }, {});
    return Object.entries(sellerTotalsObj).map(
      ([seller, total]) => ({ seller, total })
    );
  }, [filteredSales]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(0);
  };

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
    setPage(0);
  };

  const handleExportCSV = () => {
    const headers = ["Month", "Seller", "MRC", "Type"];
    const rows = filteredSales.map((s) => [
      s.Month,
      s.Seller,
      (s.MRC || 0).toFixed(2),
      s.Type,
    ]);

    let csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.map((r) => r.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "individual_sales.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card sales-list fade-in">
      <h2>
        <ChartBarIcon className="icon" /> Individual Sales
      </h2>

      <div className="controls" style={{ flexWrap: "wrap" }}>
        <div className="filters" style={{ marginBottom: 7 }}>
          <select name="month" value={filters.month} onChange={handleFilterChange}>
            <option value="">All Months</option>
            {uniqueMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select name="seller" value={filters.seller} onChange={handleFilterChange}>
            <option value="">All Sellers</option>
            {uniqueSellers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="type" value={filters.type} onChange={handleFilterChange}>
            <option value="">All Types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="sort" style={{ marginLeft: 7 }}>
          <label htmlFor="sortBy">Sort By: </label>
          <select id="sortBy" value={sortBy} onChange={handleSortChange}>
            <option value="month">Month</option>
            <option value="seller">Seller (A-Z)</option>
            <option value="mrc">Total MRC (High to Low)</option>
            <option value="wireline">Wireline (High to Low)</option>
            <option value="wireless">Wireless (High to Low)</option>
          </select>
        </div>
      </div>

      <div className="sales-total">
        <strong>Total: {formatCurrency(totalFilteredSales)}</strong>
      </div>

      <button
        className="refresh-btn"
        style={{ marginRight: "10px", marginBottom: "10px" }}
        onClick={() => setShowSellerTotals(!showSellerTotals)}
      >
        {showSellerTotals ? "Hide" : "Show"} Seller Totals
      </button>
      <button
        className="refresh-btn"
        style={{ marginBottom: "10px" }}
        onClick={handleExportCSV}
      >
        Export CSV
      </button>

      {showSellerTotals && (
        <div
          className="table-container"
          style={{ maxHeight: "200px", marginBottom: "15px" }}
        >
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Total MRC</th>
              </tr>
            </thead>
            <tbody>
              {sellerTotalsArray.map(({ seller, total }) => (
                <tr key={seller}>
                  <td>{seller}</td>
                  <td>{formatCurrency(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Seller</th>
              <th>MRC</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSales.map((sale, idx) => (
              <tr key={idx}>
                <td>{sale.Month}</td>
                <td>{sale.Seller}</td>
                <td>{formatCurrency(sale.MRC)}</td>
                <td>{sale.Type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page === totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ---- 7) Main Dashboard Component ----
function Dashboard({ user }) {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [newSales, setNewSales] = useState([]);
  const docsRef = useRef(new Set());
  const location = useLocation();

  const role = useMemo(() => getUserRole(user?.email), [user]);

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

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const navLinks = useMemo(() => {
    const links = [
      {
        show: true,
        to: "/dashboard",
        label: "Team Dashboard",
        style: {},
        ariaCurrent: location.pathname === "/dashboard" ? "page" : undefined,
      },
      {
        show: [ROLES.MANAGER, ROLES.EXECUTIVE].includes(role),
        to: "/management",
        label: "Management Dashboard",
        style: { backgroundColor: "#9c27b0" },
        ariaCurrent: location.pathname === "/management" ? "page" : undefined,
      },
      {
        show: role === ROLES.EXECUTIVE,
        to: "/executive",
        label: "Executive Dashboard",
        style: { backgroundColor: "#2196F3" },
        ariaCurrent: location.pathname === "/executive" ? "page" : undefined,
      },
    ];
    return links.filter((l) => l.show);
  }, [role, location.pathname]);

  const handleRefresh = () => fetchSalesData();
  const handleLogout = () => {
    signOut(auth).catch((err) => {
      console.error("Error logging out:", err);
    });
  };

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
      <div className="toast-container" aria-live="polite">
        {newSales.map((n) => (
          <div key={n.id} className="toast" tabIndex={0}>
            {n.message}
          </div>
        ))}
      </div>
      <header className="App-header" style={{ padding: "9px 14px", marginBottom: 20 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0
        }}>
          <img src="/netspark-logo.png" alt="NetSpark Logo" style={{
            height: window.innerWidth < 600 ? 36 : 48,
            width: "auto",
            marginRight: 6,
            marginLeft: 0
          }} />
          <div style={{ minWidth: 0 }}>
            <h1 tabIndex={0} style={{
              fontSize: window.innerWidth < 600 ? "1.12rem" : undefined,
              lineHeight: "1.2",
              margin: 0
            }}>NETSPARK MRC DASHBOARD</h1>
            {lastUpdated && (
              <p className="last-updated" style={{
                fontSize: window.innerWidth < 600 ? "0.91rem" : undefined
              }}>Last Updated: {lastUpdated}</p>
            )}
          </div>
        </div>
        <nav className="topbar-nav" style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          alignItems: "center",
          minWidth: 0
        }}>
          <button
            className="refresh-btn"
            style={{ padding: window.innerWidth < 500 ? "7px 10px" : undefined, fontSize: window.innerWidth < 500 ? "0.98em" : undefined }}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="refresh-btn"
            style={{ padding: window.innerWidth < 500 ? "7px 10px" : undefined, fontSize: window.innerWidth < 500 ? "0.98em" : undefined }}
            onClick={handleRefresh}>
            Refresh
          </button>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="refresh-btn"
              style={{
                ...link.style,
                padding: window.innerWidth < 500 ? "7px 10px" : undefined,
                fontSize: window.innerWidth < 500 ? "0.98em" : undefined
              }}
              aria-current={link.ariaCurrent}
            >
              {link.label}
            </Link>
          ))}
          <button
            className="refresh-btn"
            style={{
              backgroundColor: "#f44336",
              padding: window.innerWidth < 500 ? "7px 10px" : undefined,
              fontSize: window.innerWidth < 500 ? "0.98em" : undefined
            }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </nav>
      </header>
      <div className="dashboard-stack">
        <div className="card-row">
          <TotalMRC total={totalMRC} />
          <MTDCard salesData={salesData} />
        </div>
        <MonthlyStackedBar salesData={salesData} />
        <SellerStackRank ranking={sellerRanking} />
        <SellerCurrentMonthDetailed salesData={salesData} />
        <Rolling3Months salesData={salesData} />
        <IndividualSalesList sales={salesData} />
      </div>
      {lastUpdated && (
        <div className="update-notification" aria-live="polite">
          New sales data loaded at {lastUpdated}!
        </div>
      )}
    </div>
  );
}

export default Dashboard;
