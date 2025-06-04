// src/SellerLandingPage.js
import React, { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import "./App.css";
import { Link } from "react-router-dom";
import { getUserRole, ROLES } from "./utils/getUserRole";
import NavBar from "./NavBar";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"; // Added Recharts components

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}

const MONTH_ORDER = [ // Defined MONTH_ORDER for consistent month sorting
  "January","February","March","April","May","June","July","August",
  "September","October","November","December"
];

function getCurrentMonthYear() {
  const now = new Date();
  const months = [
    "January","February","March","April","May","June","July","August",
    "September","October","November","December"
  ];
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

// Utility to get past months for the chart
function getPastMonths(numMonths) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < numMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.unshift(`${MONTH_ORDER[d.getMonth()]} ${d.getFullYear()}`);
  }
  return months;
}

const SellerLandingPage = ({ user, theme, setTheme }) => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSale, setSelectedSale] = useState(null); // State for selected sale detail
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility

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

  // Prepare data for Month-over-Month chart
  const monthlySalesData = useMemo(() => {
    const past12Months = getPastMonths(12);
    const aggregated = {};
    past12Months.forEach(month => {
      aggregated[month] = 0;
    });

    sales.forEach(s => {
      if (past12Months.includes(s.Month)) {
        aggregated[s.Month] += s.MRC || 0;
      }
    });

    return past12Months.map(month => ({
      month: month.split(' ')[0], // Just show month name for chart
      MRC: aggregated[month],
    }));
  }, [sales]);

  const handleRowClick = (sale) => {
    setSelectedSale(sale);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSale(null);
  };

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
          <h2>Monthly Sales Performance (MRC)</h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={monthlySalesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid #999' }}
                  itemStyle={{ color: '#000' }}
                />
                <Bar dataKey="MRC" fill="var(--color-accent)" name="Monthly MRC" />
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
                  <tr key={i} onClick={() => handleRowClick(s)} style={{ cursor: 'pointer' }}>
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
            <button className="refresh-btn" onClick={closeModal} autoFocus>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerLandingPage;