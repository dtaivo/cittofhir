/**
 * Fuente de datos LOCAL (de mentira).
 * Lee archivos JSON sintéticos y guarda los cambios solo en memoria:
 * al recargar la página todo vuelve al estado inicial.
 * Simula la demora de un servidor real para que se vean los estados de "cargando".
 */
import estudioJson from "../data/estudio.json";
import casosJson from "../data/casos.json";
import terminologiaJson from "../data/terminologia.json";
import catalogoJson from "../data/catalogo.json";
import mapeosJson from "../data/mapeos.json";
import exportacionJson from "../data/exportacion.json";
import { casoDesdeFila, idCaso, patronMasFrecuente, siNo } from "../lib/planilla";
import type {
  ColaLimpieza,
  FilaLote,
  Hallazgo,
  Lote,
  DatosCarga,
  DatosExportacion,
  DatosMapeos,
  DecisionCaso,
  EstadoCaso,
  EventoAuditoria,
  FuenteDatos,
  ReglaMapeo,
  Terminologia,
} from "./tipos";

const DEMORA_MS = 250;
const esperar = <T,>(valor: T, ms = DEMORA_MS) =>
  new Promise<T>((resolver) => setTimeout(() => resolver(structuredClone(valor)), ms));

// Copias en memoria (se reinician al recargar la página)
const carga = estudioJson as unknown as DatosCarga;
const cola = casosJson as unknown as ColaLimpieza;
const terminologiaBase = terminologiaJson as unknown as Terminologia;

/**
 * Lista de especies = catálogo de la tutora (data/Repositorio.xlsx, con su código SNOMED)
 * + especies extra de terminologia.json que no estén en el catálogo.
 * Las especies del catálogo sin código SNOMED no se ofrecen (quedan "por revisar").
 */
function grupoTaxonomico(filo?: string, clase?: string) {
  if (filo === "Nematoda") return "Nematoda";
  if (clase === "Cestoda" || clase === "Trematoda") return clase;
  return null;
}

const especiesCatalogo = catalogoJson.especies
  .filter((e) => e.snomed)
  .map((e) => ({
    codigo: e.snomed!.codigo,
    display: e.snomed!.display,
    nombreLocal: e.nombre,
    grupo: e.clasificacion,
    via: (e.snomed as { via?: string }).via,
    sinonimos: e.sinonimos,
    grupoTaxonomico: grupoTaxonomico(e.filo, e.clase),
  }));
const codigosCatalogo = new Set(especiesCatalogo.map((e) => e.codigo));
const terminologia: Terminologia = {
  ...terminologiaBase,
  taxones: catalogoJson.especies.map((e) => ({
    tax: e.tax,
    nombre: e.nombre,
    codigo: e.snomed?.codigo ?? null,
    grupoTaxonomico: grupoTaxonomico(e.filo, e.clase),
  })),
  especies: [
    ...especiesCatalogo,
    ...terminologiaBase.especies.filter((e) => !codigosCatalogo.has(e.codigo)).map((e) => ({ ...e, grupo: "Otros" })),
  ],
};
const mapeos = structuredClone(mapeosJson) as unknown as DatosMapeos;
const exportacion = { ...structuredClone(exportacionJson), nombreLote: "Lote Chagas & Giardia 2025" } as unknown as DatosExportacion;
/** Inicio de esta sesión: con planilla real, la auditoría muestra solo eventos desde aquí. */
const inicioSesion = new Date().toISOString();
const estadosDemo: Record<string, EstadoCaso> = Object.fromEntries(
  cola.casos.map((c) => [c.id, { estado: "pendiente" } as EstadoCaso]),
);

/* ---------- Lote real (planilla leída en el navegador; vive solo en memoria) ---------- */
let lote: Lote | null = null;
let colaReal: ColaLimpieza | null = null;
let filasPatron: FilaLote[] = [];
let bundleIdReal = "";
let estados: Record<string, EstadoCaso> = estadosDemo;

const conProblemas = (l: Lote) => l.filas.filter((f) => f.problemas.length);
const tiene = (f: FilaLote, tipo: string) => f.problemas.some((p) => p.tipo === tipo);

function diagnosticoReal(l: Lote) {
  const duplicados = l.filas.filter((f) => tiene(f, "duplicado")).length;
  const alertas = l.filas.filter((f) => f.problemas.length && !tiene(f, "duplicado")).length;
  return { total: l.filas.length, conformes: l.filas.length - duplicados - alertas, alertas, duplicados };
}

