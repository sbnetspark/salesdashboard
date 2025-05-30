// src/LoginScreen.js
import React, { useState, useRef, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";

/**
 * NetSpark LoginScreen
 * - Accessible, secure, robust login form
 * - Handles email and password input (with full validation)
 * - On success, App.js handles all redirects
 */
function LoginScreen({ onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef();
  const emailInput = useRef(null);

  // Always focus email on mount
  useEffect(() => {
    if (emailInput.current) emailInput.current.focus();
  }, []);

  // Focus error for screen readers
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const safeEmail = email.trim().toLowerCase();

    try {
      await signInWithEmailAndPassword(auth, safeEmail, password);
      // Success: App.js handles redirect
    } catch (err) {
      if (err.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again or reset your password.");
      } else if (err.code === "auth/user-not-found") {
        setError("No user found with that email.");
      } else if (err.code === "auth/too-many-requests") {
        setError(
          "Too many failed attempts. Please wait a few minutes and try again."
        );
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Please check your internet connection.");
      } else {
        setError(
          err.message || "Login failed. Please check your credentials and try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-gate" role="main" aria-label="Login">
      <div className="login-card" tabIndex={-1}>
        <img
          src="/netspark-logo.png"
          alt="NetSpark Logo"
          style={{ width: "200px", marginBottom: "20px" }}
        />
        <h2>NetSpark Dashboard Login</h2>
        <form onSubmit={handleLogin} autoComplete="on">
          <div className="form-group">
            <label htmlFor="login-email">Email:</label>
            <input
              ref={emailInput}
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@netsparktelecom.com"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password:</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p
              className="error"
              ref={errorRef}
              tabIndex={-1}
              aria-live="assertive"
              style={{ marginTop: "8px" }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="refresh-btn"
            disabled={loading}
            style={{ marginTop: "10px" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p style={{ marginTop: "10px" }}>
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="refresh-btn"
            style={{ backgroundColor: "#444" }}
            onClick={onSwitchToSignup}
            tabIndex={0}
          >
            Sign Up
          </button>
        </p>
      </div>
    </main>
  );
}

export default LoginScreen;
