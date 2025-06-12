// src/App.js
import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { getUserRole, ROLES } from "./utils/getUserRole";

import LoginScreen from "./LoginScreen";
import SignupScreen from "./SignupScreen";
import EmailVerifyScreen from "./EmailVerifyScreen";

// Lazy-load dashboards for speed
const Dashboard = lazy(() => import("./DashboardApp"));
const ManagementDashboard = lazy(() => import("./ManagementDashboard"));
const ExecutiveDashboard = lazy(() => import("./ExecutiveDashboard"));
const SellerLandingPage = lazy(() => import("./SellerLandingPage"));
const AccountPage = lazy(() => import("./AccountPage"));

const ALLOWED_DOMAIN = "@netsparktelecom.com";

/**
 * Route handling based on role.
 * Each role only sees the routes they're allowed.
 */
function AppRouter({ user, theme, setTheme }) {
  const role = getUserRole(user.email);

  return (
    <Routes>
      {role === ROLES.SELLER && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/dashboard" element={<Dashboard user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/account" element={<AccountPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/management" element={<Navigate to="/" replace />} />
          <Route path="/executive" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {role === ROLES.MANAGER && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/dashboard" element={<Dashboard user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/management" element={<ManagementDashboard theme={theme} setTheme={setTheme} />} />
          <Route path="/account" element={<AccountPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/executive" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {role === ROLES.EXECUTIVE && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/dashboard" element={<Dashboard user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="/management" element={<ManagementDashboard theme={theme} setTheme={setTheme} />} />
          <Route path="/executive" element={<ExecutiveDashboard theme={theme} setTheme={setTheme} />} />
          <Route path="/account" element={<AccountPage user={user} theme={theme} setTheme={setTheme} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {/* Fallback: Access denied page for unrecognized users */}
      <Route
        path="*"
        element={
          <main className="login-gate" role="main" aria-label="Access Denied">
            <div className="login-card" tabIndex={0}>
              <h2>Access Denied</h2>
              <p className="error" role="alert">
                You do not have access to this dashboard.<br />Contact IT for assistance.
              </p>
            </div>
          </main>
        }
      />
    </Routes>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [emailDomainError, setEmailDomainError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  // Set page title
  useEffect(() => {
    document.title = "NetSpark Sales Dashboard";
  }, []);

  // Theme management
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = (currentUser.email || "").trim().toLowerCase();
        if (!email.endsWith(ALLOWED_DOMAIN)) {
          setEmailDomainError(`Only ${ALLOWED_DOMAIN} emails are allowed.`);
          signOut(auth);
          setUser(null);
          setNeedsVerification(false);
          setAuthChecking(false);
          return;
        }
        if (!currentUser.emailVerified) {
          setNeedsVerification(true);
          setEmailDomainError("");
          setUser(currentUser);
          setAuthChecking(false);
          return;
        }
        setNeedsVerification(false);
        setEmailDomainError("");
        setUser(currentUser);
        setAuthChecking(false);
      } else {
        setUser(null);
        setEmailDomainError("");
        setNeedsVerification(false);
        setAuthChecking(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (authChecking) {
    return (
      <div className="loader" role="status" aria-live="polite">
        Checking your authentication...
      </div>
    );
  }

  if (emailDomainError) {
    return (
      <main className="login-gate" role="main" aria-label="Blocked - Email Domain">
        <div className="login-card" tabIndex={0}>
          <h2>Access Blocked</h2>
          <p className="error" role="alert">{emailDomainError}</p>
          <button
            className="refresh-btn refresh-btn--danger w-100"
            onClick={() => signOut(auth)}
            autoFocus
          >
            Sign Out & Retry
          </button>
        </div>
      </main>
    );
  }

  if (needsVerification && user) {
    return (
      <main className="login-gate" role="main" aria-label="Email Verification Required">
        <EmailVerifyScreen />
      </main>
    );
  }

  if (!user) {
    return showSignup ? (
      <main className="login-gate" role="main" aria-label="Sign Up">
        <SignupScreen onSwitchToLogin={() => setShowSignup(false)} />
      </main>
    ) : (
      <main className="login-gate" role="main" aria-label="Login">
        <LoginScreen onSwitchToSignup={() => setShowSignup(true)} />
      </main>
    );
  }

  return (
    <Router>
      <Suspense
        fallback={
          <div className="loader" role="status" aria-live="polite">
            Loading dashboard...
          </div>
        }
      >
        <AppRouter user={user} theme={theme} setTheme={setTheme} />
      </Suspense>
    </Router>
  );
}

export default App;