function hallazgosReales(l: Lote): Hallazgo[] {
  const ejemplos = (tipo: string, campo: (f: FilaLote) => string) =>
    [...new Set(l.filas.filter((f) => tiene(f, tipo)).map(campo).filter(Boolean))].slice(0, 3).map((x) => `"${x}"`).join(", ");
  const contar = (tipo: string) => l.filas.filter((f) => tiene(f, tipo)).length;
  const lista: Hallazgo[] = [
    {
      id: "taxonomia", icono: "spellcheck", titulo: "Especie (Tax) sin código válido", prioridad: "Alta prioridad", severidad: "alta",
      descripcion: `Códigos Tax que no existen en el catálogo o que aún no tienen código SNOMED CT. Ejemplos: ${ejemplos("taxonomia", (f) => f.tax) || "celdas vacías"}.`,
      impacta: "Observation.valueCodeableConcept", detalle: "Campos: Tax", casos: contar("taxonomia"),
    },
    {
      id: "optica", icono: "zoom_in", titulo: "Estado evolutivo o aumento incompletos", prioridad: "Media", severidad: "media",
      descripcion: "Faltan o no se reconocen el estado evolutivo o el aumento del objetivo.",
      impacta: "Observation.component / Media", detalle: "Campos: Estado evolutivo, Aumento", casos: contar("optica"),
    },
    {
      id: "duplicados", icono: "content_copy", titulo: "Código de lámina repetido", prioridad: "Duplicados", severidad: "duplicado",
      descripcion: `Láminas con el mismo Código en más de una fila. Ejemplos: ${ejemplos("duplicado", (f) => f.idLamina)}.`,
      impacta: "Specimen.identifier.value", detalle: "Sugerencia: Agrupación en Serie", casos: contar("duplicado"),
    },
    {
      id: "formato", icono: "rule", titulo: "Datos obligatorios o formato inválido", prioridad: "Alta prioridad", severidad: "alta",
      descripcion: "Filas sin Código o Tipo muestra, con fechas no válidas o con tamaños y dimensiones que no son números.",
      impacta: "Specimen / Media", detalle: "Campos: Código, Tipo muestra, Fecha digitalización, Width, Height", casos: contar("formato"),
    },
    {
      id: "flujo", icono: "fact_check", titulo: "Control de calidad de la digitalización", prioridad: "Media", severidad: "media",
      descripcion: `Inconsistencias en el flujo del repositorio. Ejemplos: ${ejemplos("flujo", (f) => f.problemas.find((p) => p.tipo === "flujo")!.texto) || "—"}.`,
      impacta: "Flujo del repositorio", detalle: "Campos: Evaluaciones, Reescaneo, Aprobadas, Ingresadas, RPMV Público", casos: contar("flujo"),
    },
  ];
  return lista.filter((h) => h.casos > 0);
}

function decisionCompleta(f: FilaLote) {
  const p = f.propuesta;
  // Solo se corrige en bloque si el único problema de la fila es el estadio mal escrito.
  const soloEstadio = f.problemas.every((x) => x.tipo === "optica" && x.texto.startsWith("Estado evolutivo"));
  return soloEstadio && !!(p.relacion && p.especie && (p.especie === "negativo" || p.estadio) && p.aumento);
}

function registrarEvento(evento: Omit<EventoAuditoria, "fecha" | "operador">) {
  exportacion.auditoria.unshift({
    fecha: new Date().toISOString(),
    operador: carga.usuario.nombre,
    ...evento,
  });
  exportacion.eventosRegistrados += 1;
}

