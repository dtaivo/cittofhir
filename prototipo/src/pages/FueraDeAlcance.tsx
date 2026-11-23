import { Link } from "react-router-dom";
import { Icono } from "../components/Icono";

/** Pantallas del menú que no tienen diseño todavía. */
export default function FueraDeAlcance({ titulo, icono }: { titulo: string; icono: string }) {
  return (
    <div className="max-w-[960px] mx-auto px-gutter md:px-gutter-lg py-margin-lg">
      <div className="bg-surface-container-lowest border border-surface-container rounded-xl p-space-xl flex flex-col items-start gap-space-md">
        <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
          <Icono nombre={icono} />
        </div>
        <h1 className="font-headline-md text-headline-md text-primary">{titulo}</h1>
        <p className="font-body-base text-body-base text-on-surface-variant">
          Esta sección aparece en el menú del diseño, pero aún no tiene una pantalla diseñada. Queda fuera del alcance de
          este prototipo.
        </p>
        <Link
          to="/carga"
          className="inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary-container text-on-primary font-label-sm text-label-sm"
        >
          <Icono nombre="arrow_back" className="text-[18px]" /> Volver a Carga y Diagnóstico
        </Link>
      </div>
    </div>
  );
}
