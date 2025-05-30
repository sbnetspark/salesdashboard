// src/EmailVerifyScreen.js
import React, { useState, useRef } from "react";
import { auth } from "./firebase";
import { sendEmailVerification, signOut } from "firebase/auth";
import "./App.css";

/**
 * NetSpark - Email Verification Required Screen
 * - Forces users to verify their email before using the dashboard.
 * - Accessible, clear, robust for internal users.
 */
function EmailVerifyScreen() {
  const [resendLoading, setResendLoading] = useState(false);
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendError, setSendError] = useState("");
  const errorRef = useRef();
  const successRef = useRef();

  // Focus feedback for accessibility
  React.useEffect(() => {
    if (sendError && errorRef.current) errorRef.current.focus();
    if (sendSuccess && successRef.current) successRef.current.focus();
  }, [sendError, sendSuccess]);

  const handleSendVerification = async () => {
    setSendError("");
    setSendSuccess("");
    if (!auth.currentUser) {
      setSendError("No authenticated user found.");
      return;
    }
    try {
      setResendLoading(true);
      await sendEmailVerification(auth.currentUser);
      setSendSuccess("Verification email sent! Check your inbox (and spam folder).");
    } catch (err) {
      setSendError(
        err?.message ||
          "Failed to send verification. Please try again or contact IT."
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      // No-op (could log to monitoring)
    }
  };

  return (
    <main
      className="login-gate"
      role="main"
      aria-label="Email Verification Required"
    >
      <div className="login-card" tabIndex={-1}>
        <img
          src="/netspark-logo.png"
          alt="NetSpark Logo"
          style={{ width: "200px", marginBottom: "20px" }}
        />
        <h2 tabIndex={0}>Please Verify Your Email</h2>
        <p>
          To use the <strong>NetSpark Sales Dashboard</strong>, you must verify your{" "}
          <strong>@netsparktelecom.com</strong> email.
        </p>
        <p style={{ color: "#888" }}>
          Check your inbox for a verification link. After verifying,{" "}
          <strong>sign out and log in again.</strong>
          <br />
          <small>
            Didn&apos;t get it? Check your spam folder, or resend below. If issues
            persist, contact your IT admin.
          </small>
        </p>

        {/* Error & Success Messages */}
        {sendError && (
          <p
            className="error"
            ref={errorRef}
            tabIndex={-1}
            aria-live="assertive"
            style={{ marginTop: "8px" }}
          >
            {sendError}
          </p>
        )}
        {sendSuccess && (
          <p
            style={{ color: "green", marginTop: "8px" }}
            ref={successRef}
            tabIndex={-1}
            aria-live="polite"
          >
            {sendSuccess}
          </p>
        )}

        <button
          className="refresh-btn"
          onClick={handleSendVerification}
          disabled={resendLoading}
          style={{ marginTop: "12px" }}
        >
          {resendLoading ? "Sending..." : "Resend Verification Email"}
        </button>
        <button
          className="refresh-btn"
          style={{ marginTop: "10px", backgroundColor: "#f44336" }}
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}

export default EmailVerifyScreen;
