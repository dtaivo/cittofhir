import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type ResultadoTransmision } from "../api";
import { useAvisos } from "../components/Avisos";
import { Cargando, ErrorCarga } from "../components/Estados";
import { Icono } from "../components/Icono";
import { bundleDeEjemplo, mediaDesdeFila, observacionDesdeCaso } from "../lib/fhir";
import { aCsv, descargarArchivo, descargarBlob } from "../lib/descargar";
import { casoDesdeFila, generarExcelCurado } from "../lib/planilla";
import { cx, fechaUtc, numero } from "../lib/formato";
import { useDatos } from "../lib/useDatos";
import { validarToken, validarUrlFhir } from "../lib/validacion";

const BINDING_PRIMARIO = new Set(["Specimen.parent", "Specimen.container", "Specimen.status"]);

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Confirmacion() {
  const { datos, error, recargar } = useDatos(async () => {
    const [exp, cola, estados, terminologia, curadas] = await Promise.all([
      api.obtenerExportacion(),
      api.obtenerCola(),
      api.obtenerEstadosCasos(),
      api.obtenerTerminologia(),
      api.obtenerFilasCuradas(),
    ]);
    return { exp, cola, estados, terminologia, curadas };
  });
  const avisar = useAvisos();
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [verToken, setVerToken] = useState(false);
  const [idempotencia, setIdempotencia] = useState("If-None-Exist: identifier");
  const [errores, setErrores] = useState<{ url?: string | null; token?: string | null }>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTransmision | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  if (error) return <ErrorCarga mensaje={error} onReintentar={recargar} />;
  if (!datos) return <Cargando />;

  const { exp, cola, estados, terminologia, curadas } = datos;
  const urlActual = url ?? exp.servidorDestino.url;
  const tokenActual = token ?? exp.servidorDestino.token;
  const pendientes = cola.casos.filter((c) => (estados[c.id]?.estado ?? "pendiente") === "pendiente");
  const total = exp.certificacion.total;
  const porcentaje = Math.round((exp.certificacion.verificados / total) * 100);
  const completo = exp.certificacion.verificados >= total;
  const eventos = verTodo ? exp.auditoria : exp.auditoria.slice(0, 6);

  function construirBundle() {
    if (curadas) {
      // Planilla real: filas conformes + casos resueltos, con seudónimo y fecha
      // Por cada lámina: un Media (la imagen y su digitalización) + una Observation (el hallazgo) que apunta al Media
      const entradas = curadas.flatMap(({ fila, decision }) => {
        const urlMedia = `urn:uuid:${crypto.randomUUID()}`;
        const obs = observacionDesdeCaso(casoDesdeFila(fila, terminologia, ""), decision, terminologia, {
          idLamina: fila.idLamina,
          institucion: fila.institucion,
          media: urlMedia,
        });
        return [{ fullUrl: urlMedia, resource: mediaDesdeFila(fila) }, obs];
      });
      return bundleDeEjemplo(exp.bundleId.replace("urn:uuid:", ""), entradas.length, entradas, "Generado por ParaFHIR (prototipo): revisar antes de uso clínico");
    }
    const entradas = cola.casos
      .filter((c) => estados[c.id]?.estado === "resuelto" && estados[c.id]?.decision)
      .map((c) => observacionDesdeCaso(c, estados[c.id].decision!, terminologia));
    return bundleDeEjemplo("cittofhir-bundle-2025-chg", total, entradas);
  }

  async function transmitir(e: FormEvent) {
    e.preventDefault();
    const errs = { url: validarUrlFhir(urlActual), token: validarToken(tokenActual) };
    setErrores(errs);
    if (errs.url || errs.token) {
      document.getElementById(errs.url ? "campo-url" : "campo-token")?.focus();
      return;
    }
    setResultado(null);
    setEnviando(true);
    const r = await api.transmitirBundle(urlActual.trim(), tokenActual.trim());
    setEnviando(false);
    setResultado(r);
    if (r.ok) recargar();
  }

  async function descargar(id: string) {
    if (id === "json") {
      const texto = JSON.stringify(construirBundle(), null, 2);
      descargarArchivo("cittofhir-bundle-2025-chg.json", texto, "application/fhir+json");
      const hash = await sha256(texto);
      avisar("exito", <>Bundle JSON descargado. SHA-256: <span className="font-code-mono break-all">{hash.slice(0, 16)}…</span></>);
    } else if (id === "xlsx" && curadas) {
      descargarBlob("Excel_Clinico_Curado.xlsx", await generarExcelCurado(curadas, terminologia));
      avisar("exito", `Excel curado descargado: ${curadas.length} filas.`);
    } else if (id === "xlsx") {
      const filas = [
        ["id_muestra", "estado", "especie_snomed", "estadio", "tincion", "aumento", "nota"],
        ...cola.casos.map((c) => {
          const est = estados[c.id];
          const d = est?.decision;
          return [c.id, est?.estado ?? "pendiente", d?.especie ?? "", d?.estadio ?? "", d?.tincion ?? "", d?.aumento ?? "", d?.nota ?? ""];
        }),
      ];
      descargarArchivo("Excel_Clinico_Curado.csv", aCsv(filas), "text/csv;charset=utf-8");
      avisar("info", "En el prototipo el Excel curado se entrega como .csv (abre en Excel).");
    } else {
      avisar("error", "El paquete Parquet no está disponible en el prototipo.");
    }
  }

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(urlActual);
      avisar("exito", "URL copiada al portapapeles.");
    } catch {
      avisar("error", "No se pudo copiar. Selecciónela y copie manualmente.");
    }
  }

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-[1440px] mx-auto px-gutter md:px-gutter-lg py-space-xl flex flex-col gap-space-xl">
        {/* Encabezado */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="px-space-sm py-space-xs bg-primary-container text-on-primary font-tag-xs text-tag-xs uppercase tracking-wider rounded-lg">Fase 3 de 3</span>
              <span className="font-code-mono text-code-mono text-secondary font-semibold">FHIR R4 • Package Spec {exp.packageSpec}</span>
            </div>
            <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary tracking-tight">
              Validación Completa y Exportación de Metadatos
            </h1>
            <p className="font-body-base text-body-base text-on-surface-variant max-w-2xl">
              {completo
                ? "El proceso de curación terminológica, resolución de duplicados y estructuración de observaciones parasitológicas ha concluido con certificación de integridad total."
                : `La curación está en curso: ${numero(total - exp.certificacion.verificados)} de ${numero(total)} registros aún requieren revisión antes de exportar el lote completo.`}
            </p>
          </div>
          <div className="flex items-center gap-space-sm self-start lg:self-center flex-wrap">
            <Link
              to="/limpieza"
              className="px-space-md py-space-sm bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm rounded-lg transition-all flex items-center gap-space-xs"
            >
              <Icono nombre="arrow_back" className="text-[18px]" />
              <span>Revisar Reglas</span>
            </Link>
            <Link
              to="/visor"
              className="px-space-md py-space-sm bg-secondary hover:bg-secondary-container text-on-secondary hover:text-on-secondary-container font-label-sm text-label-sm rounded-lg transition-all flex items-center gap-space-xs shadow-sm"
            >
              <Icono nombre="fullscreen" className="text-[18px]" />
              <span>Abrir Visor Citológico</span>
            </Link>
          </div>
        </div>

        {/* Alerta: casos sin revisar en esta sesión */}
        {pendientes.length > 0 && (
          <div role="status" className="p-space-md rounded-xl bg-[#FFFAEB] border border-[#FDE68A] text-clinical-warning-ink flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <p className="font-body-sm text-body-sm flex items-start gap-space-xs">
              <Icono nombre="warning" className="text-[18px] shrink-0" />
              <span>
                Quedan <strong>{pendientes.length} casos</strong> de la cola sin revisar ({pendientes.map((c) => c.id).join(", ")}). Puede exportar igual,
                pero no entrarán al Bundle.
              </span>
            </p>
            <Link to="/limpieza" className="font-label-sm text-label-sm underline whitespace-nowrap">
              Ir a revisarlos
            </Link>
          </div>
        )}

        {/* Banner de certificación */}
        <section aria-labelledby="titulo-cert" className="relative overflow-hidden bg-primary text-on-primary rounded-xl shadow-xl p-space-lg md:p-space-xl flex flex-col lg:flex-row items-center justify-between gap-space-xl">
          <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-secondary-container/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="absolute left-1/3 -top-20 w-80 h-80 rounded-full bg-primary-container/40 blur-2xl pointer-events-none" aria-hidden="true" />
          <div className="flex flex-col sm:flex-row items-center gap-space-xl relative z-10 w-full lg:w-auto">
            <div className="relative flex items-center justify-center shrink-0 w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                <circle className="text-primary-container fill-none" cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="8" />
                <circle
                  className="text-secondary-container fill-none"
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="currentColor"
                  strokeDasharray="326.72"
                  strokeDashoffset={326.72 * (1 - porcentaje / 100)}
                  strokeLinecap="round"
                  strokeWidth="8"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <Icono nombre="verified" className="text-secondary-container text-[24px]" />
                <span className="font-headline-md text-headline-md text-on-primary font-bold tracking-tight">{porcentaje}%</span>
                <span className="font-tag-xs text-tag-xs text-secondary-fixed uppercase tracking-wider">Auditado</span>
              </div>
            </div>
            <div className="flex flex-col gap-space-xs text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-space-sm">
                <span className="inline-flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary/30 text-secondary-fixed font-code-mono-bold text-code-mono-bold rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-secondary-container animate-pulse" aria-hidden="true" />
                  CERTIFICACIÓN DE INTEGRIDAD CLÍNICA
                </span>
                <span className="font-tag-xs text-tag-xs text-surface-container-high break-all">Bundle ID: {exp.bundleId}</span>
              </div>
              <h2 id="titulo-cert" className="font-headline-md text-headline-md text-on-primary">
                {numero(exp.certificacion.verificados)} de {numero(total)} Láminas y Registros Verificados
              </h2>
              <p className="font-body-sm text-body-sm text-surface-container-high max-w-xl">
                {completo ? (
                  <>
                    Cumplimiento estricto del perfil <strong className="text-on-primary">Observation/Specimen FHIR {exp.packageSpec}</strong> y Guías CittoFHIR IG-CL.
                    Taxonomía SNOMED-CT sin discrepancias semánticas y LOINC mapeado al 100%.
                  </>
                ) : (
                  <>
                    Solo los registros verificados entran al Bundle. Los <strong className="text-on-primary">{numero(total - exp.certificacion.verificados)} restantes</strong>{" "}
                    quedan fuera hasta revisarlos en Limpieza Guiada.
                  </>
                )}
              </p>
            </div>
          </div>
          <ul className="flex flex-col sm:flex-row lg:flex-col gap-space-sm w-full lg:w-80 shrink-0 relative z-10">
            {exp.resumen.map((r, i) => (
              <li key={r.texto} className="flex-1 flex items-center justify-between gap-space-sm p-space-md bg-surface-container-lowest/10 backdrop-blur-md rounded-lg">
                <div className="flex items-center gap-space-sm">
                  <Icono nombre={i === 0 ? "layers" : i === 1 ? "content_cut" : "gavel"} className="text-secondary-container text-[20px]" />
                  <span className="font-label-sm text-label-sm text-on-primary">{r.texto}</span>
                </div>
                <span className={cx("font-code-mono-bold text-code-mono-bold whitespace-nowrap", i === 2 ? "text-secondary-fixed" : "text-secondary-container")}>
                  {r.valor} {r.unidad}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {exp.kpis.map((k, i) => (
            <div key={k.titulo} className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between gap-space-md hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <h3 className="font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider">{k.titulo}</h3>
                <div
                  className={cx(
                    "w-8 h-8 rounded-full bg-surface-container flex items-center justify-center",
                    i === 0 ? "text-primary" : i === 2 ? "text-primary-container" : "text-secondary",
                  )}
                >
                  <Icono nombre={k.icono} className="text-[18px]" />
                </div>
              </div>
              <div className="flex flex-col gap-space-xs">
                <span className="font-display-lg text-display-lg text-primary">{k.valor}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{k.descripcion}</span>
              </div>
              <div className={cx("pt-space-xs flex items-center gap-space-xs", k.pieMono ? "text-on-surface-variant" : "text-secondary")}>
                {k.pieIcono && <Icono nombre={i === 1 ? "photo_camera_front" : i === 3 ? "sync_saved_locally" : k.pieIcono} className="text-[16px]" />}
                <span className={k.pieMono ? "font-code-mono text-code-mono text-primary font-semibold" : "font-tag-xs text-tag-xs"}>{k.pie}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Transmisión + descargas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <form
            onSubmit={transmitir}
            noValidate
            aria-labelledby="titulo-transmision"
            className="lg:col-span-7 bg-surface-container-lowest p-space-lg md:p-space-xl rounded-xl shadow-sm flex flex-col justify-between gap-space-lg"
          >
            <div className="flex flex-col gap-space-md">
              <div className="flex items-start sm:items-center justify-between gap-space-sm flex-col sm:flex-row">
                <div className="flex items-center gap-space-sm">
                  <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                    <Icono nombre="cloud_upload" className="text-[24px]" />
                  </div>
                  <div className="flex flex-col">
                    <h2 id="titulo-transmision" className="font-headline-sm text-headline-sm text-primary">
                      Transmisión Directa al Servidor FHIR
                    </h2>
                    <span className="font-tag-xs text-tag-xs text-on-surface-variant">{exp.servidorDestino.nombre}</span>
                  </div>
                </div>
                <span className="px-space-sm py-space-xs bg-surface-container text-secondary font-code-mono-bold text-code-mono-bold rounded-lg flex items-center gap-space-xs whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />
                  TLS v1.3 Conectado
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Inyecta el bundle como transacción atómica tipo{" "}
                <code className="px-space-xs py-0.5 bg-surface-container rounded font-code-mono text-code-mono text-primary font-semibold">batch/transaction</code>. El
                servidor resolverá referencias de los especímenes, pacientes y las observaciones microscópicas.
              </p>
              <div className="p-space-md bg-surface-container-low rounded-xl flex flex-col gap-space-sm">
                <div className="flex items-center justify-between gap-space-sm">
                  <label htmlFor="campo-url" className="font-label-sm text-label-sm text-on-surface-variant">
                    Target Base URL Canonical <span className="text-error">*</span>
                  </label>
                  <span className="font-tag-xs text-tag-xs text-on-surface-variant font-code-mono">HTTP POST /Bundle</span>
                </div>
                <div className={cx("flex items-center gap-space-sm bg-surface-container-lowest p-space-sm rounded-lg shadow-sm focus-within:ring-2", errores.url ? "ring-2 ring-error" : "focus-within:ring-diagnostic-cyan/30")}>
                  <Icono nombre="dns" className="text-secondary text-[18px]" />
                  <input
                    id="campo-url"
                    type="url"
                    value={urlActual}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (errores.url) setErrores((x) => ({ ...x, url: validarUrlFhir(e.target.value) }));
                    }}
                    aria-invalid={!!errores.url}
                    aria-describedby="campo-url-msg"
                    className="font-code-mono text-code-mono text-primary bg-transparent w-full min-w-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={copiarUrl}
                    className="px-space-sm py-space-xs hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface font-tag-xs text-tag-xs flex items-center gap-1 transition-all"
                    title="Copiar URL"
                  >
                    <Icono nombre="content_copy" className="text-[16px]" />
                    <span>Copiar</span>
                  </button>
                </div>
                <p id="campo-url-msg" className="font-tag-xs text-tag-xs text-error flex items-center gap-1">
                  {errores.url && (
                    <>
                      <Icono nombre="error" className="text-[14px]" />
                      {errores.url}
                    </>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="campo-token" className="font-tag-xs text-tag-xs text-on-surface-variant">
                      Client OAuth2 Token <span className="text-error">*</span>
                    </label>
                    <div className={cx("flex items-center gap-space-xs bg-surface-container-lowest px-space-sm py-space-xs rounded-lg focus-within:ring-2", errores.token ? "ring-2 ring-error" : "focus-within:ring-diagnostic-cyan/30")}>
                      <Icono nombre="vpn_key" className="text-[16px] text-secondary" />
                      <input
                        id="campo-token"
                        type={verToken ? "text" : "password"}
                        autoComplete="off"
                        value={tokenActual}
                        onChange={(e) => {
                          setToken(e.target.value);
                          if (errores.token) setErrores((x) => ({ ...x, token: validarToken(e.target.value) }));
                        }}
                        aria-invalid={!!errores.token}
                        aria-describedby="campo-token-msg"
                        className="font-code-mono text-code-mono text-on-surface bg-transparent w-full min-w-0 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setVerToken((v) => !v)}
                        aria-label={verToken ? "Ocultar token" : "Mostrar token"}
                        aria-pressed={verToken}
                        className="text-on-surface-variant hover:text-on-surface"
                      >
                        <Icono nombre={verToken ? "visibility_off" : "visibility"} className="text-[16px]" />
                      </button>
                    </div>
                    <p id="campo-token-msg" className="font-tag-xs text-tag-xs text-error flex items-center gap-1">
                      {errores.token && (
                        <>
                          <Icono nombre="error" className="text-[14px]" />
                          {errores.token}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="campo-idem" className="font-tag-xs text-tag-xs text-on-surface-variant">
                      Políticas de Idempotencia
                    </label>
                    <div className="relative flex items-center gap-space-xs bg-surface-container-lowest px-space-sm py-space-xs rounded-lg focus-within:ring-2 focus-within:ring-diagnostic-cyan/30">
                      <Icono nombre="merge_type" className="text-[16px] text-secondary" />
                      <select
                        id="campo-idem"
                        value={idempotencia}
                        onChange={(e) => setIdempotencia(e.target.value)}
                        className="font-code-mono text-code-mono text-on-surface bg-transparent w-full appearance-none focus:outline-none pr-5"
                      >
                        <option>If-None-Exist: identifier</option>
                        <option>If-Match: versionId</option>
                        <option>Sin condición</option>
                      </select>
                      <Icono nombre="expand_more" className="text-[16px] text-on-surface-variant absolute right-space-sm pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-primary text-on-primary p-space-md rounded-xl font-code-mono text-code-mono flex flex-col gap-space-xs">
                <div className="flex items-center justify-between text-surface-container-high pb-space-xs">
                  <span className="flex items-center gap-space-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-error" aria-hidden="true" />
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-container-highest" aria-hidden="true" />
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary-container" aria-hidden="true" />
                    <span className="ml-space-xs font-tag-xs text-tag-xs text-surface-container-high">Bundle Header Preview</span>
                  </span>
                  <span className="text-on-primary-container">Type: transaction</span>
                </div>
                <pre tabIndex={0} aria-label="Vista previa de la cabecera del Bundle" className="pozo-codigo overflow-x-auto text-[11px] leading-tight text-secondary-fixed">
                  <code>{`{
  "resourceType": "Bundle",
  "id": "cittofhir-bundle-2025-chg",
  "type": "transaction",
  "total": ${exp.certificacion.verificados},
  "entry": [
    { "resource": { "resourceType": "Specimen", "id": "LAM-001", "status": "available" } },
    { "resource": { "resourceType": "Observation", "code": { "coding": [{ "system": "http://loinc.org", "code": "10704-5" }] } } }
  ]
}`}</code>
                </pre>
              </div>
            </div>
            <div className="flex flex-col gap-space-md pt-space-sm">
              <div aria-live="polite">
                {enviando && (
                  <p className="text-secondary font-label-sm text-label-sm flex items-center gap-space-xs">
                    <Icono nombre="refresh" className="text-[18px] animate-spin" />
                    Transmitiendo hacia FHIR Server...
                  </p>
                )}
                {resultado?.ok && (
                  <p className="p-space-md rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-clinical-success-ink font-body-sm text-body-sm flex items-center gap-space-xs">
                    <Icono nombre="check_circle" className="text-[18px]" />
                    {resultado.mensaje}: {numero(resultado.recursos)} recursos. Evento registrado en la auditoría.
                  </p>
                )}
                {resultado && !resultado.ok && (
                  <p role="alert" className="p-space-md rounded-lg bg-[#FEF3F2] border border-[#FECACA] text-clinical-critical-ink font-body-sm text-body-sm flex items-center gap-space-xs">
                    <Icono nombre="error" className="text-[18px]" />
                    {resultado.mensaje}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={enviando}
                className="w-full px-space-lg py-space-md bg-primary hover:bg-primary-container text-on-primary font-body-semibold text-body-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-space-sm group disabled:opacity-70"
              >
                <Icono nombre="send" className="text-secondary-container group-hover:rotate-12 transition-transform" />
                <span>{resultado && !resultado.ok ? "Reintentar transmisión" : `Transmitir Paquete Bundle (${numero(exp.certificacion.verificados)} Recursos)`}</span>
              </button>
            </div>
          </form>

          <section aria-labelledby="titulo-descargas" className="lg:col-span-5 bg-surface-container-lowest p-space-lg md:p-space-xl rounded-xl shadow-sm flex flex-col justify-between gap-space-lg">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                  <Icono nombre="download" className="text-[24px]" />
                </div>
                <div className="flex flex-col">
                  <h2 id="titulo-descargas" className="font-headline-sm text-headline-sm text-primary">
                    Descargas Locales y Científicas
                  </h2>
                  <span className="font-tag-xs text-tag-xs text-on-surface-variant">Archivos paquetizados listos para investigación</span>
                </div>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Exporta el dataset en formatos estandarizados compatibles con herramientas de Bioinformática, hojas de cálculo clínicas o modelos de Computer Vision.
              </p>
              <ul className="flex flex-col gap-space-md">
                {exp.descargas.map((d, i) => (
                  <li key={d.id} className="p-space-md bg-surface-container-low hover:bg-surface-container rounded-xl flex items-center justify-between gap-space-md transition-all group">
                    <div className="flex items-center gap-space-md min-w-0">
                      <div
                        className={cx(
                          "w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-sm",
                          i === 1 ? "text-primary-container" : "text-secondary",
                        )}
                      >
                        <Icono nombre={i === 2 ? "file_download_off" : d.icono} className="text-[20px]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-body-semibold text-body-semibold text-primary">{d.titulo}</span>
                        <span className="font-tag-xs text-tag-xs text-on-surface-variant">
                          {d.descripcion} • {d.tamano}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => descargar(d.id)}
                      aria-label={`Descargar ${d.titulo}`}
                      className="px-space-md py-space-xs bg-surface-container-lowest hover:bg-primary hover:text-on-primary text-secondary font-label-sm text-label-sm rounded-lg shadow-sm transition-all flex items-center gap-1 shrink-0"
                    >
                      <Icono nombre="file_download" className="text-[16px]" />
                      <span>{d.boton}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-space-xs flex items-center gap-space-xs text-on-surface-variant">
              <Icono nombre="security" className="text-[18px] text-secondary" />
              <span className="font-tag-xs text-tag-xs">Checksum SHA-256 generado automáticamente en cada exportación.</span>
            </div>
          </section>
        </div>

        {/* Auditoría */}
        <section aria-labelledby="titulo-auditoria" className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
            <div className="flex items-center gap-space-sm">
              <Icono nombre="history_toggle_off" className="text-secondary text-[22px]" />
              <h2 id="titulo-auditoria" className="font-headline-sm text-headline-sm text-primary">
                Trazabilidad y Auditoría de Curación (Audit Trail)
              </h2>
            </div>
            <div className="flex items-center gap-space-xs">
              <span className="font-tag-xs text-tag-xs text-on-surface-variant uppercase tracking-wider">Eventos Registrados:</span>
              <span className="font-code-mono-bold text-code-mono-bold text-primary">{exp.eventosRegistrados} acciones registradas</span>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left font-body-sm text-body-sm min-w-[760px]">
              <caption className="sr-only">Eventos de curación, del más reciente al más antiguo</caption>
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant uppercase font-tag-xs text-tag-xs tracking-wider">
                  <th scope="col" className="py-space-sm px-space-md rounded-l-lg">Timestamp (UTC)</th>
                  <th scope="col" className="py-space-sm px-space-md">Identificador Muestra</th>
                  <th scope="col" className="py-space-sm px-space-md">Operador / Módulo</th>
                  <th scope="col" className="py-space-sm px-space-md">Acción Ejecutada</th>
                  <th scope="col" className="py-space-sm px-space-md">Binding Ontológico</th>
                  <th scope="col" className="py-space-sm px-space-md rounded-r-lg text-right">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {eventos.map((ev, i) => {
                  const f = fechaUtc(ev.fecha);
                  return (
                    <tr key={`${ev.fecha}-${i}`} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-space-sm px-space-md font-code-mono text-code-mono text-on-surface-variant whitespace-nowrap">
                        {f.dia}
                        <br />
                        {f.hora}
                      </td>
                      <td className="py-space-sm px-space-md font-code-mono-bold text-code-mono-bold text-primary">{ev.muestra}</td>
                      <td className="py-space-sm px-space-md text-on-surface">{ev.operador}</td>
                      <td className="py-space-sm px-space-md text-on-surface">{ev.accion}</td>
                      <td className="py-space-sm px-space-md">
                        <span
                          className={cx(
                            "px-space-xs py-0.5 bg-surface-container font-code-mono text-code-mono rounded whitespace-nowrap",
                            BINDING_PRIMARIO.has(ev.binding) ? "text-primary" : "text-secondary",
                          )}
                        >
                          {ev.binding}
                        </span>
                      </td>
                      <td className="py-space-sm px-space-md text-right">
                        <span className="px-space-sm py-space-xs bg-surface-container text-secondary font-tag-xs text-tag-xs font-semibold rounded-lg">{ev.resultado}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {exp.auditoria.length > 6 && (
            <button type="button" onClick={() => setVerTodo((v) => !v)} aria-expanded={verTodo} className="self-start font-label-sm text-label-sm text-secondary hover:underline">
              {verTodo ? "Mostrar menos" : `Ver los ${exp.auditoria.length} eventos de esta sesión`}
            </button>
          )}
        </section>

        {/* Cierre */}
        <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="w-12 h-12 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary shrink-0">
              <Icono nombre="task_alt" className="text-[26px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-body-semibold text-body-semibold text-primary">
                {exp.nombreLote} {completo ? "Completado" : "en curso"}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {completo
                  ? "Los metadatos están sincronizados y el hash de integridad está registrado en el log."
                  : `Quedan ${numero(total - exp.certificacion.verificados)} registros por revisar.`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm w-full md:w-auto">
            <Link
              to="/carga"
              className="px-space-lg py-space-sm bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm rounded-lg transition-all flex items-center justify-center gap-space-xs flex-1 md:flex-none"
            >
              <Icono nombre="add_circle" className="text-[18px]" />
              <span>Iniciar Nuevo Lote de Muestras</span>
            </Link>
            <Link
              to="/visor"
              className="px-space-lg py-space-sm bg-primary hover:bg-primary-container text-on-primary font-label-sm text-label-sm rounded-lg transition-all flex items-center justify-center gap-space-xs flex-1 md:flex-none"
            >
              <Icono nombre="biotech" className="text-[18px]" />
              <span>Explorar Especímenes Curados</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
