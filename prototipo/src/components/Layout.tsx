import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icono } from "./Icono";
import { cx } from "../lib/formato";

const PASOS = [
  { ruta: "/carga", corto: "1. Carga", largo: "1. Carga y Diagnóstico" },
  { ruta: "/limpieza", corto: "2. Limpieza", largo: "2. Limpieza Guiada" },
  { ruta: "/confirmacion", corto: "3. Exportación", largo: "3. Confirmación y Exportación" },
];

const MENU = [
  { ruta: "/carga", icono: "biotech", texto: "Carga y Diagnóstico" },
  { ruta: "/limpieza", icono: "rule", texto: "Limpieza Guiada" },
  { ruta: "/confirmacion", icono: "verified", texto: "Confirmación FHIR" },
  null,
  { ruta: "/visor", icono: "fullscreen", texto: "Visor Citológico" },
  { ruta: "/mapeos", icono: "translate", texto: "Mapeo LOINC/SNOMED" },
  { ruta: "/auditoria", icono: "fact_check", texto: "Auditoría & Logs" },
];

const ACTIVO = "bg-primary-container text-on-primary font-body-semibold rounded-lg";

function Encabezado({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const pasoActivo = pathname.startsWith("/mapeos") ? "/limpieza" : pathname;
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50">
      <div className="h-16 w-full px-gutter md:px-gutter-lg flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-lg min-w-0">
          <button
            type="button"
            onClick={onMenu}
            className="lg:hidden -ml-space-xs p-space-xs rounded-lg text-on-surface hover:bg-surface-container"
            aria-label="Abrir menú de navegación"
          >
            <Icono nombre="menu" />
          </button>
          <NavLink to="/carga" className="flex items-center gap-space-sm min-w-0" aria-label="ParaFHIR, ir al inicio">
            <img alt="" className="h-8 w-auto object-contain shrink-0" src="/img/logo-mark.png" />
            <div className="hidden sm:flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs whitespace-nowrap">
                <span className="font-headline-sm text-headline-sm text-primary tracking-tight">ParaFHIR</span>
                <span className="font-code-mono text-code-mono text-on-surface-variant font-semibold">/ CittoFHIR</span>
              </div>
              <span className="font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider truncate">
                Estandarizador de metadatos parasitológicos
              </span>
            </div>
          </NavLink>
          <div className="hidden xl:block h-6 w-px bg-surface-container-highest" />
          <div className="hidden xl:flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container rounded-lg whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />
            <span className="font-tag-xs text-tag-xs text-on-surface font-semibold">FHIR Server R4</span>
            <span className="font-tag-xs text-tag-xs text-secondary font-medium">Online</span>
          </div>
          <div className="hidden 2xl:flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container-low rounded-lg whitespace-nowrap">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Estudio:</span>
            <span className="font-label-sm text-label-sm text-on-surface font-semibold">Chagas &amp; Giardia 2025</span>
          </div>
        </div>
        <nav aria-label="Etapas del proceso" className="hidden md:flex items-center gap-space-xs bg-surface-container-low p-space-xs rounded-xl shrink-0">
          {PASOS.map((p) => {
            const activo = pasoActivo.startsWith(p.ruta);
            return (
              <NavLink
                key={p.ruta}
                to={p.ruta}
                aria-current={activo ? "step" : undefined}
                className={cx(
                  "px-space-md py-space-xs whitespace-nowrap transition-all",
                  activo
                    ? "bg-primary-container text-on-primary font-label-sm text-label-sm font-semibold rounded-lg"
                    : "font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg",
                )}
              >
                <span className="2xl:hidden">{p.corto}</span>
                <span className="hidden 2xl:inline">{p.largo}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="flex items-center gap-space-md shrink-0">
          <a
            className="hidden lg:flex items-center gap-space-xs px-space-md py-space-xs font-label-sm text-label-sm text-secondary bg-surface-container hover:bg-secondary hover:text-on-secondary rounded-lg transition-all whitespace-nowrap"
            href="https://hl7.org/fhir/R4/"
            target="_blank"
            rel="noreferrer"
          >
            <Icono nombre="menu_book" className="text-[18px]" />
            <span>Docs HL7/LOINC</span>
            <span className="sr-only">(abre en una pestaña nueva)</span>
          </a>
          <div className="hidden lg:block h-6 w-px bg-surface-container-highest" />
          <div className="flex items-center gap-space-sm">
            <div className="text-right hidden xl:block whitespace-nowrap">
              <p className="font-label-sm text-label-sm text-on-surface leading-tight">Dra. V. Morales</p>
              <p className="font-tag-xs text-tag-xs text-on-surface-variant">Microbiología &amp; FHIR Spec</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center" role="img" aria-label="Usuaria: Dra. V. Morales">
              <Icono nombre="person" className="text-on-primary text-[18px]" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLateral({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  return (
    <>
      {abierto && <div className="lg:hidden fixed inset-0 top-16 z-30 bg-primary/30" aria-hidden="true" onClick={onCerrar} />}
      <aside
        aria-label="Estación de curación"
        className={cx(
          "fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex flex-col justify-between py-space-lg transition-transform",
          abierto ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          !abierto && "invisible lg:visible",
        )}
      >
        <div className="flex flex-col gap-space-md">
          <div className="px-space-lg">
            <span className="font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider">Estación de Curación</span>
          </div>
          <nav className="flex flex-col gap-space-xs px-space-md" aria-label="Menú principal">
            {MENU.map((m, i) =>
              m === null ? (
                <div key={i} className="my-space-xs border-t border-surface-container" role="separator" />
              ) : (
                <NavLink
                  key={m.ruta}
                  to={m.ruta}
                  onClick={onCerrar}
                  className={({ isActive }) =>
                    cx(
                      "flex items-center gap-space-sm px-space-md py-space-sm transition-all",
                      isActive ? ACTIVO : "rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                    )
                  }
                >
                  <Icono nombre={m.icono} className="text-[20px]" />
                  <span className="font-label-sm text-label-sm">{m.texto}</span>
                </NavLink>
              ),
            )}
          </nav>
        </div>
        <div className="px-space-md">
          <div className="p-space-md bg-surface-container-low rounded-xl flex flex-col gap-space-xs">
            <div className="flex items-center justify-between">
              <span className="font-tag-xs text-tag-xs text-on-surface-variant">Specimen DB</span>
              <span className="font-code-mono text-code-mono text-secondary font-semibold">v4.0.1</span>
            </div>
            <p className="font-tag-xs text-tag-xs text-on-surface-variant">Perfil: Observation Parasitology IG-CL</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMenuAbierto(false), [pathname]);
  useEffect(() => {
    if (!menuAbierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setMenuAbierto(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [menuAbierto]);

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:px-space-md focus:py-space-sm focus:bg-primary focus:text-on-primary focus:rounded-lg"
      >
        Saltar al contenido principal
      </a>
      <Encabezado onMenu={() => setMenuAbierto((a) => !a)} />
      <MenuLateral abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="lg:pl-64">
        <main id="contenido" tabIndex={-1} className="relative pt-16 bg-surface min-h-screen outline-none">
          {children}
        </main>
      </div>
    </>
  );
}
