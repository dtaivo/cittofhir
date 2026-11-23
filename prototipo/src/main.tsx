import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ProveedorAvisos } from "./components/Avisos";
import { ProveedorCuracion } from "./state/Curacion";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorAvisos>
        <ProveedorCuracion>
          <App />
        </ProveedorCuracion>
      </ProveedorAvisos>
    </BrowserRouter>
  </StrictMode>,
);
