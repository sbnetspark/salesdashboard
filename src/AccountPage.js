import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import NavBar from "./NavBar";
import { getUserRole, ROLES } from "./utils/getUserRole";
import "./App.css";

const AccountPage = ({ user, theme, setTheme }) => {
  const handleLogout = () => {
    // Add confirmation dialog for better UX
    if (window.confirm("Are you sure you want to sign out?")) {
      signOut(auth).catch((err) => console.error("Logout error:", err));
    }
  };

  // Derive display name from email
  const displayName = user?.email
    ? user.email
        .split("@")[0]
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "User";

  // Get role using getUserRole for accuracy
  const role = user?.email ? getUserRole(user.email) : "Unknown";
  const roleDisplay = role === ROLES.EXECUTIVE ? "Executive" :
                     role === ROLES.MANAGER ? "Manager" :
                     role === ROLES.SELLER ? "Seller" : "Unknown";

  return (
    <div className="App">
      <NavBar user={user} theme={theme} setTheme={setTheme} />
      <div className="dashboard-stack">
        <div className="card fade-in" tabIndex={0} aria-label="Account Information">
          <h2>Account Information</h2>
          <div className="account-info">
            <div className="account-field">
              <span className="account-label">Name:</span>
              <span className="account-value">{displayName}</span>
            </div>
            <div className="account-field">
              <span className="account-label">Email:</span>
              <span className="account-value">{user?.email || "N/A"}</span>
            </div>
            <div className="account-field">
              <span className="account-label">Role:</span>
              <span className="account-value">{roleDisplay}</span>
            </div>
          </div>
          <button
            className="refresh-btn sign-out-btn"
            onClick={handleLogout}
            aria-label="Sign out of your account"
          >
            Sign Out
          </button>
        </div>
        {/* Placeholder for future user activity visualization */}
        <div className="card fade-in" tabIndex={0} aria-label="User Activity Placeholder">
          <h2>User Activity</h2>
          <p className="no-data">User activity summary coming soon.</p>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;