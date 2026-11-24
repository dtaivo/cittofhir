import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DatosMapeos, type Ontologia, type ReglaMapeo } from "../api";
import { useAvisos } from "../components/Avisos";
import { Cargando, ErrorCarga } from "../components/Estados";
import { Icono } from "../components/Icono";
import { JsonVivo } from "../components/JsonVivo";
import { Modal } from "../components/Modal";
import { cx } from "../lib/formato";
import { useDatos } from "../lib/useDatos";
import { validarCodigo } from "../lib/validacion";

type FiltroEstado = "todos" | "mapeado" | "pendiente" | "conflicto";
const FILTROS: { id: FiltroEstado; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "mapeado", texto: "Mapeados" },
  { id: "pendiente", texto: "Sin asignar" },
  { id: "conflicto", texto: "Conflicto" },
];

const SISTEMA: Record<Ontologia, string> = { "SNOMED CT": "http://snomed.info/sct", LOINC: "http://loinc.org" };

function bindingDe(r: ReglaMapeo) {
  const coding = r.codigo ? [{ system: r.ontologia ? SISTEMA[r.ontologia] : null, code: r.codigo, display: r.display }] : [];
  return {
    resourceType: "Observation",
    status: "final",
    ...(r.ontologia === "LOINC"
      ? { code: { coding } }
      : {
          code: { coding: [{ system: "http://loinc.org", code: "10704-5", display: "Ova and parasites identified in Stool by Light microscopy" }] },
          valueCodeableConcept: { coding, text: r.terminos.join(" / ") },
        }),
  };
}

/* ------------------------------------------------------------------ */
/* Formulario de regla (nueva o edición)                               */
/* ------------------------------------------------------------------ */
interface FormRegla {
  terminos: string;
  pestana: string;
  ontologia: Ontologia;
  codigo: string;
  display: string;
  autoAplicar: boolean;
  confianza: string;
}

