import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme } from "./lib/theme";
import { ErrorBoundary, reloadForStaleChunk } from "./components/ErrorBoundary";
import "./styles.css";

// Terapkan tema tersimpan sebelum render untuk meminimalkan flash.
applyTheme();

// Reload proaktif saat Vite gagal memuat modul yang sudah di-preload (chunk
// lama hilang setelah deploy). Menangkap kasus sebelum React sempat crash,
// sehingga tidak muncul layar blank saat navigasi ke rute lazy di tab lama.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  reloadForStaleChunk();
});

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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
