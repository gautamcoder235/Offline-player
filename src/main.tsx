import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setupNativeHardening } from "./utils/nativeHardening";

// Initialize native desktop hardening in production
setupNativeHardening();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
