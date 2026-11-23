import { createContext, useContext, useState, type ReactNode } from "react";

/** Información que se comparte entre pantallas durante la sesión (solo en memoria). */
interface ArchivoActivo {
  nombre: string;
  tamanoBytes: number;
  cargadoEn: Date;
  alerta: string | null;
}

interface EstadoCuracion {
  archivo: ArchivoActivo | null;
  setArchivo: (a: ArchivoActivo | null) => void;
}

const Contexto = createContext<EstadoCuracion | null>(null);

export function ProveedorCuracion({ children }: { children: ReactNode }) {
  const [archivo, setArchivo] = useState<ArchivoActivo | null>(null);
  return <Contexto.Provider value={{ archivo, setArchivo }}>{children}</Contexto.Provider>;
}

export function useCuracion() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useCuracion debe usarse dentro de ProveedorCuracion");
  return c;
}
