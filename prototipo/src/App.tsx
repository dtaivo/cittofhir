import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Carga from "./pages/Carga";
import FueraDeAlcance from "./pages/FueraDeAlcance";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/carga" replace />} />
        <Route path="/carga" element={<Carga />} />
        <Route path="/limpieza" element={<FueraDeAlcance titulo="Limpieza Guiada" icono="rule" />} />
        <Route path="/mapeos" element={<FueraDeAlcance titulo="Mapeo LOINC/SNOMED" icono="translate" />} />
        <Route path="/confirmacion" element={<FueraDeAlcance titulo="Confirmación y Exportación" icono="verified" />} />
        <Route path="/visor" element={<FueraDeAlcance titulo="Visor Citológico" icono="fullscreen" />} />
        <Route path="/auditoria" element={<FueraDeAlcance titulo="Auditoría & Logs" icono="fact_check" />} />
        <Route path="*" element={<FueraDeAlcance titulo="Página no encontrada" icono="help" />} />
      </Routes>
    </Layout>
  );
}
