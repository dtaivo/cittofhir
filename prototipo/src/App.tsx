import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Carga from "./pages/Carga";
import Confirmacion from "./pages/Confirmacion";
import FueraDeAlcance from "./pages/FueraDeAlcance";
import Limpieza from "./pages/Limpieza";
import MapeosModal from "./pages/Mapeos";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/carga" replace />} />
        <Route path="/carga" element={<Carga />} />
        <Route path="/limpieza" element={<Limpieza />} />
        <Route
          path="/mapeos"
          element={
            <Limpieza>
              <MapeosModal />
            </Limpieza>
          }
        />
        <Route path="/confirmacion" element={<Confirmacion />} />
        <Route path="/visor" element={<FueraDeAlcance titulo="Visor Citológico" icono="fullscreen" />} />
        <Route path="/auditoria" element={<FueraDeAlcance titulo="Auditoría & Logs" icono="fact_check" />} />
        <Route path="*" element={<FueraDeAlcance titulo="Página no encontrada" icono="help" />} />
      </Routes>
    </Layout>
  );
}
