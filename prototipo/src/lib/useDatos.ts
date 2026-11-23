import { useCallback, useEffect, useState } from "react";

/** Pide datos a la ventanilla y expone los estados cargando / error / listo. */
export function useDatos<T>(pedir: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    pedir()
      .then((d) => vigente && setDatos(d))
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : "Error desconocido"));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { datos, error, recargar };
}
