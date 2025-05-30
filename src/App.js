// src/App.js
import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { getUserRole, ROLES } from "./utils/getUserRole";

// Lazy-load big dashboards for speed
const Dashboard = lazy(() => import("./DashboardApp"));
const ManagementDashboard = lazy(() => import("./ManagementDashboard"));
const ExecutiveDashboard = lazy(() => import("./ExecutiveDashboard"));
const SellerLandingPage = lazy(() => import("./SellerLandingPage"));

import LoginScreen from "./LoginScreen";
import SignupScreen from "./SignupScreen";
import EmailVerifyScreen from "./EmailVerifyScreen";

const ALLOWED_DOMAIN = "@netsparktelecom.com";

/**
 * Route handling based on role.
 * Each role only sees the routes they're allowed.
 */
function AppRouter({ user }) {
  const role = getUserRole(user.email);

  return (
    <Routes>
      {role === ROLES.SELLER && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          {/* Block all other routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {role === ROLES.MANAGER && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/management" element={<ManagementDashboard user={user} />} />
          <Route path="/executive" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {role === ROLES.EXECUTIVE && (
        <>
          <Route path="/" element={<SellerLandingPage user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/management" element={<ManagementDashboard user={user} />} />
          <Route path="/executive" element={<ExecutiveDashboard user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {/* For users not recognized (should never get here, but extra safe) */}
      <Route
        path="*"
        element={
          <main style={{ padding: 20 }}>
            <h2 tabIndex={0}>Access Denied</h2>
            <p>Contact IT for access.</p>
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

  // Set page title once
  useEffect(() => {
    document.title = "NetSpark Sales Dashboard";
  }, []);

  // Auth listener (single source of truth for user)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const email = (currentUser.email || "").trim().toLowerCase();
        // 1. Enforce domain
        if (!email.endsWith(ALLOWED_DOMAIN)) {
          setEmailDomainError(`Only ${ALLOWED_DOMAIN} emails are allowed.`);
          signOut(auth);
          setUser(null);
          setNeedsVerification(false);
          setAuthChecking(false);
          return;
        }
        // 2. Require email verification
        if (!currentUser.emailVerified) {
          setNeedsVerification(true);
          setEmailDomainError("");
          setUser(currentUser);
          setAuthChecking(false);
          return;
        }
        // 3. User is ready
        setNeedsVerification(false);
        setEmailDomainError("");
        setUser(currentUser);
        setAuthChecking(false);
      } else {
        // Not signed in
        setUser(null);
        setEmailDomainError("");
        setNeedsVerification(false);
        setAuthChecking(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Loader while checking auth
  if (authChecking) {
    return (
      <div className="loader" role="status" aria-live="polite">
        Checking your authentication...
      </div>
    );
  }

  // Blocked for non-company email
  if (emailDomainError) {
    return (
      <main className="login-gate" role="main" aria-label="Blocked - Email Domain">
        <div className="login-card">
          <p className="error" tabIndex={0}>{emailDomainError}</p>
          <button className="refresh-btn" onClick={() => signOut(auth)} autoFocus>
            Sign Out & Retry
          </button>
        </div>
      </main>
    );
  }

  // Blocked for needing email verification
  if (needsVerification && user) {
    return (
      <main className="login-gate" role="main" aria-label="Email Verification Required">
        <EmailVerifyScreen />
      </main>
    );
  }

  // Not signed in
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

  // Authenticated and ready
  return (
    <Router>
      <Suspense
        fallback={
          <div className="loader" role="status" aria-live="polite">
            Loading dashboard...
          </div>
        }
      >
        <AppRouter user={user} />
      </Suspense>
    </Router>
  );
}

export default App;
