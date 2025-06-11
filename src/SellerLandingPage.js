// src/SellerLandingPage.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import "./App.css";
import NavBar from "./NavBar";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

// --- Brand Utility ---
function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}

const MONTH_ORDER = [
  "January","February","March","April","May","June","July","August",
  "September","October","November","December"
];
const getAll2025Months = () => MONTH_ORDER.map((m) => `${m} 2025`);
const getCurrentMonthYear = () => {
  const now = new Date();
  return `${MONTH_ORDER[now.getMonth()]} ${now.getFullYear()}`;
};

// --- Bar Colors (use CSS vars if possible)
const BRAND_BLUE   = "var(--color-brand-blue-light)";
const BRAND_ORANGE = "var(--color-brand-orange)";
const BRAND_GREEN  = "var(--color-brand-green, #00c853)";

// --- Main Component ---
const SellerLandingPage = ({ user, theme, setTheme }) => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const closeBtnRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        const allSales = snap.docs.map(doc => doc.data());
        const sellerName = user.email.split("@")[0].replace(/\./g, " ").toLowerCase();
        const emailLower = user.email.toLowerCase();
        setSales(allSales.filter(
          s =>
            (s.Seller || "").toLowerCase() === sellerName ||
            (s.Seller || "").toLowerCase() === emailLower
        ));
      } catch (err) {
        setError("Failed to load sales.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const currentMonth = getCurrentMonthYear();
  const ytdMRC = useMemo(
    () => sales.reduce((sum, s) => sum + (s.MRC || 0), 0),
    [sales]
  );
  const mtdMRC = useMemo(
    () =>
      sales.filter(s => s.Month === currentMonth)
        .reduce((sum, s) => sum + (s.MRC || 0), 0),
    [sales, currentMonth]
  );

  // Always show Jan–Dec 2025, even if sales missing.
  // Group by wireline/wireless, and sum total.
  const monthlySalesData = useMemo(() => {
    const months = getAll2025Months();
    const result = months.map(month => ({
      month: month.split(' ')[0], // Jan, Feb, etc.
      wireline: 0,
      wireless: 0,
      total: 0,
    }));

    // Build month index for lookup
    const monthIndex = {};
    months.forEach((m, i) => { monthIndex[m] = i; });

    sales.forEach(s => {
      const idx = monthIndex[s.Month];
      if (typeof idx !== "number") return;
      const isWireline = s.Type && s.Type.toLowerCase().includes("wireline");
      const mrc = s.MRC || 0;
      if (isWireline) result[idx].wireline += mrc;
      else result[idx].wireless += mrc;
      result[idx].total += mrc;
    });
    return result;
  }, [sales]);

  const handleRowClick = (sale) => {
    setSelectedSale(sale);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSale(null);
  };
  useEffect(() => {
    if (isModalOpen && closeBtnRef.current) closeBtnRef.current.focus();
  }, [isModalOpen]);

  if (loading) return <div className="loader">Loading your sales...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="App">
      <NavBar user={user} theme={theme} setTheme={setTheme} />
      <div className="dashboard-stack">
        <div className="card-row">
          <div className="card metric-card">
            <h2>YTD MRC</h2>
            <p className="metric-value">{formatCurrency(ytdMRC)}</p>
          </div>
          <div className="card metric-card">
            <h2>MTD MRC</h2>
            <p className="metric-value">{formatCurrency(mtdMRC)}</p>
          </div>
        </div>

        {/* Month-over-Month Sales Chart */}
        <div className="card chart-card fade-in">
          <h2 style={{ color: "var(--color-brand-orange)" }}>
            <span style={{ verticalAlign: "middle", marginRight: 6 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'inline', verticalAlign: 'middle' }}>
                <rect width="20" height="20" fill="currentColor" />
              </svg>
            </span>
            Total Revenue for Month
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart
                data={monthlySalesData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value, name) =>
                    [formatCurrency(value),
                      name === "wireline"
                        ? "Wireline MRC"
                        : name === "wireless"
                        ? "Wireless (Mobility) MRC"
                        : name === "total"
                        ? "Total"
                        : name]}
                  labelStyle={{ color: '#000' }}
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.93)', border: '1px solid #999' }}
                  itemStyle={{ color: '#000' }}
                />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ color: "var(--color-text-primary)", fontSize: "0.92rem" }}
                />
                {/* Stacked bars: wireline, wireless */}
                <Bar dataKey="wireline" stackId="mrc" name="Wireline MRC" fill={BRAND_BLUE} />
                <Bar dataKey="wireless" stackId="mrc" name="Wireless (Mobility) MRC" fill={BRAND_ORANGE} />
                {/* Green total revenue line */}
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Revenue"
                  stroke={BRAND_GREEN}
                  strokeWidth={3}
                  dot={{ r: 4, stroke: BRAND_GREEN, fill: BRAND_GREEN }}
                  legendType="line"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card sales-list fade-in">
          <h2>Recent Sales</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>MRC</th>
                  <th>Type</th>
                  <th>Customer</th>
                </tr>
              </thead>
              <tbody>
                {[...sales].reverse().slice(0, 20).map((s, i) => (
                  <tr
                    key={i}
                    onClick={() => handleRowClick(s)}
                    className="sales-table-row"
                    tabIndex={0}
                    aria-label={`View sale details for ${s.Customer || "Customer"}, ${s.Month}`}
                  >
                    <td>{s.Month}</td>
                    <td>{formatCurrency(s.MRC)}</td>
                    <td>{s.Type}</td>
                    <td>{s.Customer || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sales.length === 0 && (
            <div className="no-data">No sales found for you (yet)!</div>
          )}
        </div>
      </div>

      {/* Sale Detail Modal */}
      {isModalOpen && selectedSale && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content">
            <h2>Sale Details</h2>
            <div className="account-info">
              <div className="account-field">
                <span className="account-label">Month:</span>
                <span className="account-value">{selectedSale.Month}</span>
              </div>
              <div className="account-field">
                <span className="account-label">Customer:</span>
                <span className="account-value">{selectedSale.Customer || "N/A"}</span>
              </div>
              <div className="account-field">
                <span className="account-label">Type:</span>
                <span className="account-value">{selectedSale.Type || "N/A"}</span>
              </div>
              <div className="account-field">
                <span className="account-label">MRC:</span>
                <span className="account-value">{formatCurrency(selectedSale.MRC)}</span>
              </div>
              {selectedSale.Notes && (
                <div className="account-field">
                  <span className="account-label">Notes:</span>
                  <span className="account-value" style={{textAlign: 'left', wordBreak: 'break-word'}}>{selectedSale.Notes}</span>
                </div>
              )}
            </div>
            <button
              className="refresh-btn refresh-btn--neutral"
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
};

export default SellerLandingPage;
