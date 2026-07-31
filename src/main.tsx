import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import { startVersionWatch } from "./lib/version";

startVersionWatch();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