export const fuenteLocal: FuenteDatos = {
  obtenerCarga() {
    if (!lote) return esperar({ ...carga, lote: null });
    return esperar({
      ...carga,
      lote: { nombre: lote.archivo.nombre, tamanoBytes: lote.archivo.tamanoBytes, hoja: lote.hoja, columnasIgnoradas: lote.columnasIgnoradas, cargadoEn: lote.cargadoEn },
      archivoEjemplo: { nombre: lote.archivo.nombre, tamanoBytes: lote.archivo.tamanoBytes, columnas: lote.columnas.length },
      esquema: lote.columnas,
      diagnostico: diagnosticoReal(lote),
      hallazgos: hallazgosReales(lote),
    });
  },

  async cargarLote(nuevo) {
    lote = nuevo;
    const casos = conProblemas(nuevo).map((f) => casoDesdeFila(f, terminologia, nuevo.archivo.nombre));
    filasPatron = patronMasFrecuente(conProblemas(nuevo)) ?? [];
    colaReal = {
      real: true,
      totalPendientes: casos.length,
      resueltosPrevios: 0,
      filtros: { todos: casos.length, snomed: casos.filter((c) => c.categoria === "snomed").length, duplicados: casos.filter((c) => c.categoria === "duplicados").length },
      casos,
      patron: filasPatron.length ? { lote: nuevo.archivo.nombre, casos: filasPatron.length, error: filasPatron[0].crudo.especie } : null,
    };
    estados = Object.fromEntries(casos.map((c) => [c.id, { estado: "pendiente" } as EstadoCaso]));
    bundleIdReal = `urn:uuid:${crypto.randomUUID()}`;
    registrarEvento({ muestra: "Lote", accion: `Carga de planilla ${nuevo.archivo.nombre} (${nuevo.filas.length} filas, leída en el navegador)`, binding: "Bundle.entry", resultado: "Recibido" });
    return esperar(undefined, 300);
  },

  async descartarLote() {
    if (lote) registrarEvento({ muestra: "Lote", accion: `Planilla ${lote.archivo.nombre} retirada de la memoria`, binding: "—", resultado: "Descartado" });
    lote = null;
    colaReal = null;
    filasPatron = [];
    estados = estadosDemo;
    return esperar(undefined, 100);
  },

  async obtenerFilasCuradas() {
    if (!lote) return esperar(null, 50);
    const salida = lote.filas
      .map((f) => {
        if (!f.problemas.length) return { fila: f, decision: { ...f.propuesta, nota: "" } };
        const e = estados[idCaso(f)];
        return e?.estado === "resuelto" && e.decision ? { fila: f, decision: e.decision } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return esperar(salida, 50);
  },

  obtenerCola: () => esperar(colaReal ?? cola),
  obtenerEstadosCasos: () => esperar(estados, 50),
  obtenerTerminologia: () => esperar(terminologia, 50),

  async guardarCaso(id, decision: DecisionCaso) {
    estados[id] = { estado: "resuelto", decision };
    const especie = decision.especie === "negativo" ? { display: terminologia.negativo.texto } : terminologia.especies.find((e) => e.codigo === decision.especie);
    registrarEvento({
      muestra: id,
      accion: decision.relacion === "repetido" ? "Clasificado como escaneo repetido" : `Normalizado a ${especie?.display ?? "especie"}`,
      binding: `SNOMED: ${decision.especie === "negativo" ? terminologia.negativo.codigo : decision.especie}`,
      resultado: "Normalizado",
    });
    return esperar(undefined, 400);
  },

  async descartarCaso(id) {
    estados[id] = { estado: "descartado" };
    registrarEvento({ muestra: id, accion: "Lámina descartada como artefacto", binding: "Specimen.status", resultado: "Descartado" });
    return esperar(undefined);
  },

  async aplicarPatron() {
    const activa = colaReal ?? cola;
    if (!activa.patron) return esperar(0);
    if (!colaReal) {
      registrarEvento({ muestra: `${activa.patron.lote}-*`, accion: `Regla aplicada a ${activa.patron.casos} casos similares`, binding: "SNOMED: 4716008", resultado: "Normalizado" });
      return esperar(activa.patron.casos, 600);
    }
    let n = 0;
    for (const f of filasPatron) {
      const id = idCaso(f);
      if (estados[id]?.estado === "pendiente" && decisionCompleta(f)) {
        estados[id] = { estado: "resuelto", decision: { ...f.propuesta, nota: "" } };
        n++;
      }
    }
    registrarEvento({
      muestra: `${n} láminas`,
      accion: `Corrección en bloque de "${activa.patron.error}"`,
      binding: `SNOMED: ${filasPatron[0]?.propuesta.especie ?? ""}`,
      resultado: "Normalizado",
    });
    return esperar(n, 400);
  },

  obtenerMapeos: () => esperar(mapeos),

  async guardarRegla(regla: ReglaMapeo) {
    const i = mapeos.reglas.findIndex((r) => r.id === regla.id);
    if (i >= 0) mapeos.reglas[i] = regla;
    else mapeos.reglas.push(regla);
    registrarEvento({
      muestra: "Diccionario",
      accion: `Regla de mapeo para "${regla.terminos.join('", "')}"`,
      binding: `${regla.ontologia === "LOINC" ? "LOINC" : "SNOMED"}: ${regla.codigo}`,
      resultado: "Mapeado",
    });
    return esperar(regla);
  },

  async eliminarRegla(id) {
    mapeos.reglas = mapeos.reglas.filter((r) => r.id !== id);
    return esperar(undefined);
  },

  obtenerExportacion() {
    if (!lote) return esperar(exportacion);
    const l = lote;
    const resueltos = Object.values(estados).filter((e) => e.estado === "resuelto");
    const conformes = l.filas.filter((f) => !f.problemas.length).length;
    const pendientes = Object.values(estados).filter((e) => e.estado === "pendiente").length;
    const curadas = [
      ...l.filas.filter((f) => !f.problemas.length).map((f) => f.propuesta.especie),
      ...resueltos.map((e) => e.decision!.especie),
    ];
    const especies = [...new Set(curadas.filter((c) => c && c !== "negativo"))];
    const nombres = especies.slice(0, 3).map((c) => terminologia.especies.find((e) => e.codigo === c)?.nombreLocal ?? c);
    const instituciones = new Set(l.filas.map((f) => f.institucion).filter(Boolean)).size;
    const cuenta = (clave: string) => l.filas.filter((f) => siNo(f.digitalizacion[clave])).length;
    const eventosSesion = exportacion.auditoria.filter((e) => e.fecha >= inicioSesion);
    return esperar({
      ...exportacion,
      nombreLote: `Lote ${l.archivo.nombre}`,
      auditoria: eventosSesion,
      eventosRegistrados: eventosSesion.length,
      descargas: exportacion.descargas.map((d) => ({ ...d, tamano: d.id === "parquet" ? "no disponible" : "se genera al descargar" })),
      bundleId: bundleIdReal,
      certificacion: { verificados: conformes + resueltos.length, total: l.filas.length },
      resumen: [
        { icono: "account_tree", texto: "Escaneos repetidos jerarquizados", valor: String(resueltos.filter((e) => e.decision?.relacion === "repetido").length), unidad: "enlazados" },
        { icono: "content_cut", texto: "Nuevos cortes confirmados", valor: String(resueltos.filter((e) => e.decision?.relacion === "nuevo").length), unidad: "confirmados" },
        { icono: "spellcheck", texto: "Casos pendientes de revisión", valor: String(pendientes), unidad: pendientes === 1 ? "pendiente" : "pendientes" },
      ],
      kpis: [
        { titulo: "Instituciones", icono: "group", valor: instituciones.toLocaleString("en-US"), descripcion: "Instituciones que aportan láminas", pie: "Sin datos de pacientes (verificado al cargar)", pieIcono: "check" },
        { titulo: "Láminas en la planilla", icono: "biotech", valor: l.filas.length.toLocaleString("en-US"), descripcion: `${cuenta("digitalizada")} digitalizadas · ${cuenta("aprobada")} aprobadas · ${cuenta("ingresada")} ingresadas`, pie: "Leída solo en este navegador", pieIcono: "link" },
        { titulo: "Taxonomía parasitaria", icono: "bug_report", valor: String(especies.length), descripcion: "Especies codificadas (SNOMED CT)", pie: nombres.join(", ") || "—", pieIcono: null, pieMono: true },
        { titulo: "Codificación LOINC", icono: "terminal", valor: "100%", descripcion: "Exámenes según tipo de muestra", pie: "10704-5 · 10701-1 · 17784-0", pieIcono: "fact_check" },
      ],
    });
  },

  async transmitirBundle(url) {
    // Simulación: nunca se envían datos. Una URL con "error" simula una falla del servidor.
    if (url.includes("error")) {
      return esperar({ ok: false, recursos: 0, mensaje: "El servidor respondió 503 (simulado). Reintente más tarde." }, 1500);
    }
    const total = lote
      ? lote.filas.filter((f) => !f.problemas.length).length + Object.values(estados).filter((e) => e.estado === "resuelto").length
      : exportacion.certificacion.total;
    registrarEvento({ muestra: "Bundle", accion: `Transmisión simulada a ${url}`, binding: "Bundle.type=transaction", resultado: "Enviado" });
    return esperar({ ok: true, recursos: total, mensaje: "Bundle aceptado (simulado)" }, 1500);
  },
};
