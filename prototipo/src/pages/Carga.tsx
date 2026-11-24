import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Hallazgo } from "../api";
import { useAvisos } from "../components/Avisos";
import { Cargando, ErrorCarga } from "../components/Estados";
import { Icono } from "../components/Icono";
import { Modal } from "../components/Modal";
import { aCsv, descargarArchivo, descargarBlob } from "../lib/descargar";
import { cx, numero, porcentaje, tamano } from "../lib/formato";
import { useDatos } from "../lib/useDatos";
import { ErrorPlanilla, analizarTabla, generarPlantilla, leerArchivo } from "../lib/planilla";
import { EXTENSIONES_PERMITIDAS, validarArchivo } from "../lib/validacion";

type Severidad = "todas" | Hallazgo["severidad"];
const FILTROS: { valor: Severidad; texto: string }[] = [
  { valor: "todas", texto: "Todas las severidades" },
  { valor: "alta", texto: "Alta prioridad" },
  { valor: "media", texto: "Media" },
  { valor: "duplicado", texto: "Duplicados" },
];

/** Resalta en monoespaciado los textos entre comillas o con formato de ID (como en el diseño). */
function conCodigos(texto: string): ReactNode[] {
  return texto.split(/("[^"]+"|ID_LAM-\d+)/g).map((parte, i) =>
    /^("[^"]+"|ID_LAM-\d+)$/.test(parte) ? (
      <span key={i} className="font-code-mono text-on-surface font-semibold">
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}

const ESTILO_HALLAZGO: Record<Hallazgo["severidad"], { icono: string; insignia: string; numero: string; filtro: string }> = {
  alta: { icono: "bg-error-container text-on-error-container", insignia: "bg-error text-on-error", numero: "text-error", filtro: "snomed" },
  media: { icono: "bg-surface-container-high text-secondary", insignia: "bg-surface-container-highest text-on-surface-variant", numero: "text-primary", filtro: "todos" },
  duplicado: { icono: "bg-tertiary-fixed text-on-tertiary-fixed", insignia: "bg-tertiary text-on-tertiary", numero: "text-tertiary", filtro: "duplicados" },
};

export default function Carga() {
  const { datos, error, recargar } = useDatos(api.obtenerCarga);
  const avisar = useAvisos();
  const navegar = useNavigate();
  const entrada = useRef<HTMLInputElement>(null);

  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [esquemaAbierto, setEsquemaAbierto] = useState(false);
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [severidad, setSeveridad] = useState<Severidad>("todas");

  if (error) return <ErrorCarga mensaje={error} onReintentar={recargar} />;
  if (!datos) return <Cargando />;

  const { diagnostico: dx, hallazgos, esquema, muestraTestigo: mt } = datos;
  const pendientes = dx.alertas + dx.duplicados;
  const pct = {
    conformes: porcentaje(dx.conformes, dx.total),
    alertas: porcentaje(dx.alertas, dx.total),
    duplicados: porcentaje(dx.duplicados, dx.total),
  };
  const lote = datos.lote ?? null;
  const archivoVisible = {
    nombre: datos.archivoEjemplo.nombre,
    tamanoBytes: datos.archivoEjemplo.tamanoBytes,
    cargadoEn: lote?.cargadoEn ?? null,
    alerta: [
      lote?.nombre.toLowerCase().endsWith(".csv") ? "Los CSV deben guardarse en UTF-8 para que las tildes se lean bien." : "",
      lote?.columnasIgnoradas.length ? `Columnas no usadas: ${lote.columnasIgnoradas.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ") || null,
  };
  const hallazgosVisibles = hallazgos.filter((h) => severidad === "todas" || h.severidad === severidad);

  async function recibirArchivo(f: File) {
    const r = validarArchivo(f);
    if (r.error) {
      setErrorArchivo(`${f.name}: ${r.error}`);
      avisar("error", r.error);
      return;
    }
    setErrorArchivo(null);
    setProcesando(true);
    try {
      // Todo ocurre en este navegador: el archivo no se envía a ningún servidor.
      const [tabla, terminologia, mapeos] = await Promise.all([leerArchivo(f), api.obtenerTerminologia(), api.obtenerMapeos()]);
      const nuevo = analizarTabla(tabla, { nombre: f.name, tamanoBytes: f.size }, terminologia, mapeos.reglas);
      await api.cargarLote(nuevo);
      recargar();
      const conProblemas = nuevo.filas.filter((x) => x.problemas.length).length;
      avisar(
        "exito",
        <>
          <strong>{f.name}</strong>: {nuevo.filas.length} filas leídas, {conProblemas} requieren revisión.
        </>,
      );
    } catch (e) {
      const mensaje = e instanceof ErrorPlanilla ? e.message : "No se pudo leer el archivo. Revise que sea una planilla válida.";
      setErrorArchivo(`${f.name}: ${mensaje}`);
      avisar("error", mensaje);
    } finally {
      setProcesando(false);
    }
  }

  async function quitarPlanilla() {
    await api.descartarLote();
    setErrorArchivo(null);
    recargar();
    avisar("info", "Planilla retirada de la memoria. Volvió a los datos de demostración.");
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) void recibirArchivo(f);
  }

  function teclaZona(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      entrada.current?.click();
    }
  }

  async function descargarPlantilla(e: React.MouseEvent) {
    e.stopPropagation();
    descargarBlob("plantilla_parafhir.xlsx", await generarPlantilla());
    avisar("exito", "Plantilla descargada. Revise la hoja «Instrucciones».");
  }

  function descargarReporte() {
    const filas = [
      ["Hallazgo", "Prioridad", "Casos", "Impacta", "Detalle"],
      ...hallazgos.map((h) => [h.titulo, h.prioridad, h.casos, h.impacta, h.detalle]),
    ];
    const nombre = `Reporte_Inconsistencias_${(lote?.nombre ?? "demo").replace(/\.[^.]+$/, "")}.csv`;
    descargarArchivo(nombre, aCsv(filas), "text/csv;charset=utf-8");
    avisar("info", `Generando ${nombre}…`);
  }

  const kpis = [
    { titulo: "Total Registros", valor: dx.total, desc: "Láminas citológicas y parasitológicas", color: "text-primary", barra: "bg-primary", ancho: "100", chip: null },
    { titulo: "Conformes FHIR R4", valor: dx.conformes, desc: "Listas para serialización Observation", color: "text-secondary", barra: "bg-secondary", ancho: pct.conformes, chip: "conforme" },
    { titulo: "Alertas de Nomenclatura", valor: dx.alertas, desc: "Especie, estadio, formato o flujo por revisar", color: "text-error", barra: "bg-error", ancho: pct.alertas, chip: "error" },
    { titulo: "Posibles Duplicados", valor: dx.duplicados, desc: "Códigos de lámina repetidos", color: "text-tertiary", barra: "bg-tertiary-container", ancho: pct.duplicados, chip: "duplicado" },
  ] as const;

  return (
    <div className="flex flex-col w-full">
      <div className="w-full px-gutter md:px-gutter-lg py-space-xl flex flex-col gap-space-xl max-w-7xl mx-auto">
        {/* Encabezado de fase */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="px-space-sm py-0.5 bg-primary-container text-on-primary font-tag-xs text-tag-xs uppercase tracking-wider rounded-lg">
                Fase de Ingesta
              </span>
              <span className="font-tag-xs text-tag-xs text-on-surface-variant font-medium">Paso 1 de 3 • Diagnóstico de Metadatos</span>
            </div>
            <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary tracking-tight">
              Carga y Diagnóstico Preliminar de Metadatos
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant max-w-2xl">
              Estandarización automatizada bajo perfiles HL7 FHIR R4 para observaciones parasitológicas y microscópicas. Suba
              lotes de laboratorio para validar taxonomías, tinciones y duplicados.
            </p>
          </div>
          <div className="flex items-center gap-space-md self-start md:self-auto bg-surface-container-low px-space-md py-space-sm rounded-xl">
            <div className="flex items-center gap-space-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary-container animate-pulse" aria-hidden="true" />
              <span className="font-code-mono text-code-mono text-secondary font-semibold">FHIR Parser: {datos.estudio.parser}</span>
            </div>
            <div className="h-4 w-px bg-surface-container-highest" />
            <span className="font-tag-xs text-tag-xs text-on-surface-variant">LOINC {datos.estudio.loinc} Bound</span>
          </div>
        </div>

        {/* ¿Demo o planilla real? */}
        {lote ? (
          <div role="status" className="p-space-md rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-clinical-success-ink flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <p className="font-body-sm text-body-sm flex items-start gap-space-xs">
              <Icono nombre="lock" className="text-[18px] shrink-0" />
              <span>
                Trabajando con <strong>{lote.nombre}</strong>. La planilla se lee <strong>solo en este navegador</strong>: no se envía a ningún servidor y se borra al
                cerrar o recargar la página.
              </span>
            </p>
            <button type="button" onClick={quitarPlanilla} className="font-label-sm text-label-sm underline whitespace-nowrap self-start sm:self-auto">
              Quitar planilla
            </button>
          </div>
        ) : (
          <div role="status" className="p-space-md rounded-xl bg-surface-container-low text-on-surface-variant flex items-start gap-space-xs">
            <Icono nombre="info" className="text-[18px] shrink-0 text-secondary" />
            <p className="font-body-sm text-body-sm">
              Está viendo <strong className="text-on-surface">datos de demostración</strong>. Descargue la plantilla, complétela y cárguela para trabajar con sus
              datos. La planilla se procesa solo en este navegador.
            </p>
          </div>
        )}

        {/* Zona de carga + archivo activo */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
          <div
            role="button"
            tabIndex={0}
            aria-describedby="ayuda-carga error-carga"
            aria-busy={procesando}
            onClick={() => !procesando && entrada.current?.click()}
            onKeyDown={teclaZona}
            onDragEnter={(e) => (e.preventDefault(), setArrastrando(true))}
            onDragOver={(e) => (e.preventDefault(), setArrastrando(true))}
            onDragLeave={(e) => (e.preventDefault(), setArrastrando(false))}
            onDrop={soltar}
            className={cx(
              "lg:col-span-7 rounded-xl p-space-xl shadow-sm flex flex-col justify-between relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer group",
              arrastrando ? "bg-surface-container-low ring-2 ring-secondary" : "bg-surface-container-lowest",
              errorArchivo && "ring-2 ring-error",
            )}
          >
            <input
              ref={entrada}
              accept={EXTENSIONES_PERMITIDAS.join(",")}
              className="hidden"
              type="file"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void recibirArchivo(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-xs text-secondary">
                <Icono nombre="cloud_upload" className="text-[20px]" />
                <span className="font-tag-xs text-tag-xs uppercase tracking-wider font-semibold">Carga de Lotes de Laboratorio</span>
              </div>
              <span className="font-tag-xs text-tag-xs text-on-surface-variant bg-surface-container px-space-sm py-0.5 rounded-md whitespace-nowrap">
                .XLSX • .CSV
              </span>
            </div>
            <div className="py-space-xl flex flex-col items-center text-center gap-space-sm">
              <div
                className={cx(
                  "w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-200",
                  errorArchivo ? "bg-error-container text-error" : "bg-surface-container-low text-secondary",
                )}
              >
                {procesando ? (
                  <span className="w-8 h-8 rounded-full border-[3px] border-secondary border-t-transparent animate-spin" aria-hidden="true" />
                ) : (
                  <Icono nombre={errorArchivo ? "error" : "upload_file"} className="text-[32px]" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-headline-sm text-headline-sm text-primary">
                  {procesando ? "Procesando diagnóstico…" : "Arrastre su planilla de microscopía aquí"}
                </p>
                <p id="ayuda-carga" className="font-body-sm text-body-sm text-on-surface-variant">
                  o haga clic para explorar archivos del microscopio digital / LIS
                </p>
              </div>
              <div className="flex items-center gap-space-sm mt-space-xs text-on-surface-variant flex-wrap justify-center">
                <span className="font-tag-xs text-tag-xs flex items-center gap-1">
                  <Icono nombre="verified_user" className="text-[14px] text-secondary" />
                  Codificación UTF-8
                </span>
                <span aria-hidden="true">•</span>
                <span className="font-tag-xs text-tag-xs flex items-center gap-1">
                  <Icono nombre="table_view" className="text-[14px] text-secondary" />
                  Máx 50,000 registros
                </span>
              </div>
              <div id="error-carga" role="alert" className="min-h-0">
                {errorArchivo && (
                  <p className="mt-space-xs px-space-md py-space-xs bg-error-container text-on-error-container font-label-sm text-label-sm rounded-lg flex items-center gap-space-xs">
                    <Icono nombre="error" className="text-[16px]" />
                    {errorArchivo}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-surface-container-low p-space-sm rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs text-on-surface-variant">
              <span className="font-tag-xs text-tag-xs flex items-center gap-space-xs">
                <Icono nombre="info" className="text-[16px]" />
                Compatible con plantillas de Citopatología, Chagas, Giardiasis y Coproparasitología.
              </span>
              <button
                type="button"
                onClick={descargarPlantilla}
                className="font-tag-xs text-tag-xs text-secondary font-semibold hover:underline self-start sm:self-auto whitespace-nowrap"
              >
                Descargar plantilla .xlsx
              </button>
            </div>
          </div>

          <section aria-labelledby="titulo-archivo" className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <h2 id="titulo-archivo" className="font-tag-xs text-tag-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                  Archivo en Memoria de Curación
                </h2>
                <span className="px-space-sm py-0.5 bg-surface-container text-secondary font-code-mono-bold text-code-mono-bold rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
                  Activo
                </span>
              </div>
              <div className="p-space-md bg-surface-container-low rounded-xl flex items-start gap-space-md">
                <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-sm">
                  <Icono nombre="description" className="text-[24px]" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <p className="font-body-semibold text-body-semibold text-primary truncate" title={archivoVisible.nombre}>
                    {archivoVisible.nombre}
                  </p>
                  <div className="flex items-center gap-space-sm mt-0.5">
                    <span className="font-code-mono text-code-mono text-on-surface-variant font-semibold">{tamano(archivoVisible.tamanoBytes)}</span>
                    <span className="text-on-surface-variant text-[10px]" aria-hidden="true">•</span>
                    <span className="font-tag-xs text-tag-xs text-on-surface-variant">
                      {archivoVisible.cargadoEn ? "Procesado hace un momento" : "Procesado hace 2 min"}
                    </span>
                  </div>
                  <div className="mt-space-xs flex items-center gap-space-xs">
                    <span className="font-tag-xs text-tag-xs text-secondary-container bg-primary px-space-xs py-px rounded font-code-mono">
                      {datos.archivoEjemplo.columnas} columnas detectadas
                    </span>
                  </div>
                </div>
              </div>
              {archivoVisible.alerta && (
                <p role="status" className="px-space-md py-space-sm rounded-lg bg-[#FFFAEB] text-clinical-warning-ink border border-[#FDE68A] font-tag-xs text-tag-xs flex items-start gap-space-xs">
                  <Icono nombre="warning" className="text-[16px]" />
                  {archivoVisible.alerta}
                </p>
              )}
              <div className="flex flex-col gap-space-xs">
                <span className="font-tag-xs text-tag-xs text-on-surface-variant font-medium">Esquema mapeado preliminarmente:</span>
                <div className="flex flex-wrap gap-1">
                  {esquema.slice(0, 5).map((c) => (
                    <span key={c.columna} className="px-space-xs py-0.5 bg-surface-container text-on-surface font-code-mono text-[11px] rounded">
                      {c.columna}
                    </span>
                  ))}
                  <span className="px-space-xs py-0.5 bg-surface-container-high text-on-surface-variant font-code-mono text-[11px] rounded">
                    {datos.archivoEjemplo.columnas > 5 ? `+${datos.archivoEjemplo.columnas - 5} campos` : `${esquema.length} campos`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-space-sm pt-space-md mt-space-md bg-surface-container-lowest">
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={procesando}
                className="flex-1 py-space-sm px-space-md bg-surface-container-high hover:bg-surface-container text-primary font-label-sm text-label-sm rounded-lg flex items-center justify-center gap-space-xs transition-colors disabled:opacity-60"
              >
                <Icono nombre="sync" className="text-[16px]" />
                <span>Reemplazar archivo</span>
              </button>
              <button
                type="button"
                onClick={() => setEsquemaAbierto(true)}
                className="flex-1 py-space-sm px-space-md bg-surface-container-low hover:bg-surface-container text-secondary font-label-sm text-label-sm rounded-lg flex items-center justify-center gap-space-xs transition-colors"
              >
                <Icono nombre="schema" className="text-[16px]" />
                <span>Ver esquema</span>
              </button>
            </div>
          </section>
        </div>

        {/* KPIs */}
        <section aria-labelledby="titulo-dx" className="flex flex-col gap-space-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
            <h2 id="titulo-dx" className="font-headline-sm text-headline-sm text-primary">
              Diagnóstico Rápido de Calidad y Conformidad FHIR
            </h2>
            <span className="font-tag-xs text-tag-xs text-on-surface-variant">Lote auditado contra perfil IG-Parasitology R4</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
            {kpis.map((k) => (
              <div key={k.titulo} className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <h3 className="font-tag-xs text-tag-xs uppercase tracking-wider text-on-surface-variant font-semibold">{k.titulo}</h3>
                  {k.chip === null && (
                    <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                      <Icono nombre="smb_share" className="text-[18px]" />
                    </div>
                  )}
                  {k.chip === "conforme" && (
                    <span className="px-space-xs py-0.5 bg-surface-container-low text-secondary font-tag-xs text-tag-xs rounded font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />
                      {k.ancho}%
                    </span>
                  )}
                  {k.chip === "error" && (
                    <span className="px-space-xs py-0.5 bg-error-container text-on-error-container font-tag-xs text-tag-xs rounded font-semibold">{k.ancho}%</span>
                  )}
                  {k.chip === "duplicado" && (
                    <span className="px-space-xs py-0.5 bg-tertiary-fixed text-on-tertiary-fixed font-tag-xs text-tag-xs rounded font-semibold">{k.ancho}%</span>
                  )}
                </div>
                <div className="my-space-sm">
                  <div className={cx("font-display-lg text-display-lg tracking-tight", k.color)}>{numero(k.valor)}</div>
                  <p className="font-tag-xs text-tag-xs text-on-surface-variant mt-0.5">{k.desc}</p>
                </div>
                <div
                  className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden"
                  role="progressbar"
                  aria-label={k.titulo}
                  aria-valuenow={Number(k.ancho)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className={cx(k.barra, "h-1.5 rounded-full")} style={{ width: `${k.ancho}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Hallazgos + salud del lote */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <section aria-labelledby="titulo-hallazgos" className="lg:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
              <div>
                <h2 id="titulo-hallazgos" className="font-headline-sm text-headline-sm text-primary">
                  Desglose de Hallazgos Diagnósticos
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {numero(pendientes)} registros requieren confirmación o corrección antes del bundling HL7.
                </p>
              </div>
              <div className="relative flex items-center gap-space-xs">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={filtroAbierto}
                  aria-controls="menu-severidad"
                  onClick={() => setFiltroAbierto((a) => !a)}
                  className="px-space-sm py-1 bg-surface-container text-on-surface text-label-sm font-label-sm rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-1"
                >
                  {severidad === "todas" ? "Filtrar por severidad" : FILTROS.find((f) => f.valor === severidad)?.texto}
                  <Icono nombre="expand_more" className="text-[16px]" />
                </button>
                {filtroAbierto && (
                  <fieldset
                    id="menu-severidad"
                    className="absolute right-0 top-full mt-1 z-10 w-56 bg-surface-container-lowest rounded-xl shadow-xl border border-surface-container p-space-xs"
                    onKeyDown={(e) => e.key === "Escape" && setFiltroAbierto(false)}
                  >
                    <legend className="sr-only">Severidad</legend>
                    {FILTROS.map((f) => (
                      <label key={f.valor} className="flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg hover:bg-surface-container-low cursor-pointer font-label-sm text-label-sm">
                        <input
                          type="radio"
                          name="severidad"
                          className="accent-secondary"
                          checked={severidad === f.valor}
                          onChange={() => {
                            setSeveridad(f.valor);
                            setFiltroAbierto(false);
                          }}
                        />
                        {f.texto}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            </div>
            <ul className="flex flex-col gap-space-sm">
              {hallazgosVisibles.map((h) => {
                const e = ESTILO_HALLAZGO[h.severidad];
                const [etiqueta, valor] = h.detalle.split(": ");
                return (
                  <li key={h.id} className="p-space-md bg-surface-container-low rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
                    <div className="flex items-start gap-space-md">
                      <div className={cx("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5", e.icono)}>
                        <Icono nombre={h.icono} className="text-[20px]" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <h3 className="font-body-semibold text-body-semibold text-primary">{h.titulo}</h3>
                          <span className={cx("px-space-xs py-px font-tag-xs text-tag-xs rounded", e.insignia)}>{h.prioridad}</span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{conCodigos(h.descripcion)}</p>
                        <div className="flex items-center gap-x-space-md gap-y-0 flex-wrap mt-space-xs font-tag-xs text-tag-xs text-on-surface-variant">
                          <span>
                            Impacta: <span className="font-semibold text-on-surface">{h.impacta}</span>
                          </span>
                          <span aria-hidden="true">•</span>
                          <span>
                            {etiqueta}:{" "}
                            <span className={cx("font-semibold", etiqueta === "Campos" ? "font-code-mono" : "text-on-surface")}>{valor}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-space-xs shrink-0">
                      <span className={cx("font-headline-sm text-headline-sm", e.numero)}>{h.casos} casos</span>
                      <button
                        type="button"
                        onClick={() => navegar(`/limpieza?filtro=${e.filtro}`)}
                        className="px-space-sm py-1 text-secondary font-label-sm text-label-sm hover:underline flex items-center gap-0.5"
                      >
                        Previsualizar<span className="sr-only"> {h.titulo}</span>
                        <Icono nombre="chevron_right" className="text-[16px]" />
                      </button>
                    </div>
                  </li>
                );
              })}
              {hallazgosVisibles.length === 0 && (
                <li className="p-space-md text-on-surface-variant font-body-sm text-body-sm">No hay hallazgos con esa severidad.</li>
              )}
            </ul>
          </section>

          <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-space-lg content-start">
            <section aria-labelledby="titulo-salud" className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <h2 id="titulo-salud" className="font-headline-sm text-headline-sm text-primary">
                  Salud del Lote
                </h2>
                <span className="px-space-xs py-0.5 bg-surface-container text-on-surface-variant font-code-mono text-code-mono rounded">N={numero(dx.total)}</span>
              </div>
              <div className="flex items-center justify-center py-space-sm relative">
                <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 36 36" role="img" aria-label={`${pct.conformes}% del lote aprobado`}>
                  {[
                    { c: "text-surface-container", d: "100, 100", o: "0" },
                    { c: "text-secondary", d: `${pct.conformes}, 100`, o: "0" },
                    { c: "text-error", d: `${pct.alertas}, 100`, o: `-${pct.conformes}` },
                    { c: "text-tertiary-container", d: `${pct.duplicados}, 100`, o: `-${(Number(pct.conformes) + Number(pct.alertas)).toFixed(1)}` },
                  ].map((s, i) => (
                    <path
                      key={i}
                      className={s.c}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeDasharray={s.d}
                      strokeDashoffset={s.o}
                      strokeWidth="4"
                    />
                  ))}
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center" aria-hidden="true">
                  <span className="font-headline-md text-headline-md text-primary font-bold">{pct.conformes}%</span>
                  <span className="font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider">Aprobado</span>
                </div>
              </div>
              <dl className="flex flex-col gap-space-xs font-tag-xs text-tag-xs">
                {[
                  { color: "bg-secondary", t: "FHIR Conforme", v: dx.conformes },
                  { color: "bg-error", t: "Alerta de Taxonomía", v: dx.alertas },
                  { color: "bg-tertiary-container", t: "Duplicados / Series", v: dx.duplicados },
                ].map((l) => (
                  <div key={l.t} className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5">
                      <span className={cx("w-2 h-2 rounded-full", l.color)} aria-hidden="true" />
                      {l.t}
                    </dt>
                    <dd className="font-code-mono text-on-surface font-semibold">{numero(l.v)} reg</dd>
                  </div>
                ))}
              </dl>
            </section>

{!lote && (
            <section aria-labelledby="titulo-testigo" className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <h2 id="titulo-testigo" className="font-tag-xs text-tag-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                  Muestra Testigo del Lote
                </h2>
                <span className="font-code-mono text-code-mono text-secondary">{mt.id}</span>
              </div>
              <div className="relative w-full h-32 rounded-lg overflow-hidden bg-primary">
                <img className="w-full h-full object-cover opacity-85" alt={mt.alt} src={mt.imagen} />
                <div className="absolute bottom-2 left-2 bg-primary/80 backdrop-blur px-2 py-0.5 rounded text-[11px] font-code-mono text-white flex items-center gap-1">
                  <Icono nombre="straighten" className="text-[13px] text-secondary-container" />
                  10 µm
                </div>
                <div className="absolute top-2 right-2 bg-error/90 text-white font-tag-xs text-tag-xs px-2 py-0.5 rounded flex items-center gap-1">
                  <Icono nombre="warning" className="text-[12px]" />
                  {mt.alerta}
                </div>
              </div>
              <div className="flex items-center justify-between gap-space-sm flex-wrap text-on-surface-variant font-tag-xs text-tag-xs">
                <span>
                  Objetivo: <strong className="text-on-surface font-code-mono">{mt.objetivo}</strong>
                </span>
                <span>
                  Tinción: <strong className="text-on-surface">{mt.tincion}</strong>
                </span>
              </div>
            </section>
            )}
          </div>
        </div>

        {/* Siguiente paso */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md border-t-2 border-secondary">
          <div className="flex items-center gap-space-md">
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
              <Icono nombre="forward" className="text-[26px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-primary">Siguiente paso: Limpieza Guiada</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Se resolverán las {numero(pendientes)} observaciones aplicando ontologías LOINC, SNOMED CT y resolución de duplicados en un click.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm w-full md:w-auto">
            <button
              type="button"
              onClick={descargarReporte}
              className="px-space-md py-space-sm bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm rounded-lg flex items-center justify-center gap-space-xs transition-colors whitespace-nowrap"
            >
              <Icono nombre="download" className="text-[18px]" />
              <span>Descargar reporte (CSV/PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => navegar("/limpieza")}
              className="px-space-lg py-space-sm bg-primary text-on-primary font-label-sm text-label-sm rounded-lg hover:bg-primary-container transition-all flex items-center justify-center gap-space-xs shadow-md group whitespace-nowrap"
            >
              <span>Continuar a Limpieza Guiada ({numero(pendientes)})</span>
              <Icono nombre="arrow_forward" className="text-[18px] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      <Modal
        abierto={esquemaAbierto}
        onCerrar={() => setEsquemaAbierto(false)}
        etiquetaId="titulo-esquema"
        className="relative bg-surface-container-lowest rounded-xl max-w-xl w-full p-space-lg shadow-xl flex flex-col gap-space-md mt-[10vh]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <Icono nombre="schema" className="text-secondary" />
            <h2 id="titulo-esquema" className="font-headline-sm text-headline-sm text-primary">
              Esquema de Columnas Detectado
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setEsquemaAbierto(false)}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
          >
            <Icono nombre="close" className="text-[20px]" />
          </button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Correspondencia inferida desde el archivo Excel hacia la estructura de datos HL7 FHIR R4:
        </p>
        <ul className="bg-surface-container-low rounded-lg p-space-sm max-h-64 overflow-y-auto flex flex-col gap-1">
          {esquema.map((c) => (
            <li key={c.columna} className="flex items-center justify-between gap-space-sm p-space-xs bg-surface-container-lowest rounded font-code-mono text-[12px]">
              <span className="text-primary font-semibold">{c.columna}</span>
              <span className="text-secondary text-right">→ {c.destino}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-space-xs">
          <button
            type="button"
            onClick={() => setEsquemaAbierto(false)}
            className="px-space-md py-space-xs bg-primary text-on-primary font-label-sm text-label-sm rounded-lg hover:bg-primary-container"
          >
            Entendido
          </button>
        </div>
      </Modal>
    </div>
  );
}
