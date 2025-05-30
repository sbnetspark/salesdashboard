// src/index.js

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

// Ensure the root element exists before mounting (fail gracefully)
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found. Make sure there is a <div id='root'></div> in your index.html.");
}

const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Measure performance (optional; log to console or send to endpoint)
// To disable, simply comment out the line below.
reportWebVitals(console.log);
// For production analytics, you can use:
// reportWebVitals(metric => { sendToAnalyticsService(metric); });
