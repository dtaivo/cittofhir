import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icono } from "./Icono";
import { cx } from "../lib/formato";

type TipoAviso = "exito" | "info" | "error";
interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: ReactNode;
}

const Contexto = createContext<(tipo: TipoAviso, texto: ReactNode) => void>(() => {});

/** Avisos flotantes ("toasts"). Se anuncian a lectores de pantalla con aria-live. */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((tipo: TipoAviso, texto: ReactNode) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div aria-live="polite" role="status" className="fixed bottom-4 right-4 z-[80] flex flex-col gap-space-sm max-w-sm">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              "px-4 py-3 rounded-lg shadow-xl font-label-sm text-label-sm flex items-start gap-2",
              a.tipo === "exito" && "bg-primary text-on-primary",
              a.tipo === "info" && "bg-surface-container-highest text-on-surface",
              a.tipo === "error" && "bg-error text-on-error",
            )}
          >
            <Icono
              nombre={a.tipo === "exito" ? "check_circle" : a.tipo === "error" ? "error" : "info"}
              className="text-[18px]"
            />
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export const useAvisos = () => useContext(Contexto);
