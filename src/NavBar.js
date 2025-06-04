import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { getUserRole, ROLES } from "./utils/getUserRole";
import { SunIcon, MoonIcon } from "@heroicons/react/24/solid";
import "./App.css";

const NavBar = ({ user, theme, setTheme, deviceType }) => {
  const location = useLocation();
  const role = getUserRole(user?.email);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef();

  const displayName = user?.email
    ? user.email
        .split("@")[0]
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "User";

  const handleLogout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setLogoutModalOpen(false);
    } catch (err) {
      setError("Failed to sign out. Please try again.");
      console.error("Logout error:", err);
    }
  };

  useEffect(() => {
    if (logoutModalOpen && modalRef.current) modalRef.current.focus();
  }, [logoutModalOpen]);

  useEffect(() => {
    if (logoutModalOpen) {
      const handler = (e) => { if (e.key === "Escape") setLogoutModalOpen(false); };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [logoutModalOpen]);

  const dashboardLinks = [
    { to: "/", label: "My Sales", show: true, variant: "primary" },
    { to: "/dashboard", label: "Team", show: true, variant: "secondary" },
    {
      to: "/management",
      label: "Manager",
      show: [ROLES.MANAGER, ROLES.EXECUTIVE].includes(role),
      variant: "accent",
    },
    {
      to: "/executive",
      label: "Executive",
      show: role === ROLES.EXECUTIVE,
      variant: "info",
    },
    { to: "/account", label: "My Account", show: true, variant: "neutral" },
  ].filter((link) => link.show);

  return (
    <header className="App-header">
      <div className="navbar-brand">
        <img src="/netspark-logo.png" alt="NetSpark Logo" />
        <div className="navbar-text">
          <h1 tabIndex={0}>Welcome, {displayName}</h1>
          <p>Here's a summary of your sales performance...</p>
        </div>
      </div>
      <div className="navbar-actions">
        <nav className="topbar-nav" role="navigation" aria-label="Main navigation">
          {dashboardLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`refresh-btn refresh-btn--${link.variant}`}
              aria-current={location.pathname === link.to ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <button
            className="refresh-btn refresh-btn--danger"
            onClick={() => setLogoutModalOpen(true)}
            aria-label="Sign out"
          >
            Logout
          </button>
        </nav>
        <button
          className="refresh-btn refresh-btn--theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
        </button>
      </div>
      <div className="toast-container" aria-live="polite">
        {error && (
          <div className="toast toast-error" tabIndex={0}>
            {error}
          </div>
        )}
      </div>
      {logoutModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" tabIndex={-1} ref={modalRef}>
          <motion.div
            className="modal-content"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
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
          </motion.div>
        </div>
      )}
    </header>
  );
};

export default NavBar;