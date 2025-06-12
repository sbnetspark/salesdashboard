import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { getUserRole, ROLES } from "./utils/getUserRole";
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon } from "@heroicons/react/24/solid";
import "./App.css";

const NavBar = ({ user, theme, setTheme }) => {
  const location = useLocation();
  const role = getUserRole(user?.email);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef();

  // Display name logic
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
      setMobileMenuOpen(false);
    } catch (err) {
      setError("Failed to sign out. Please try again.");
      console.error("Logout error:", err);
    }
  };

  // Accessibility: Escape closes modal
  useEffect(() => {
    if (logoutModalOpen && modalRef.current) modalRef.current.focus();
  }, [logoutModalOpen]);

  useEffect(() => {
    if (logoutModalOpen) {
      const handler = (e) => {
        if (e.key === "Escape") setLogoutModalOpen(false);
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [logoutModalOpen]);

  // Accessibility: Escape closes mobile menu
  useEffect(() => {
    if (mobileMenuOpen) {
      const handler = (e) => {
        if (e.key === "Escape") setMobileMenuOpen(false);
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [mobileMenuOpen]);

  // Dashboard links (shown/hidden by role)
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

  // Close mobile menu on nav
  const handleNavClick = () => setMobileMenuOpen(false);

  return (
    <header className="App-header navbar-root">
      <div className="navbar-brand">
        <Link to="/" tabIndex={0} aria-label="Go to My Sales Dashboard" className="navbar-logo-link">
          <img src="/netspark-logo.png" alt="NetSpark Logo" className="navbar-logo" />
        </Link>
        <div className="navbar-text">
          <h1 tabIndex={0}>Welcome, {displayName}</h1>
          <p className="navbar-subtitle">Here's a summary of your sales performance...</p>
        </div>
      </div>

      {/* --- Desktop Nav (hidden on mobile) --- */}
      <nav className="topbar-nav desktop-nav" role="navigation" aria-label="Main navigation">
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
          title="Sign out"
          type="button"
        >
          Logout
        </button>
        <button
          className="refresh-btn refresh-btn--theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          type="button"
        >
          {theme === "dark" ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
        </button>
      </nav>

      {/* --- Hamburger for Mobile --- */}
      <button
        className="navbar-hamburger mobile-nav"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-menu"
        onClick={() => setMobileMenuOpen((open) => !open)}
        type="button"
      >
        {mobileMenuOpen ? <XMarkIcon className="icon" /> : <Bars3Icon className="icon" />}
      </button>

      {/* --- Mobile Slide-Out Menu --- */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            className="navbar-mobile-menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            tabIndex={-1}
            role="menu"
            aria-label="Mobile navigation"
          >
            <div className="mobile-menu-header">
              <img src="/netspark-logo.png" alt="NetSpark Logo" className="navbar-logo" />
              <button
                className="navbar-hamburger"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                <XMarkIcon className="icon" />
              </button>
            </div>
            <div className="mobile-menu-links">
              {dashboardLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`refresh-btn mobile refresh-btn--${link.variant} ${
                    location.pathname === link.to ? "active" : ""
                  }`}
                  onClick={handleNavClick}
                  role="menuitem"
                  tabIndex={0}
                >
                  {link.label}
                </Link>
              ))}
              <button
                className="refresh-btn mobile refresh-btn--danger"
                onClick={() => {
                  setLogoutModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                aria-label="Sign out"
                type="button"
              >
                Logout
              </button>
              <button
                className="refresh-btn mobile refresh-btn--theme"
                onClick={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setMobileMenuOpen(false);
                }}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                type="button"
              >
                {theme === "dark" ? <SunIcon className="icon" /> : <MoonIcon className="icon" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <h2>Confirm Sign Out</h2>
            <p>Are you sure you want to sign out?</p>
            <div className="filter-controls">
              <button
                className="refresh-btn refresh-btn--danger"
                onClick={handleLogout}
                aria-label="Confirm sign out"
                type="button"
              >
                Yes, Sign Out
              </button>
              <button
                className="refresh-btn refresh-btn--neutral"
                onClick={() => setLogoutModalOpen(false)}
                aria-label="Cancel sign out"
                type="button"
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
