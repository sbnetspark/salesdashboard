// src/SellerLandingPage.js
import React, { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import "./App.css";
import { Link } from "react-router-dom";
import { getUserRole, ROLES } from "./utils/getUserRole";

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}
function getCurrentMonthYear() {
  const now = new Date();
  const months = [
    "January","February","March","April","May","June","July","August",
    "September","October","November","December"
  ];
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

const SellerLandingPage = ({ user }) => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState(ROLES.SELLER);

  useEffect(() => {
    const roleResult = getUserRole(user.email);
    setRole(roleResult);

    (async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, "combined_sales_mrc"));
        const allSales = snap.docs.map(doc => doc.data());
        // Match both by seller name (for initials) and full email (for future-proofing)
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

  if (loading) return <div className="loader">Loading your sales...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="App">
      <header className="App-header">
        <img src="/netspark-logo.png" alt="NetSpark Logo" style={{ height: "50px" }} />
        <div>
          <h1 tabIndex={0}>Welcome, {user.email}</h1>
          <p style={{ color: "#bbb" }}>Here’s a summary of your sales performance:</p>
        </div>
        <nav style={{ display: "flex", gap: "8px" }}>
          <Link to="/dashboard" className="refresh-btn" style={{ backgroundColor: "#ff6f32" }}>
            Team Dashboard
          </Link>
          {[ROLES.MANAGER, ROLES.EXECUTIVE].includes(role) && (
            <Link to="/management" className="refresh-btn" style={{ backgroundColor: "#9c27b0" }}>
              Management Dashboard
            </Link>
          )}
          {role === ROLES.EXECUTIVE && (
            <Link to="/executive" className="refresh-btn" style={{ backgroundColor: "#2196F3" }}>
              Executive Dashboard
            </Link>
          )}
        </nav>
      </header>
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
                  <tr key={i}>
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
    </div>
  );
};

export default SellerLandingPage;
