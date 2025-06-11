// src/SignupScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";

/**
 * NetSpark SignupScreen
 * - Only allows company email signups.
 * - Trims/lowercases email for safety.
 * - Accessibility and password manager–friendly.
 */
function SignupScreen({ onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const errorRef = useRef();
  const successRef = useRef();
  const emailInput = useRef(null);

  // Focus email field on mount
  useEffect(() => {
    if (emailInput.current) emailInput.current.focus();
  }, []);

  // Focus feedback for screen readers
  useEffect(() => {
    if (error && errorRef.current) errorRef.current.focus();
    if (success && successRef.current) successRef.current.focus();
  }, [error, success]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimmedEmail = email.trim().toLowerCase();

    // Company domain check
    if (!trimmedEmail.endsWith("@netsparktelecom.com")) {
      setError("Must use a @netsparktelecom.com email!");
      return;
    }

    // Password minimum length
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      // Create user
      const userCred = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );

      // Send email verification
      await sendEmailVerification(userCred.user);

      // Force sign out: user must verify before first login
      await signOut(auth);

      setSuccess(
        "Account created! Check your inbox for a verification link. After verifying, sign out and log in again."
      );
      setEmail("");
      setPassword("");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with that email already exists.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email format.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else {
        setError(
          err.message || "Signup failed. Please check your info and try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-gate" role="main" aria-label="Sign Up">
      <div className="login-card" tabIndex={-1}>
        <img
          src="/netspark-logo.png"
          alt="NetSpark Logo"
          className="navbar-logo"
        />
        <h2>Create a NetSpark Account</h2>
        <form onSubmit={handleSignup} autoComplete="on">
          <div className="form-group">
            <label htmlFor="signup-email">Email:</label>
            <input
              ref={emailInput}
              id="signup-email"
              type="email"
              placeholder="you@netsparktelecom.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="signup-password">Password:</label>
            <input
              id="signup-password"
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {error && (
            <p
              className="error"
              ref={errorRef}
              tabIndex={-1}
              aria-live="assertive"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              className="success"
              ref={successRef}
              tabIndex={-1}
              aria-live="polite"
            >
              {success}
            </p>
          )}
          <button
            type="submit"
            className="refresh-btn"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <p style={{ marginTop: "10px" }}>
          Already have an account?{" "}
          <button
            type="button"
            className="refresh-btn refresh-btn--neutral"
            onClick={onSwitchToLogin}
            tabIndex={0}
          >
            Sign In
          </button>
        </p>
      </div>
    </main>
  );
}

export default SignupScreen;
