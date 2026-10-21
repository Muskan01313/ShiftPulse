import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./components/useToast";
import "./index.css";
import { initTheme } from "./theme";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Hold the Exxat splash for a moment, then fade it away and remove it.
const splash = document.getElementById("splash");
if (splash) {
  setTimeout(() => {
    splash.classList.add("gone");
    setTimeout(() => splash.remove(), 800);
  }, 1300);
}
