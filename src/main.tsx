import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts (#23, #129, #513) — must load before app styles.
import "@fontsource/fraunces/300.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";

const ZOOM_KEY = "biturbo.uiZoom";

/** WebKitGTK (WSL) ignores CSS `zoom`; scale #root via CSS variables instead. */
function applyUiZoom(zoom: number) {
  const html = document.documentElement;
  if (!Number.isFinite(zoom) || zoom <= 0) return;

  if (zoom === 1) {
    html.style.removeProperty("--biturbo-ui-zoom");
    delete html.dataset.uiZoom;
    return;
  }

  html.style.setProperty("--biturbo-ui-zoom", String(zoom));
  html.dataset.uiZoom = String(zoom);
}

const fromEnv = import.meta.env.VITE_UI_ZOOM;
if (fromEnv != null && String(fromEnv).length > 0) {
  try {
    localStorage.setItem(ZOOM_KEY, String(fromEnv));
  } catch {
    /* ignore quota / private mode */
  }
}

let uiZoom: number | undefined;
try {
  const raw = localStorage.getItem(ZOOM_KEY) ?? fromEnv;
  if (raw != null && String(raw).length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      uiZoom = n;
    }
  }
} catch {
  if (fromEnv != null && String(fromEnv).length > 0) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) {
      uiZoom = n;
    }
  }
}
if (uiZoom != null) {
  applyUiZoom(uiZoom);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
