import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme } from "./lib/theme";
import "./styles.css";

// Terapkan tema tersimpan sebelum render untuk meminimalkan flash.
applyTheme();

// Cegah scroll roda mouse mengubah nilai <input type="number"> yang sedang
// fokus — perilaku bawaan browser yang sering tidak disengaja (mis. harga
// produk/promo berubah saat admin menggulung form). Saat user scroll, kita
// lepaskan fokus dari input number sehingga scroll hanya menggulung halaman.
document.addEventListener(
  "wheel",
  () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === "number") {
      el.blur();
    }
  },
  { passive: true },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
