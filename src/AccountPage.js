import React, { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import NavBar from "./NavBar";
import { getUserRole, ROLES } from "./utils/getUserRole";
import "./App.css";

const AccountPage = ({ user, theme, setTheme }) => {
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLogoutModalOpen(false);
    } catch (err) {
      // Optionally handle/log error
    }
  };

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
            className="refresh-btn refresh-btn--danger sign-out-btn"
            onClick={() => setLogoutModalOpen(true)}
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

      {/* Sign Out Modal */}
      {logoutModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" tabIndex={-1}>
          <div className="modal-content">
            <h2>Confirm Sign Out</h2>
            <p>Are you sure you want to sign out?</p>
            <div className="filter-controls">
              <button
                className="refresh-btn refresh-btn--danger"
                onClick={handleLogout}
                aria-label="Confirm sign out"
              >
                Yes, Sign Out
              </button>
              <button
                className="refresh-btn refresh-btn--neutral"
                onClick={() => setLogoutModalOpen(false)}
                aria-label="Cancel sign out"
                autoFocus
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;
