import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { AuthProvider } from "@/lib/auth";

// No <StrictMode>: react-leaflet's MapContainer double-mounts under StrictMode,
// re-creating the Leaflet map / reloading tiles in dev and causing a flicker.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);