import { Icono } from "./Icono";

export function Cargando({ texto = "Cargando datos…" }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-space-sm py-24 text-on-surface-variant font-label-sm text-label-sm">
      <span className="w-4 h-4 rounded-full border-2 border-secondary border-t-transparent animate-spin" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="m-gutter-lg p-space-lg bg-error-container text-on-error-container rounded-xl flex items-center gap-space-md">
      <Icono nombre="error" />
      <p className="font-label-sm text-label-sm flex-1">No se pudieron cargar los datos: {mensaje}</p>
      <button type="button" onClick={onReintentar} className="px-space-md py-space-xs rounded-lg bg-error text-on-error font-label-sm text-label-sm">
        Reintentar
      </button>
    </div>
  );
}
