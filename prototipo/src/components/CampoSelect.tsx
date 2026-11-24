import type { ReactNode } from "react";
import { Icono } from "./Icono";
import { cx } from "../lib/formato";

type Opcion = { valor: string; texto: string; grupo?: string };

/** Agrupa las opciones por "grupo" manteniendo el orden original. */
function agrupar(opciones: Opcion[]): [string, Opcion[]][] {
  const mapa = new Map<string, Opcion[]>();
  for (const o of opciones) {
    const g = o.grupo ?? "";
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(o);
  }
  return [...mapa.entries()];
}

/**
 * Lista desplegable con etiqueta, ayuda y estados de error / alerta.
 * La etiqueta queda unida al campo (htmlFor) y los mensajes se leen con aria-describedby.
 */
export function CampoSelect({
  id,
  etiqueta,
  pista,
  pistaError,
  valor,
  onCambio,
  opciones,
  ayuda,
  error,
  alerta,
  requerido,
  marcadorVacio = "Seleccione una opción…",
}: {
  id: string;
  etiqueta: string;
  pista?: ReactNode;
  pistaError?: boolean;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; texto: string; grupo?: string }[];
  ayuda?: ReactNode;
  error?: string | null;
  alerta?: string | null;
  requerido?: boolean;
  marcadorVacio?: string;
}) {
  const idMsg = `${id}-msg`;
  return (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-sm">
        <label htmlFor={id} className="font-label-sm text-label-sm text-on-surface-variant font-medium">
          {etiqueta}
          {requerido && (
            <span className="text-error" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
        {pista && (
          <span className={cx("font-tag-xs text-tag-xs font-code-mono text-right", pistaError ? "text-error" : "text-on-surface-variant")}>
            {pista}
          </span>
        )}
      </div>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-invalid={!!error}
          aria-required={requerido}
          aria-describedby={idMsg}
          className={cx(
            "w-full bg-surface-container-lowest text-primary font-body-sm text-body-sm px-space-md py-space-sm rounded-lg shadow-sm focus:outline-none focus:ring-2 cursor-pointer appearance-none pr-8",
            error ? "ring-2 ring-error focus:ring-error/40" : alerta ? "ring-1 ring-clinical-warning focus:ring-secondary/30" : "focus:ring-secondary/30",
          )}
        >
          <option value="">{marcadorVacio}</option>
          {agrupar(opciones).map(([grupo, lista]) =>
            grupo ? (
              <optgroup key={grupo} label={grupo}>
                {lista.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
              </optgroup>
            ) : (
              lista.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))
            ),
          )}
        </select>
        <Icono nombre="expand_more" className="text-[18px] text-on-surface-variant absolute right-space-md top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <div id={idMsg}>
        {error ? (
          <span className="font-tag-xs text-tag-xs text-error flex items-center gap-1">
            <Icono nombre="error" className="text-[14px]" />
            {error}
          </span>
        ) : alerta ? (
          <span className="font-tag-xs text-tag-xs text-clinical-warning flex items-center gap-1">
            <Icono nombre="warning" className="text-[14px]" />
            {alerta}
          </span>
        ) : (
          ayuda
        )}
      </div>
    </div>
  );
}
