import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type Caso, type DecisionCaso, type EstadoCaso, type Terminologia } from "../api";
import { useAvisos } from "../components/Avisos";
import { CampoSelect } from "../components/CampoSelect";
import { Cargando, ErrorCarga } from "../components/Estados";
import { Icono } from "../components/Icono";
import { JsonVivo } from "../components/JsonVivo";
import { Modal } from "../components/Modal";
import { observacionDesdeCaso } from "../lib/fhir";
import { cx, numero } from "../lib/formato";
import { useDatos } from "../lib/useDatos";
import { requerido } from "../lib/validacion";

type Filtro = "todos" | "snomed" | "duplicados";
const MAX_NOTA = 280;

const TONO_INSIGNIA: Record<string, string> = {
  error: "bg-error-container text-on-error-container",
  info: "bg-secondary-fixed text-on-secondary-fixed-variant",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

/* ------------------------------------------------------------------ */
/* Tarjeta de la cola                                                  */
/* ------------------------------------------------------------------ */
function TarjetaCola({ caso, activo, estado, onElegir }: { caso: Caso; activo: boolean; estado: EstadoCaso; onElegir: () => void }) {
  const terminado = estado.estado !== "pendiente";
  return (
    <li>
      <button
        type="button"
        onClick={onElegir}
        aria-current={activo ? "true" : undefined}
        className={cx(
          "w-full text-left bg-surface-container-lowest p-space-md rounded-xl cursor-pointer transition-all relative overflow-hidden",
          activo ? "shadow-md bg-gradient-to-r from-secondary/10 via-transparent to-transparent ring-1 ring-secondary/40" : "hover:bg-surface-container-low shadow-sm",
          terminado && "opacity-60",
        )}
      >
        <div className="flex gap-space-md">
          <div className={cx("relative w-20 h-20 rounded-lg overflow-hidden shrink-0 shadow-inner", activo ? "bg-primary-container" : "bg-surface-container")}>
            <img className="w-full h-full object-cover" alt="" src={caso.imagen} />
            <span className="absolute bottom-1 right-1 px-1 bg-primary/80 backdrop-blur text-on-primary font-code-mono text-[10px] rounded">
              {caso.aumentoMiniatura}
            </span>
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <div>
              <div className="flex items-center justify-between gap-space-xs">
                <span className={cx("font-code-mono-bold text-code-mono-bold truncate", activo ? "text-primary" : "text-on-surface")}>#{caso.id}</span>
                {terminado ? (
                  <span className="px-space-xs py-0.5 rounded-full bg-[#ECFDF5] text-clinical-success-ink border border-[#A7F3D0] font-tag-xs text-tag-xs font-semibold shrink-0 flex items-center gap-1">
                    <Icono nombre="check" className="text-[12px]" />
                    {estado.estado === "resuelto" ? "Resuelto" : "Descartado"}
                  </span>
                ) : (
                  <span className={cx("px-space-xs py-0.5 rounded-full font-tag-xs text-tag-xs font-semibold shrink-0", TONO_INSIGNIA[caso.insignia.tono])}>
                    {caso.insignia.texto}
                  </span>
                )}
              </div>
              <p className={cx("font-body-semibold text-body-semibold truncate mt-0.5", activo ? "text-primary" : "text-on-surface")}>{caso.titulo}</p>
              <p className="font-tag-xs text-tag-xs text-on-surface-variant truncate">{caso.muestra}</p>
            </div>
            <div className="flex items-center gap-space-xs flex-wrap mt-space-xs">
              {caso.etiquetas.map((e) => (
                <span
                  key={e.texto}
                  className={cx(
                    "px-space-xs py-0.5 rounded font-tag-xs text-tag-xs",
                    e.tono === "info" ? "bg-secondary-fixed text-on-secondary-fixed-variant" : "bg-surface-container text-on-surface-variant",
                  )}
                >
                  {e.texto}
                </span>
              ))}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Editor del caso activo                                              */
/* ------------------------------------------------------------------ */
type Errores = Partial<Record<keyof DecisionCaso, string>>;

function EditorCaso({
  caso,
  terminologia,
  patronAplicado,
  patronCasos,
  onGuardado,
  onDescartado,
  onAplicarPatron,
  onAbrirMapeos,
}: {
  caso: Caso;
  terminologia: Terminologia;
  patronAplicado: boolean;
  patronCasos: number;
  onGuardado: (d: DecisionCaso) => Promise<void>;
  onDescartado: () => Promise<void>;
  onAplicarPatron: () => Promise<void>;
  onAbrirMapeos: () => void;
}) {
  const [form, setForm] = useState<DecisionCaso>({ ...caso.propuesta, nota: "" });
  const [errores, setErrores] = useState<Errores>({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [comparar, setComparar] = useState(false);
  const [crudos, setCrudos] = useState(false);
  const resumen = useRef<HTMLDivElement>(null);

  const t = terminologia;
  const especieSugerida = t.especies.find((e) => e.codigo === caso.propuesta.especie);
  const aumento = t.aumentos.find((a) => a.codigo === form.aumento);

  function validar(f: DecisionCaso): Errores {
    const e: Errores = {};
    if (!f.relacion) e.relacion = "Indique si es un escaneo repetido o un nuevo corte.";
    const esp = f.especie === "otro" ? "Busque el código en Mapeo LOINC/SNOMED antes de guardar." : requerido(f.especie, "la especie");
    if (esp) e.especie = esp;
    const est = requerido(f.estadio, "el estadio");
    if (est) e.estadio = est;
    const tin = requerido(f.tincion, "el método de tinción");
    if (tin) e.tincion = tin;
    const au = requerido(f.aumento, "el aumento óptico");
    if (au) e.aumento = au;
    if (f.nota.length > MAX_NOTA) e.nota = `La nota supera los ${MAX_NOTA} caracteres.`;
    return e;
  }

  // Alertas: no bloquean el guardado, solo avisan.
  const alertas = {
    especie:
      form.especie && form.especie !== "otro" && especieSugerida && form.especie !== especieSugerida.codigo
        ? `Difiere de la sugerencia clínica (${especieSugerida.display}).`
        : null,
    relacion:
      form.relacion === "nuevo" && caso.sospechaDuplicado && caso.sospechaDuplicado.similitud >= 90
        ? `La similitud de ${caso.sospechaDuplicado.similitud}% sugiere un escaneo repetido.`
        : null,
  };

  function cambiar<K extends keyof DecisionCaso>(campo: K, valor: DecisionCaso[K]) {
    const nuevo = { ...form, [campo]: valor };
    setForm(nuevo);
    if (intentado) setErrores(validar(nuevo));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    const errs = validar(form);
    setErrores(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => resumen.current?.focus());
      return;
    }
    setGuardando(true);
    await onGuardado(form);
    setGuardando(false);
  }

  const listaErrores = Object.entries(errores) as [keyof DecisionCaso, string][];
  const idCampo: Record<keyof DecisionCaso, string> = {
    relacion: "relacion-repetido",
    especie: "campo-especie",
    estadio: "campo-estadio",
    tincion: "campo-tincion",
    aumento: "campo-aumento",
    nota: "campo-nota",
  };
  const vistaPrevia = observacionDesdeCaso(caso, form, t);

  return (
    <form onSubmit={enviar} noValidate className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg" aria-labelledby="titulo-editor">
      {/* Cabecera del caso */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-md min-w-0">
          <span className="px-space-sm py-space-xs rounded-lg bg-primary text-on-primary font-code-mono-bold text-code-mono-bold shrink-0">{caso.id}</span>
          <div className="min-w-0">
            <h2 id="titulo-editor" className="font-headline-sm text-headline-sm text-primary">
              Edición y Homologación de Metadatos
            </h2>
            <p className="font-tag-xs text-tag-xs text-on-surface-variant truncate">
              ID Original Archivo: <span className="font-code-mono text-code-mono">{caso.archivoOriginal}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-space-xs">
          {caso.comparaCon && (
            <button
              type="button"
              onClick={() => setComparar(true)}
              className="px-space-md py-space-xs rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm flex items-center gap-space-xs whitespace-nowrap"
            >
              <Icono nombre="compare" className="text-[16px]" />
              <span>Comparar con #{caso.comparaCon}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setCrudos(true)}
            className="p-space-xs rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
            title="Ver metadatos DICOM/EXIF crudos"
            aria-label="Ver metadatos DICOM/EXIF crudos"
          >
            <Icono nombre="data_object" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* Resumen de errores */}
      {listaErrores.length > 0 && (
        <div ref={resumen} tabIndex={-1} role="alert" className="p-space-md rounded-lg bg-[#FEF3F2] border border-[#FECACA] text-clinical-critical-ink flex flex-col gap-space-xs outline-none focus:ring-2 focus:ring-error">
          <p className="font-label-sm text-label-sm font-semibold flex items-center gap-space-xs">
            <Icono nombre="error" className="text-[18px]" />
            No se puede guardar: corrija {listaErrores.length === 1 ? "1 campo" : `${listaErrores.length} campos`}.
          </p>
          <ul className="list-disc pl-space-xl font-body-sm text-body-sm">
            {listaErrores.map(([campo, msg]) => (
              <li key={campo}>
                <a href={`#${idCampo[campo]}`} className="underline" onClick={(e) => (e.preventDefault(), document.getElementById(idCampo[campo])?.focus())}>
                  {msg}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Visor + diagnóstico */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
        <div className="md:col-span-7 bg-specimen-frame rounded-xl overflow-hidden relative flex flex-col shadow-inner aspect-[4/3]">
          <img
            className="w-full h-full object-cover transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
            alt={caso.imagenAlt}
            src={caso.imagenGrande}
          />
          <div className="absolute top-space-sm left-space-sm bg-primary/80 backdrop-blur-md px-space-sm py-space-xs rounded text-on-primary flex items-center gap-space-sm font-code-mono text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary-container" aria-hidden="true" />
              {form.aumento || "?"} Objetivo Acromático
            </span>
            <span className="text-outline-variant" aria-hidden="true">|</span>
            <span>Escala: 10 µm</span>
          </div>
          <div className="absolute bottom-space-sm right-space-sm bg-primary/80 backdrop-blur-md px-space-sm py-space-xs rounded text-on-primary flex flex-col items-end font-code-mono text-[10px]">
            <div className="h-1 bg-secondary-container mb-0.5" style={{ width: `${4 * zoom}rem` }} aria-hidden="true" />
            <span>|— 15 µm —|</span>
          </div>
          <div className="absolute bottom-space-sm left-space-sm flex items-center gap-1 bg-primary/80 backdrop-blur-md p-1 rounded" role="group" aria-label="Controles de zoom">
            {[
              { i: "zoom_in", t: "Acercar", f: () => setZoom((z) => Math.min(3, z + 0.25)) },
              { i: "zoom_out", t: "Alejar", f: () => setZoom((z) => Math.max(1, z - 0.25)) },
              { i: "restart_alt", t: "Restablecer zoom", f: () => setZoom(1) },
            ].map((b) => (
              <button key={b.i} type="button" onClick={b.f} aria-label={b.t} title={b.t} className="w-6 h-6 flex items-center justify-center text-on-primary hover:bg-white/10 rounded">
                <Icono nombre={b.i} className="text-[16px]" />
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-5 flex flex-col justify-between gap-space-md p-space-md bg-surface-container-low rounded-xl">
          <div className="flex flex-col gap-space-sm">
            <h3 className="flex items-center gap-space-xs text-error font-label-sm text-label-sm font-semibold uppercase tracking-wider">
              <Icono nombre="warning" className="text-[20px]" />
              Diagnóstico de Inconsistencia
            </h3>
            <div className="p-space-sm bg-surface-container-lowest rounded-lg">
              <span className="font-tag-xs text-tag-xs text-on-surface-variant block">Texto Crudo en Hoja de Trabajo:</span>
              <p className="font-code-mono-bold text-code-mono-bold text-error mt-0.5 line-through decoration-error/50">"{caso.textoCrudo}"</p>
            </div>
            {caso.sospechaDuplicado && (
              <div className="p-space-sm bg-surface-container-lowest rounded-lg">
                <span className="font-tag-xs text-tag-xs text-on-surface-variant block">Sospecha de Duplicado de Imagen:</span>
                <p className="font-body-sm text-body-sm text-on-surface mt-0.5">
                  El campo visual comparte un {caso.sospechaDuplicado.similitud}% de similitud estructural con{" "}
                  <span className="font-code-mono font-semibold text-secondary">#{caso.sospechaDuplicado.con}</span> procesado{" "}
                  {caso.sospechaDuplicado.segundos} seg antes.
                </p>
              </div>
            )}
          </div>
          <div className="bg-surface-container p-space-sm rounded-lg flex items-start gap-space-xs">
            <Icono nombre="lightbulb" className="text-secondary text-[18px] shrink-0 mt-0.5" />
            <p className="font-tag-xs text-tag-xs text-on-surface">Sugerencia clínica: {caso.sugerencia}</p>
          </div>
        </div>
      </div>

      {/* Relación con la muestra original */}
      <fieldset className="flex flex-col gap-space-xs pt-space-xs" aria-describedby="relacion-msg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
          <legend className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-space-xs float-left">
            <span>Relación con la Muestra Original</span>
            <span className="text-error" aria-hidden="true">*</span>
            <span className="sr-only">(obligatorio)</span>
          </legend>
          <span className="font-tag-xs text-tag-xs text-on-surface-variant">
            Afecta: FHIR <code className="font-code-mono text-secondary">Specimen.container</code> y{" "}
            <code className="font-code-mono text-secondary">Media.derivedFrom</code>
          </span>
        </div>
        <div className={cx("grid grid-cols-1 md:grid-cols-2 gap-space-md p-space-xs bg-surface-container rounded-xl clear-both", errores.relacion && "ring-2 ring-error")}>
          {(
            [
              {
                v: "repetido",
                titulo: "Escaneo Repetido",
                chip: "Mismo Campo / Slide",
                chipClase: "bg-secondary-fixed text-on-secondary-fixed-variant font-semibold",
                texto: (
                  <>
                    Representa una re-captura o diferente plano focal de la lámina{" "}
                    <span className="font-code-mono text-primary font-semibold">#{caso.comparaCon ?? caso.id}</span>. No suma al recuento total de
                    parásitos por paciente.
                  </>
                ),
              },
              {
                v: "nuevo",
                titulo: "Nuevo Corte o Campo Independiente",
                chip: "Unidad Nueva",
                chipClase: "bg-surface-container-high text-on-surface-variant",
                texto: (
                  <>
                    Corte histológico serial, alícuota secundaria o alícuota independiente. Se registra como nueva{" "}
                    <span className="font-code-mono text-primary font-semibold">Specimen</span> en el Bundle.
                  </>
                ),
              },
            ] as const
          ).map((o) => {
            const marcado = form.relacion === o.v;
            return (
              <label
                key={o.v}
                className={cx(
                  "flex items-start gap-space-md p-space-md rounded-lg cursor-pointer transition-all relative",
                  marcado ? "bg-surface-container-lowest shadow-sm hover:shadow" : "hover:bg-surface-container-lowest",
                )}
              >
                <input
                  id={`relacion-${o.v}`}
                  className="mt-1 w-4 h-4 shrink-0 accent-secondary"
                  name="relacion"
                  type="radio"
                  value={o.v}
                  checked={marcado}
                  onChange={() => cambiar("relacion", o.v)}
                />
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs flex-wrap">
                    <span className={cx("font-body-semibold text-body-semibold", marcado ? "text-primary" : "text-on-surface")}>{o.titulo}</span>
                    <span className={cx("px-space-xs py-0.5 rounded font-tag-xs text-tag-xs", o.chipClase)}>{o.chip}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{o.texto}</p>
                </div>
              </label>
            );
          })}
        </div>
        <div id="relacion-msg">
          {errores.relacion ? (
            <span className="font-tag-xs text-tag-xs text-error flex items-center gap-1">
              <Icono nombre="error" className="text-[14px]" />
              {errores.relacion}
            </span>
          ) : alertas.relacion ? (
            <span className="font-tag-xs text-tag-xs text-clinical-warning flex items-center gap-1">
              <Icono nombre="warning" className="text-[14px]" />
              {alertas.relacion}
            </span>
          ) : null}
        </div>
        <div className="mt-space-xs">
          <label htmlFor="campo-nota" className="sr-only">
            Nota opcional de trazabilidad
          </label>
          <input
            id="campo-nota"
            value={form.nota}
            onChange={(e) => cambiar("nota", e.target.value)}
            aria-invalid={!!errores.nota}
            aria-describedby="nota-msg"
            className={cx(
              "w-full px-space-md py-space-sm bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none focus:ring-2 transition-all",
              errores.nota ? "ring-2 ring-error" : "focus:ring-secondary/30",
            )}
            placeholder="Nota opcional de trazabilidad (ej. Re-enfoque microscópico por desenfoque periférico en borde del cubreobjetos)..."
            type="text"
          />
          <p id="nota-msg" className={cx("mt-1 font-tag-xs text-tag-xs text-right", form.nota.length > MAX_NOTA ? "text-error" : "text-on-surface-variant")}>
            {errores.nota ? `${errores.nota} ` : ""}
            {form.nota.length}/{MAX_NOTA}
          </p>
        </div>
      </fieldset>

      {/* Normalización terminológica */}
      <div className="flex flex-col gap-space-md pt-space-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
          <h3 className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wider">Normalización Terminológica Estándar</h3>
          <span className="font-tag-xs text-tag-xs text-secondary font-code-mono">Sistemas: SNOMED-CT | LOINC | NCBI Taxonomy</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <CampoSelect
            id="campo-especie"
            etiqueta="Especie / Taxonomía FHIR"
            requerido
            pista={`Crudo: '${caso.textoCrudo}'`}
            pistaError
            valor={form.especie}
            onCambio={(v) => cambiar("especie", v)}
            opciones={[
              ...t.especies.map((e) => ({ valor: e.codigo, texto: `${e.display} (SNOMED: ${e.codigo}${e.ncbi ? ` | NCBI: ${e.ncbi}` : ""})` })),
              { valor: "otro", texto: "Buscar otro código en servidor terminológico..." },
            ]}
            error={errores.especie}
            alerta={alertas.especie}
            ayuda={
              form.especie === "otro" ? (
                <button type="button" onClick={onAbrirMapeos} className="font-tag-xs text-tag-xs text-secondary underline text-left">
                  Abrir Configuración de Mapeos SNOMED / LOINC
                </button>
              ) : form.especie ? (
                <span className="font-tag-xs text-tag-xs text-secondary flex items-center gap-1">
                  <Icono nombre="check_circle" className="text-[14px]" />
                  Mapeado canónico a HL7 CodeableReference
                </span>
              ) : null
            }
          />
          <CampoSelect
            id="campo-estadio"
            etiqueta="Estadío Parasitario del Organismo"
            requerido
            pista="LOINC: 622-1"
            valor={form.estadio}
            onCambio={(v) => cambiar("estadio", v)}
            opciones={t.estadios.map((e) => ({ valor: e.codigo, texto: e.display }))}
            error={errores.estadio}
            ayuda={
              form.estadio && (
                <span className="font-tag-xs text-tag-xs text-secondary flex items-center gap-1">
                  <Icono nombre="check_circle" className="text-[14px]" />
                  Observation.component[life-stage]
                </span>
              )
            }
          />
          <CampoSelect
            id="campo-tincion"
            etiqueta="Método de Tinción / Preparación"
            requerido
            pista="Specimen.processing"
            valor={form.tincion}
            onCambio={(v) => cambiar("tincion", v)}
            opciones={t.tinciones.map((e) => ({ valor: e.codigo, texto: e.display }))}
            error={errores.tincion}
            ayuda={<span className="font-tag-xs text-tag-xs text-on-surface-variant">Detectado: {caso.deteccionTincion}</span>}
          />
          <CampoSelect
            id="campo-aumento"
            etiqueta="Aumento Óptico de Captura"
            requerido
            pista="Media.device.magnification"
            valor={form.aumento}
            onCambio={(v) => cambiar("aumento", v)}
            opciones={t.aumentos.map((e) => ({ valor: e.codigo, texto: e.display }))}
            error={errores.aumento}
            alerta={!form.aumento && !intentado ? "Aumento ausente en los metadatos EXIF." : null}
            ayuda={
              aumento && (
                <span className="font-tag-xs text-tag-xs text-secondary flex items-center gap-1">
                  <Icono nombre="check_circle" className="text-[14px]" />
                  Calibrado a {aumento.calibracion}
                </span>
              )
            }
          />
        </div>
      </div>

      {/* Vista previa FHIR */}
      <div className="flex flex-col gap-space-xs pt-space-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
          <span className="font-tag-xs text-tag-xs uppercase tracking-wider text-on-surface-variant">Trazabilidad FHIR R4 en Vivo (Bundle Resource Preview)</span>
          {listaErrores.length ? (
            <span className="font-code-mono text-code-mono text-error">Campos pendientes ✕</span>
          ) : (
            <span className="font-code-mono text-code-mono text-secondary">JSON Schema Compliant ✓</span>
          )}
        </div>
        <JsonVivo
          valor={vistaPrevia}
          etiqueta="Vista previa del recurso FHIR Observation"
          className="bg-primary-container p-space-md rounded-xl text-on-primary shadow-inner max-h-[380px]"
        />
      </div>

      {/* Acciones */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md pt-space-md">
        {confirmarDescarte ? (
          <div className="flex items-center gap-space-xs flex-wrap" role="group" aria-label="Confirmar descarte">
            <span className="font-label-sm text-label-sm text-error">¿Descartar {caso.id} como artefacto?</span>
            <button
              type="button"
              autoFocus
              onClick={async () => {
                setConfirmarDescarte(false);
                await onDescartado();
              }}
              className="px-space-md py-space-xs rounded-lg bg-error text-on-error font-label-sm text-label-sm"
            >
              Sí, descartar
            </button>
            <button type="button" onClick={() => setConfirmarDescarte(false)} className="px-space-md py-space-xs rounded-lg bg-surface-container font-label-sm text-label-sm">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmarDescarte(true)}
            className="px-space-md py-space-sm rounded-lg bg-surface-container hover:bg-error-container hover:text-on-error-container text-on-surface-variant font-label-sm text-label-sm transition-colors flex items-center gap-space-xs justify-center"
          >
            <Icono nombre="delete_sweep" className="text-[18px]" />
            <span>Descartar lámina (Artefacto)</span>
          </button>
        )}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm">
          <button
            type="button"
            disabled={patronAplicado}
            onClick={onAplicarPatron}
            className="px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-dim text-primary font-label-sm text-label-sm transition-colors flex items-center gap-space-xs justify-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Icono nombre={patronAplicado ? "check" : "auto_fix_high"} className="text-[18px]" />
            <span>{patronAplicado ? `Regla aplicada a ${patronCasos} casos` : `Aplicar regla a ${patronCasos} casos similares`}</span>
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="px-space-lg py-space-sm rounded-lg bg-primary hover:bg-surface-tint text-on-primary font-body-semibold text-body-semibold shadow-md transition-all flex items-center gap-space-sm justify-center disabled:opacity-70"
          >
            <span>{guardando ? "Guardando…" : "Guardar y Siguiente caso"}</span>
            <kbd className="px-space-xs py-0.5 rounded bg-white/20 font-code-mono text-[11px]">Enter ↵</kbd>
          </button>
        </div>
      </div>

      {/* Ventana: comparación */}
      <Modal abierto={comparar} onCerrar={() => setComparar(false)} etiquetaId="titulo-comparar" className="relative bg-surface-container-lowest rounded-xl max-w-3xl w-full p-space-lg shadow-xl flex flex-col gap-space-md mt-[8vh]">
        <div className="flex items-center justify-between">
          <h2 id="titulo-comparar" className="font-headline-sm text-headline-sm text-primary">
            Comparación {caso.id} vs {caso.comparaCon}
          </h2>
          <button type="button" onClick={() => setComparar(false)} aria-label="Cerrar" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Icono nombre="close" className="text-[20px]" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
          {[caso.id, caso.comparaCon].map((id, i) => (
            <figure key={id} className="flex flex-col gap-space-xs">
              <img src={caso.imagenGrande} alt={`Campo de la lámina ${id}`} className={cx("rounded-lg aspect-[4/3] object-cover bg-specimen-frame", i === 1 && "scale-x-[-1] brightness-95")} />
              <figcaption className="font-code-mono text-code-mono text-on-surface-variant">#{id}</figcaption>
            </figure>
          ))}
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Similitud estructural: <strong className="text-on-surface">{caso.sospechaDuplicado?.similitud ?? "—"}%</strong>. (Prototipo: la segunda imagen es una
          simulación.)
        </p>
      </Modal>

      {/* Ventana: metadatos crudos */}
      <Modal abierto={crudos} onCerrar={() => setCrudos(false)} etiquetaId="titulo-crudos" className="relative bg-surface-container-lowest rounded-xl max-w-xl w-full p-space-lg shadow-xl flex flex-col gap-space-md mt-[8vh]">
        <div className="flex items-center justify-between">
          <h2 id="titulo-crudos" className="font-headline-sm text-headline-sm text-primary">
            Metadatos DICOM/EXIF crudos
          </h2>
          <button type="button" onClick={() => setCrudos(false)} aria-label="Cerrar" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Icono nombre="close" className="text-[20px]" />
          </button>
        </div>
        <JsonVivo
          etiqueta="Metadatos crudos de la imagen"
          className="bg-primary-container p-space-md rounded-xl text-on-primary max-h-80"
          valor={{
            FileName: caso.archivoOriginal,
            Magnification: caso.aumentoMiniatura === "?" ? null : caso.aumentoMiniatura,
            WorksheetText: caso.textoCrudo,
            Sample: caso.muestra,
            Note: "Metadatos sintéticos del prototipo",
          }}
        />
      </Modal>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
export default function Limpieza({ children }: { children?: React.ReactNode }) {
  const { datos, error, recargar } = useDatos(async () => {
    const [cola, terminologia, estados] = await Promise.all([api.obtenerCola(), api.obtenerTerminologia(), api.obtenerEstadosCasos()]);
    return { cola, terminologia, estados };
  });
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const avisar = useAvisos();
  const filtro = (params.get("filtro") as Filtro) || "todos";
  const [estados, setEstados] = useState<Record<string, EstadoCaso>>({});
  const [activoId, setActivoId] = useState<string | null>(null);
  const [autoAvanzar, setAutoAvanzar] = useState(true);
  const [patronAplicado, setPatronAplicado] = useState(false);
  const [atajos, setAtajos] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (datos) setEstados(datos.estados);
  }, [datos]);

  const visibles = useMemo(
    () => (datos ? datos.cola.casos.filter((c) => filtro === "todos" || c.categoria === filtro) : []),
    [datos, filtro],
  );

  useEffect(() => {
    if (!visibles.length) return;
    if (!activoId || !visibles.some((c) => c.id === activoId)) {
      setActivoId((visibles.find((c) => estados[c.id]?.estado === "pendiente") ?? visibles[0]).id);
    }
  }, [visibles, activoId, estados]);

  // Atajos: Alt+↓ / Alt+↑ para moverse por la cola
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      const i = visibles.findIndex((c) => c.id === activoId);
      const j = e.key === "ArrowDown" ? Math.min(visibles.length - 1, i + 1) : Math.max(0, i - 1);
      if (visibles[j]) setActivoId(visibles[j].id);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [visibles, activoId]);

  if (error) return <ErrorCarga mensaje={error} onReintentar={recargar} />;
  if (!datos) return <Cargando />;

  const { cola, terminologia } = datos;
  const terminadosSesion = Object.values(estados).filter((e) => e.estado !== "pendiente").length;
  const resueltos = cola.resueltosPrevios + terminadosSesion + (patronAplicado ? cola.patron.casos : 0);
  const pct = ((resueltos / cola.totalPendientes) * 100).toFixed(1);
  const activo = visibles.find((c) => c.id === activoId) ?? null;
  const pendientesVisibles = visibles.filter((c) => estados[c.id]?.estado === "pendiente");

  function siguiente(desde: string) {
    const i = visibles.findIndex((c) => c.id === desde);
    const resto = [...visibles.slice(i + 1), ...visibles.slice(0, i)];
    const prox = resto.find((c) => estados[c.id]?.estado === "pendiente" && c.id !== desde);
    if (prox) {
      setActivoId(prox.id);
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function guardar(d: DecisionCaso) {
    if (!activo) return;
    await api.guardarCaso(activo.id, d);
    setEstados((e) => ({ ...e, [activo.id]: { estado: "resuelto", decision: d } }));
    avisar("exito", `${activo.id} guardado y normalizado.`);
    if (autoAvanzar) siguiente(activo.id);
  }

  async function descartar() {
    if (!activo) return;
    await api.descartarCaso(activo.id);
    setEstados((e) => ({ ...e, [activo.id]: { estado: "descartado" } }));
    avisar("info", `${activo.id} descartado como artefacto.`);
    if (autoAvanzar) siguiente(activo.id);
  }

  async function aplicarPatron() {
    const n = await api.aplicarPatron();
    setPatronAplicado(true);
    avisar("exito", `Regla aplicada a ${n} casos del lote ${cola.patron.lote}.`);
  }

  const filtros: { id: Filtro; texto: string; total: number; punto?: string }[] = [
    { id: "todos", texto: "Todos", total: cola.filtros.todos },
    { id: "snomed", texto: "Nomenclatura SNOMED", total: cola.filtros.snomed, punto: "bg-error" },
    { id: "duplicados", texto: "Duplicados & Cortes", total: cola.filtros.duplicados, punto: "bg-secondary" },
  ];

  return (
    <div className="flex flex-col w-full">
      {/* Barra de fase */}
      <div className="w-full bg-surface-container-lowest px-gutter md:px-gutter-lg py-space-lg shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-on-primary shrink-0">
              <Icono nombre="tune" className="text-[22px]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-tag-xs text-tag-xs uppercase tracking-wider text-secondary">Fase 2 de 3</span>
                <span className="w-1 h-1 rounded-full bg-outline-variant" aria-hidden="true" />
                <span className="font-code-mono text-code-mono text-on-surface-variant font-semibold">FHIR R4 Diagnostic Pipeline</span>
              </div>
              <h1 className="font-headline-md text-headline-md text-primary tracking-tight">Limpieza Guiada de Metadatos Parasitológicos</h1>
            </div>
          </div>
          <div className="flex items-center gap-space-lg flex-wrap">
            <div className="flex flex-col items-start lg:items-end">
              <div className="flex items-center gap-space-xs">
                <span className="font-body-semibold text-body-semibold text-primary">{numero(resueltos)}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">de {numero(cola.totalPendientes)} resueltos</span>
              </div>
              <span className="font-tag-xs text-tag-xs text-secondary font-semibold">{pct}% completado</span>
            </div>
            <div
              className="w-36 h-2 bg-surface-container rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Avance de la limpieza"
              aria-valuenow={Number(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-secondary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="h-8 w-px bg-surface-container-highest hidden sm:block" />
            <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-space-xs rounded-lg">
              <Icono nombre="timer" className="text-on-surface-variant text-[18px]" />
              <span className="font-code-mono text-code-mono text-on-surface-variant">~48s / caso</span>
            </div>
          </div>
        </div>
        <div className="mt-space-lg pt-space-md flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs flex-wrap" role="group" aria-label="Filtrar la cola">
            {filtros.map((f) => {
              const activoF = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={activoF}
                  onClick={() => setParams(f.id === "todos" ? {} : { filtro: f.id })}
                  className={cx(
                    "px-space-md py-space-xs rounded-lg font-label-sm text-label-sm flex items-center gap-space-xs transition-colors",
                    activoF ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface",
                  )}
                >
                  {f.punto && <span className={cx("w-2 h-2 rounded-full", f.punto)} aria-hidden="true" />}
                  <span>{f.texto}</span>
                  <span
                    className={cx(
                      "px-space-xs py-0.5 rounded-full font-code-mono text-code-mono",
                      activoF ? "bg-white/20" : "bg-surface-container-highest text-on-surface-variant",
                    )}
                  >
                    {f.total}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative flex items-center gap-space-sm">
            <label className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm cursor-pointer select-none">
              <input checked={autoAvanzar} onChange={(e) => setAutoAvanzar(e.target.checked)} className="w-4 h-4 rounded accent-secondary" type="checkbox" />
              <span>Auto-avanzar al validar</span>
            </label>
            <button
              type="button"
              onClick={() => setAtajos((a) => !a)}
              aria-expanded={atajos}
              aria-controls="panel-atajos"
              className="p-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg"
              title="Atajos de teclado"
              aria-label="Atajos de teclado"
            >
              <Icono nombre="keyboard" className="text-[20px]" />
            </button>
            {atajos && (
              <div id="panel-atajos" className="absolute right-0 top-full mt-1 z-20 w-72 bg-surface-container-lowest rounded-xl shadow-xl border border-surface-container p-space-md">
                <h2 className="font-label-sm text-label-sm font-semibold text-primary mb-space-xs">Atajos de teclado</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-space-xs font-body-sm text-body-sm">
                  <dt><kbd className="font-code-mono text-code-mono bg-surface-container px-1 rounded">Enter</kbd></dt>
                  <dd>Guardar y pasar al siguiente caso</dd>
                  <dt><kbd className="font-code-mono text-code-mono bg-surface-container px-1 rounded">Alt + ↓ / ↑</kbd></dt>
                  <dd>Caso siguiente / anterior</dd>
                  <dt><kbd className="font-code-mono text-code-mono bg-surface-container px-1 rounded">Tab</kbd></dt>
                  <dd>Recorrer los campos</dd>
                  <dt><kbd className="font-code-mono text-code-mono bg-surface-container px-1 rounded">Esc</kbd></dt>
                  <dd>Cerrar ventanas</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-gutter md:px-gutter-lg py-space-lg">
        <div className="grid grid-cols-12 gap-space-lg">
          {/* Cola */}
          <section aria-labelledby="titulo-cola" className="col-span-12 xl:col-span-4 flex flex-col gap-space-sm">
            <div className="flex items-center justify-between px-space-xs pb-space-xs gap-space-sm">
              <div className="flex items-center gap-space-xs flex-wrap">
                <h2 id="titulo-cola" className="font-tag-xs text-tag-xs uppercase tracking-wider text-on-surface-variant">
                  Cola de Trabajo
                </h2>
                {activo && <span className="font-code-mono text-code-mono font-semibold text-secondary">#{activo.id} activo</span>}
              </div>
              <span className="font-tag-xs text-tag-xs text-on-surface-variant">Orden: Severidad crítica</span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-space-sm">
              {visibles.map((c) => (
                <TarjetaCola key={c.id} caso={c} activo={c.id === activoId} estado={estados[c.id] ?? { estado: "pendiente" }} onElegir={() => setActivoId(c.id)} />
              ))}
            </ul>
            <div className="mt-space-sm p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-xs text-secondary">
                <Icono nombre="auto_fix_high" className="text-[18px]" />
                <span className="font-tag-xs text-tag-xs font-semibold uppercase tracking-wider">Patrón Detectado</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface">
                {patronAplicado
                  ? `Las ${cola.patron.casos} láminas del lote '${cola.patron.lote}' fueron normalizadas.`
                  : `${cola.patron.casos} láminas del lote '${cola.patron.lote}' presentan el error de transcripción '${cola.patron.error}'. Podrás normalizarlas todas al validar este caso.`}
              </p>
            </div>
          </section>

          {/* Editor */}
          <section ref={editorRef} aria-label="Editor de Curación de Metadatos" className="col-span-12 xl:col-span-8 flex flex-col gap-space-lg scroll-mt-20">
            {pendientesVisibles.length === 0 && (
              <div role="status" className="p-space-lg rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-clinical-success-ink flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
                <p className="font-body-semibold text-body-semibold flex items-center gap-space-xs">
                  <Icono nombre="task_alt" />
                  No quedan casos pendientes en esta vista.
                </p>
                <button
                  type="button"
                  onClick={() => navegar("/confirmacion")}
                  className="px-space-lg py-space-sm rounded-lg bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-space-xs justify-center"
                >
                  Ir a Confirmación y Exportación
                  <Icono nombre="arrow_forward" className="text-[18px]" />
                </button>
              </div>
            )}
            {activo && (
              <EditorCaso
                key={activo.id}
                caso={activo}
                terminologia={terminologia}
                patronAplicado={patronAplicado}
                patronCasos={cola.patron.casos}
                onGuardado={guardar}
                onDescartado={descartar}
                onAplicarPatron={aplicarPatron}
                onAbrirMapeos={() => navegar("/mapeos")}
              />
            )}
            {!activo && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No hay casos en este filtro. <Link to="/limpieza" className="text-secondary underline">Ver todos</Link>
              </p>
            )}
          </section>
        </div>
      </div>
      {children}
    </div>
  );
}