function FormularioRegla({
  inicial,
  pestanas,
  onGuardar,
  onCancelar,
}: {
  inicial: ReglaMapeo | null;
  pestanas: DatosMapeos["pestanas"];
  onGuardar: (r: ReglaMapeo) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<FormRegla>({
    terminos: inicial?.terminos.join(", ") ?? "",
    pestana: inicial?.pestana ?? pestanas[0].id,
    ontologia: inicial?.ontologia ?? "SNOMED CT",
    codigo: inicial?.codigo ?? "",
    display: inicial?.display ?? "",
    autoAplicar: inicial?.autoAplicar ?? true,
    confianza: String(inicial?.confianza ?? 100),
  });
  const [intentado, setIntentado] = useState(false);
  const primerError = useRef<HTMLDivElement>(null);

  const cod = validarCodigo(f.ontologia, f.codigo);
  const terminos = f.terminos.split(",").map((t) => t.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const conf = Number(f.confianza);
  const errores: Partial<Record<keyof FormRegla, string>> = {};
  if (!terminos.length) errores.terminos = "Ingrese al menos un término crudo.";
  if (cod.error) errores.codigo = cod.error;
  if (!f.display.trim()) errores.display = "Ingrese el display name oficial.";
  if (!/^\d+$/.test(f.confianza) || conf < 0 || conf > 100) errores.confianza = "La confianza debe ser un número entre 0 y 100.";
  const visibles = intentado ? errores : {};

  function enviar(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    if (Object.keys(errores).length) {
      requestAnimationFrame(() => primerError.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    onGuardar({
      id: inicial?.id ?? `r${Date.now()}`,
      pestana: f.pestana,
      terminos,
      ontologia: f.ontologia,
      codigo: f.codigo.trim(),
      display: f.display.trim(),
      autoAplicar: f.autoAplicar,
      confianza: conf,
      estado: "mapeado",
    });
  }

  const claseInput = (err?: string) =>
    cx(
      "w-full px-2.5 py-[7px] rounded-lg bg-surface-container-lowest border text-on-surface font-body-sm text-body-sm focus:outline-none focus:border-diagnostic-cyan focus:ring-2 focus:ring-diagnostic-cyan/20",
      err ? "border-error" : "border-hairline",
    );
  const Msg = ({ id, err, alerta }: { id: string; err?: string; alerta?: string | null }) => (
    <p id={id} className={cx("font-tag-xs text-tag-xs flex items-center gap-1 min-h-4", err ? "text-error" : "text-clinical-warning")}>
      {err ? (
        <>
          <Icono nombre="error" className="text-[14px]" />
          {err}
        </>
      ) : alerta ? (
        <>
          <Icono nombre="warning" className="text-[14px]" />
          {alerta}
        </>
      ) : null}
    </p>
  );

  return (
    <form onSubmit={enviar} noValidate aria-labelledby="titulo-regla" className="rounded-xl border border-hairline bg-surface-container-low p-space-lg flex flex-col gap-space-md">
      <h3 id="titulo-regla" className="font-headline-sm text-headline-sm text-primary">
        {inicial ? "Editar regla de mapeo" : "Nueva regla de mapeo"}
      </h3>
      <div ref={primerError} className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <div className="flex flex-col gap-space-xs md:col-span-2">
          <label htmlFor="regla-terminos" className="font-label-sm text-label-sm text-[#667085]">
            Términos crudos (separados por coma) <span className="text-error">*</span>
          </label>
          <input
            id="regla-terminos"
            value={f.terminos}
            onChange={(e) => setF({ ...f, terminos: e.target.value })}
            placeholder='Ej.: G. lamblia, Giardia sp.'
            aria-invalid={!!visibles.terminos}
            aria-describedby="regla-terminos-msg"
            className={claseInput(visibles.terminos)}
          />
          <Msg id="regla-terminos-msg" err={visibles.terminos} />
        </div>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="regla-pestana" className="font-label-sm text-label-sm text-[#667085]">
            Categoría
          </label>
          <select id="regla-pestana" value={f.pestana} onChange={(e) => setF({ ...f, pestana: e.target.value })} className={claseInput()}>
            {pestanas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col gap-space-xs">
          <legend className="font-label-sm text-label-sm text-[#667085] mb-space-xs">Ontología destino</legend>
          <div className="flex items-center gap-space-md h-[38px]">
            {(["SNOMED CT", "LOINC"] as const).map((o) => (
              <label key={o} className="flex items-center gap-space-xs font-body-sm text-body-sm cursor-pointer">
                <input type="radio" name="regla-ontologia" className="accent-secondary" checked={f.ontologia === o} onChange={() => setF({ ...f, ontologia: o })} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="regla-codigo" className="font-label-sm text-label-sm text-[#667085]">
            Código canónico <span className="text-error">*</span>
          </label>
          <input
            id="regla-codigo"
            value={f.codigo}
            onChange={(e) => setF({ ...f, codigo: e.target.value })}
            placeholder={f.ontologia === "LOINC" ? "Ej.: 10704-5" : "Ej.: 78181009"}
            inputMode={f.ontologia === "LOINC" ? "text" : "numeric"}
            aria-invalid={!!visibles.codigo}
            aria-describedby="regla-codigo-msg"
            className={cx(claseInput(visibles.codigo), "font-code-mono", intentado && !visibles.codigo && cod.alerta && "border-clinical-warning")}
          />
          <Msg id="regla-codigo-msg" err={visibles.codigo} alerta={f.codigo ? cod.alerta : null} />
        </div>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="regla-display" className="font-label-sm text-label-sm text-[#667085]">
            Display name oficial <span className="text-error">*</span>
          </label>
          <input
            id="regla-display"
            value={f.display}
            onChange={(e) => setF({ ...f, display: e.target.value })}
            placeholder="Ej.: Giardia duodenalis"
            aria-invalid={!!visibles.display}
            aria-describedby="regla-display-msg"
            className={claseInput(visibles.display)}
          />
          <Msg id="regla-display-msg" err={visibles.display} />
        </div>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="regla-confianza" className="font-label-sm text-label-sm text-[#667085]">
            Confianza (%)
          </label>
          <input
            id="regla-confianza"
            value={f.confianza}
            onChange={(e) => setF({ ...f, confianza: e.target.value })}
            inputMode="numeric"
            aria-invalid={!!visibles.confianza}
            aria-describedby="regla-confianza-msg"
            className={claseInput(visibles.confianza)}
          />
          <Msg id="regla-confianza-msg" err={visibles.confianza} />
        </div>
        <label className="flex items-center gap-space-xs font-body-sm text-body-sm cursor-pointer self-center">
          <input type="checkbox" className="w-4 h-4 accent-secondary" checked={f.autoAplicar} onChange={(e) => setF({ ...f, autoAplicar: e.target.checked })} />
          Auto-aplicar esta regla al importar lotes
        </label>
      </div>
      <div className="flex justify-end gap-space-sm">
        <button type="button" onClick={onCancelar} className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm">
          Cancelar
        </button>
        <button type="submit" className="px-space-lg py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-sm text-label-sm shadow-sm">
          {inicial ? "Actualizar regla" : "Agregar regla"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Interruptor de auto-aplicar                                         */
/* ------------------------------------------------------------------ */
function Interruptor({ activo, onCambio, etiqueta }: { activo: boolean; onCambio: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambio}
      className={cx("w-9 h-5 rounded-full relative transition-colors flex items-center px-0.5 shrink-0", activo ? "bg-secondary" : "bg-outline-variant")}
    >
      <span className={cx("w-4 h-4 rounded-full bg-on-secondary transition-transform shadow-sm", activo && "translate-x-4")} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ventana principal                                                   */
/* ------------------------------------------------------------------ */
function ContenidoMapeos({ datos, onCerrar }: { datos: DatosMapeos; onCerrar: () => void }) {
  const avisar = useAvisos();
  const [reglas, setReglas] = useState<ReglaMapeo[]>(datos.reglas);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [cambiadas, setCambiadas] = useState<Set<string>>(new Set());
  const [pestana, setPestana] = useState(datos.pestanas[0].id);
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<string>(datos.reglas[0]?.id ?? "");
  const [vistaAbierta, setVistaAbierta] = useState(true);
  const [editando, setEditando] = useState<ReglaMapeo | "nueva" | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});
  const [errorAsignar, setErrorAsignar] = useState<Record<string, string>>({});
  const [errorImportar, setErrorImportar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return reglas.filter(
      (r) =>
        (r.pestana === pestana || r.estado === "pendiente") &&
        (filtro === "todos" || r.estado === filtro) &&
        (!q || r.terminos.some((t) => t.toLowerCase().includes(q)) || (r.codigo ?? "").includes(q) || (r.display ?? "").toLowerCase().includes(q)),
    );
  }, [reglas, pestana, filtro, busqueda]);

  const sel = reglas.find((r) => r.id === seleccion && r.codigo) ?? reglas.find((r) => r.codigo);
  const hayCambios = cambiadas.size > 0 || eliminadas.length > 0;

  function actualizar(r: ReglaMapeo) {
    setReglas((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]));
    setCambiadas((s) => new Set(s).add(r.id));
  }

  function asignar(r: ReglaMapeo) {
    const v = asignaciones[r.id];
    if (!v) {
      setErrorAsignar((e) => ({ ...e, [r.id]: "Seleccione un código antes de asignar." }));
      document.getElementById(`asignar-${r.id}`)?.focus();
      return;
    }
    const op = datos.opcionesPendiente.find((o) => `${o.ontologia}|${o.codigo}` === v)!;
    actualizar({ ...r, ontologia: op.ontologia, codigo: op.codigo, display: op.display, estado: "mapeado", autoAplicar: true, confianza: 100 });
    setErrorAsignar((e) => ({ ...e, [r.id]: "" }));
    setSeleccion(r.id);
    avisar("exito", `"${r.terminos[0]}" asignado a ${op.ontologia} ${op.codigo}.`);
  }

  function importar(f: File) {
    const nombre = f.name.toLowerCase();
    if (!nombre.endsWith(".csv") && !nombre.endsWith(".json")) {
      setErrorImportar("Formato no admitido: use un diccionario .csv o .json.");
      return;
    }
    if (f.size === 0) {
      setErrorImportar("El diccionario está vacío.");
      return;
    }
    setErrorImportar(null);
    avisar("info", `Importación simulada de ${f.name}: no se agregaron reglas en el prototipo.`);
  }

  async function guardarTodo() {
    setGuardando(true);
    for (const id of eliminadas) await api.eliminarRegla(id);
    for (const r of reglas.filter((x) => cambiadas.has(x.id))) await api.guardarRegla(r);
    setGuardando(false);
    avisar("exito", "Configuración de mapeos guardada.");
    onCerrar();
  }

  return (
    <div className="w-full max-w-[920px] bg-surface-container-lowest rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Encabezado */}
      <div className="px-space-lg md:px-space-xl pt-space-xl pb-space-lg bg-surface-container-lowest flex items-start justify-between gap-space-lg">
        <div className="flex items-start gap-space-md min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0 mt-0.5">
            <Icono nombre="translate" className="text-[20px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h2 id="titulo-mapeos" className="font-headline-md text-headline-md text-primary tracking-tight">
                Configuración de Mapeos de Ontologías (SNOMED CT &amp; LOINC)
              </h2>
              <span className="px-space-sm py-0.5 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-tag-xs text-tag-xs">FHIR R4</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
              Gestión de reglas de normalización automática para perfiles <span className="font-code-mono text-code-mono text-secondary">Observation</span> y{" "}
              <span className="font-code-mono text-code-mono text-secondary">Specimen</span> FHIR R4
            </p>
          </div>
        </div>
        <button
          aria-label="Cerrar ventana de mapeos"
          onClick={onCerrar}
          className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
          type="button"
        >
          <Icono nombre="close" className="text-[20px]" />
        </button>
      </div>

      {/* Pestañas */}
      <div role="tablist" aria-label="Categorías de mapeo" className="px-space-lg md:px-space-xl bg-surface-container-low flex items-center gap-space-xs overflow-x-auto">
        {datos.pestanas.map((p, i) => {
          const activa = p.id === pestana;
          return (
            <button
              key={p.id}
              id={`tab-${p.id}`}
              role="tab"
              aria-selected={activa}
              aria-controls="panel-mapeos"
              tabIndex={activa ? 0 : -1}
              onClick={() => setPestana(p.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const j = (i + (e.key === "ArrowRight" ? 1 : -1) + datos.pestanas.length) % datos.pestanas.length;
                setPestana(datos.pestanas[j].id);
                document.getElementById(`tab-${datos.pestanas[j].id}`)?.focus();
              }}
              className={cx(
                "relative px-space-lg py-space-md font-label-sm text-label-sm rounded-t-lg transition-all whitespace-nowrap flex items-center gap-space-xs",
                activa ? "text-secondary bg-surface-container-lowest" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60",
              )}
              type="button"
            >
              {activa && <span className="w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />}
              <span>{p.nombre}</span>
              <span
                className={cx(
                  "ml-1 px-1.5 py-0.5 rounded-lg font-tag-xs text-tag-xs",
                  activa ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container text-on-surface-variant",
                )}
              >
                {p.total}
              </span>
              {activa && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div id="panel-mapeos" role="tabpanel" aria-labelledby={`tab-${pestana}`} className="px-space-lg md:px-space-xl py-space-lg bg-surface-container-lowest flex flex-col gap-space-md">
        {/* Herramientas */}
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm flex-1 min-w-[280px] flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Icono nombre="search" className="text-[18px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
              <label htmlFor="buscar-mapeos" className="sr-only">
                Buscar término crudo, código SNOMED o LOINC
              </label>
              <input
                id="buscar-mapeos"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:bg-surface-container focus:ring-2 focus:ring-diagnostic-cyan/20 transition-colors"
                placeholder="Buscar término crudo, código SNOMED o LOINC..."
              />
            </div>
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg gap-0.5" role="group" aria-label="Filtrar por estado">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                  className={cx(
                    "px-2.5 py-1 rounded-lg font-tag-xs text-tag-xs transition-all",
                    filtro === f.id ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {f.texto}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-space-sm flex-wrap">
            <input
              ref={archivo}
              type="file"
              accept=".csv,.json"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importar(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => archivo.current?.click()}
              aria-describedby="error-importar"
              className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary font-label-sm text-label-sm flex items-center gap-space-xs transition-colors"
            >
              <Icono nombre="upload_file" className="text-[16px]" />
              <span>+ Importar diccionario (.csv/.json)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditando("nueva")}
              className="px-space-md py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-space-xs shadow-sm transition-colors"
            >
              <Icono nombre="add" className="text-[16px]" />
              <span>+ Nueva regla de mapeo</span>
            </button>
          </div>
        </div>
        <div id="error-importar" role="alert">
          {errorImportar && (
            <p className="px-space-md py-space-sm rounded-lg bg-[#FEF3F2] border border-[#FECACA] text-clinical-critical-ink font-body-sm text-body-sm flex items-center gap-space-xs">
              <Icono nombre="error" className="text-[18px]" />
              {errorImportar}
            </p>
          )}
        </div>

        {editando && (
          <FormularioRegla
            key={editando === "nueva" ? "nueva" : editando.id}
            inicial={editando === "nueva" ? null : editando}
            pestanas={datos.pestanas}
            onCancelar={() => setEditando(null)}
            onGuardar={(r) => {
              actualizar(r);
              setSeleccion(r.id);
              setPestana(r.pestana);
              setEditando(null);
              avisar("exito", "Regla agregada a la configuración (pendiente de guardar).");
            }}
          />
        )}

        {/* Tabla */}
        <div className="rounded-xl bg-surface-container-low overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <caption className="sr-only">Reglas de mapeo de la categoría seleccionada</caption>
              <thead>
                <tr className="bg-surface-container">
                  {["Término Crudo (Excel/LIS)", "Ontología Destino", "Código Canónico", "Display Name Oficial", "Confianza / Auto-aplicar"].map((h) => (
                    <th key={h} scope="col" className="px-space-md py-space-sm font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-space-md py-space-sm font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface-container-lowest">
                {visibles.map((r) => {
                  if (r.estado === "pendiente") {
                    const err = errorAsignar[r.id];
                    return (
                      <tr key={r.id} className="bg-error-container/25 hover:bg-error-container/35 transition-colors">
                        <td className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface font-medium">
                          <div className="flex items-center gap-space-xs">
                            <Icono nombre="warning" className="text-[16px] text-error" />
                            <span>"{r.terminos.join('", "')}"</span>
                          </div>
                        </td>
                        <td className="px-space-md py-space-md">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-error-container text-on-error-container font-tag-xs text-tag-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-error" aria-hidden="true" />
                            Pendiente
                          </span>
                        </td>
                        <td className="px-space-md py-space-md" colSpan={2}>
                          <label htmlFor={`asignar-${r.id}`} className="sr-only">
                            Código para "{r.terminos[0]}"
                          </label>
                          <select
                            id={`asignar-${r.id}`}
                            value={asignaciones[r.id] ?? ""}
                            onChange={(e) => {
                              setAsignaciones((a) => ({ ...a, [r.id]: e.target.value }));
                              setErrorAsignar((x) => ({ ...x, [r.id]: "" }));
                            }}
                            aria-invalid={!!err}
                            aria-describedby={`asignar-${r.id}-msg`}
                            className={cx(
                              "w-full px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-code-mono text-code-mono focus:outline-none focus:ring-2 focus:ring-diagnostic-cyan/30",
                              err && "ring-2 ring-error",
                            )}
                          >
                            <option value="">Seleccionar código SNOMED CT / LOINC...</option>
                            {datos.opcionesPendiente.map((o) => (
                              <option key={o.codigo} value={`${o.ontologia}|${o.codigo}`}>
                                {o.ontologia === "LOINC" ? "LOINC" : "SNOMED"} {o.codigo} — {o.display}
                              </option>
                            ))}
                          </select>
                          <p id={`asignar-${r.id}-msg`} className="font-tag-xs text-tag-xs text-error mt-1">
                            {err}
                          </p>
                        </td>
                        <td className="px-space-md py-space-md">
                          <span className="font-tag-xs text-tag-xs text-on-error-container">Requiere revisión manual</span>
                        </td>
                        <td className="px-space-md py-space-md text-right">
                          <button
                            type="button"
                            onClick={() => asignar(r)}
                            className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary hover:bg-primary-container font-tag-xs text-tag-xs transition-colors"
                          >
                            Asignar
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const seleccionada = sel?.id === r.id;
                  const conflicto = r.estado === "conflicto";
                  return (
                    <tr
                      key={r.id}
                      aria-selected={seleccionada}
                      className={cx(
                        "transition-colors",
                        conflicto ? "bg-[#FFFAEB] hover:bg-[#FEF0C7]" : seleccionada ? "bg-surface-container-low/60 hover:bg-surface-container-low" : "hover:bg-surface-container-low",
                      )}
                    >
                      <td className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface font-medium">
                        <button type="button" onClick={() => setSeleccion(r.id)} className="text-left hover:underline" title="Ver binding FHIR">
                          {conflicto && <Icono nombre="warning" className="text-[16px] text-clinical-warning mr-1 align-[-3px]" />}"{r.terminos.join('", "')}"
                        </button>
                      </td>
                      <td className="px-space-md py-space-md">
                        {r.ontologia === "LOINC" ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-tag-xs text-tag-xs whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-fixed-variant" aria-hidden="true" />
                            LOINC
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-tag-xs text-tag-xs whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
                            SNOMED CT
                          </span>
                        )}
                      </td>
                      <td className="px-space-md py-space-md font-code-mono-bold text-code-mono-bold text-primary">{r.codigo}</td>
                      <td className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface">{r.display}</td>
                      <td className="px-space-md py-space-md">
                        <div className="flex items-center gap-space-sm">
                          <Interruptor
                            activo={r.autoAplicar}
                            etiqueta={`Auto-mapear "${r.terminos[0]}"`}
                            onCambio={() => actualizar({ ...r, autoAplicar: !r.autoAplicar })}
                          />
                          <span className={cx("font-tag-xs text-tag-xs", conflicto ? "text-clinical-warning" : r.autoAplicar ? "text-secondary" : "text-on-surface-variant")}>
                            {conflicto ? "Conflicto" : r.autoAplicar ? "Auto-mapear" : "Manual"} ({r.confianza}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-space-md py-space-md text-right">
                        {confirmarBorrar === r.id ? (
                          <div className="inline-flex items-center gap-1" role="group" aria-label="Confirmar eliminación">
                            <button
                              type="button"
                              autoFocus
                              onClick={() => {
                                setReglas((rs) => rs.filter((x) => x.id !== r.id));
                                setEliminadas((e) => [...e, r.id]);
                                setConfirmarBorrar(null);
                                avisar("info", `Regla "${r.terminos[0]}" eliminada (pendiente de guardar).`);
                              }}
                              className="px-2 py-1 rounded-lg bg-error text-on-error font-tag-xs text-tag-xs"
                            >
                              Eliminar
                            </button>
                            <button type="button" onClick={() => setConfirmarBorrar(null)} className="px-2 py-1 rounded-lg bg-surface-container font-tag-xs text-tag-xs">
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditando(r)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                              title="Editar regla"
                              aria-label={`Editar regla "${r.terminos[0]}"`}
                            >
                              <Icono nombre="edit" className="text-[16px]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmarBorrar(r.id)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors"
                              title="Eliminar regla"
                              aria-label={`Eliminar regla "${r.terminos[0]}"`}
                            >
                              <Icono nombre="delete" className="text-[16px]" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-space-md py-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
                      No hay reglas que coincidan con la búsqueda o el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vista previa del binding */}
        {sel && (
          <div className="rounded-xl bg-surface-container-low overflow-hidden">
            <button
              type="button"
              onClick={() => setVistaAbierta((v) => !v)}
              aria-expanded={vistaAbierta}
              aria-controls="panel-binding"
              className="w-full px-space-lg py-space-sm flex items-center justify-between gap-space-sm bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-space-sm flex-wrap">
                <Icono nombre="data_object" className="text-[18px] text-secondary" />
                <span className="font-label-sm text-label-sm text-on-surface">Previsualización de Binding FHIR R4</span>
                <span className="px-2 py-0.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-code-mono text-code-mono">
                  {sel.ontologia}: {sel.codigo}
                </span>
              </div>
              <Icono nombre={vistaAbierta ? "expand_less" : "expand_more"} className="text-[18px] text-on-surface-variant" />
            </button>
            {vistaAbierta && (
              <div id="panel-binding" className="p-space-md bg-surface-container-low">
                <JsonVivo
                  valor={bindingDe(sel)}
                  etiqueta="Binding FHIR de la regla seleccionada"
                  className="p-space-md rounded-lg bg-surface-container-lowest text-primary max-h-[380px] [&_.text-secondary-fixed]:text-primary [&_.text-surface-bright]:text-secondary [&_.text-primary-fixed-dim]:text-on-surface-variant"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pie */}
      <div className="px-space-lg md:px-space-xl py-space-lg bg-surface-container-low flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-xs text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-secondary shrink-0" aria-hidden="true" />
          <span className="font-body-sm text-body-sm">
            Última sincronización con servidor terminológico: <strong className="font-semibold text-on-surface">{datos.sincronizacion.hace}</strong> (
            {datos.sincronizacion.versiones})
          </span>
        </div>
        <div className="flex items-center gap-space-sm ml-auto">
          {hayCambios && <span className="font-tag-xs text-tag-xs text-clinical-warning">Cambios sin guardar</span>}
          <button type="button" onClick={onCerrar} className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardarTodo}
            disabled={guardando}
            className="px-space-lg py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-sm text-label-sm shadow-sm transition-colors disabled:opacity-70"
          >
            {guardando ? "Guardando…" : "Guardar Configuración de Mapeos"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ventana de mapeos montada sobre la pantalla de Limpieza Guiada (ruta /mapeos). */
export default function MapeosModal() {
  const navegar = useNavigate();
  const { datos, error, recargar } = useDatos(api.obtenerMapeos);
  const cerrar = () => navegar("/limpieza");
  return (
    <Modal abierto onCerrar={cerrar} etiquetaId="titulo-mapeos" className="relative w-full max-w-[920px] my-auto">
      {error ? (
        <div className="bg-surface-container-lowest rounded-xl">
          <ErrorCarga mensaje={error} onReintentar={recargar} />
        </div>
      ) : !datos ? (
        <div className="bg-surface-container-lowest rounded-xl">
          <Cargando texto="Cargando reglas de mapeo…" />
        </div>
      ) : (
        <ContenidoMapeos datos={datos} onCerrar={cerrar} />
      )}
    </Modal>
  );
}
