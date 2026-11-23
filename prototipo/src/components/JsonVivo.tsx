import { cx } from "../lib/formato";

/**
 * Muestra un objeto como JSON coloreado (claves en cian, textos en blanco),
 * igual que las vistas previas FHIR del diseño.
 */
export function JsonVivo({ valor, className, etiqueta }: { valor: unknown; className?: string; etiqueta: string }) {
  const texto = JSON.stringify(valor, null, 2);
  const partes = texto.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?)/g);
  return (
    <pre
      tabIndex={0}
      aria-label={etiqueta}
      className={cx("pozo-codigo font-code-mono text-[12px] leading-relaxed overflow-auto whitespace-pre", className)}
    >
      <code>
        {partes.map((p, i) => {
          if (/^".*"\s*:$/.test(p)) {
            const [clave] = p.split(/:\s*$/);
            return (
              <span key={i}>
                <span className="text-secondary-fixed">{clave}</span>:
              </span>
            );
          }
          if (/^"/.test(p)) return <span key={i} className="text-surface-bright">{p}</span>;
          return <span key={i} className="text-primary-fixed-dim">{p}</span>;
        })}
      </code>
    </pre>
  );
}
