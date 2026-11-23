import { useEffect, useRef, type ReactNode } from "react";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana emergente accesible: atrapa el foco del teclado dentro,
 * se cierra con Escape y devuelve el foco al botón que la abrió.
 */
export function Modal({
  abierto,
  onCerrar,
  etiquetaId,
  children,
  className,
}: {
  abierto: boolean;
  onCerrar: () => void;
  etiquetaId: string;
  children: ReactNode;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const primero = caja.current?.querySelector<HTMLElement>(ENFOCABLES);
    primero?.focus();
    document.body.style.overflow = "hidden";

    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
      }
      if (e.key !== "Tab" || !caja.current) return;
      const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
      if (!lista.length) return;
      const [ini, fin] = [lista[0], lista[lista.length - 1]];
      if (e.shiftKey && document.activeElement === ini) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        ini.focus();
      }
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
      anterior?.focus();
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-primary/40 backdrop-blur-sm p-4 md:p-8">
      <div className="absolute inset-0" aria-hidden="true" onClick={onCerrar} />
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby={etiquetaId} className={className ?? "relative"}>
        {children}
      </div>
    </div>
  );
}
