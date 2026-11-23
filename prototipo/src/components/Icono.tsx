import { cx } from "../lib/formato";

/** Ícono de Material Symbols. Es decorativo: los lectores de pantalla lo ignoran. */
export function Icono({ nombre, className, relleno }: { nombre: string; className?: string; relleno?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx("material-symbols-outlined select-none", className)}
      style={relleno ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {nombre}
    </span>
  );
}
