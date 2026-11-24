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
import type {
  ColaLimpieza,
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
const especiesCatalogo = catalogoJson.especies
  .filter((e) => e.snomed)
  .map((e) => ({
    codigo: e.snomed!.codigo,
    display: e.snomed!.display,
    nombreLocal: e.nombre,
    grupo: e.clasificacion,
    via: (e.snomed as { via?: string }).via,
    sinonimos: e.sinonimos,
  }));
const codigosCatalogo = new Set(especiesCatalogo.map((e) => e.codigo));
const terminologia: Terminologia = {
  ...terminologiaBase,
  especies: [
    ...especiesCatalogo,
    ...terminologiaBase.especies.filter((e) => !codigosCatalogo.has(e.codigo)).map((e) => ({ ...e, grupo: "Otros" })),
  ],
};
const mapeos = structuredClone(mapeosJson) as unknown as DatosMapeos;
const exportacion = structuredClone(exportacionJson) as unknown as DatosExportacion;
const estados: Record<string, EstadoCaso> = Object.fromEntries(
  cola.casos.map((c) => [c.id, { estado: "pendiente" } as EstadoCaso]),
);

function registrarEvento(evento: Omit<EventoAuditoria, "fecha" | "operador">) {
  exportacion.auditoria.unshift({
    fecha: new Date().toISOString(),
    operador: carga.usuario.nombre,
    ...evento,
  });
  exportacion.eventosRegistrados += 1;
}

export const fuenteLocal: FuenteDatos = {
  obtenerCarga: () => esperar(carga),

  async registrarArchivo(nombre) {
    registrarEvento({ muestra: "Lote", accion: `Carga de archivo ${nombre}`, binding: "Bundle.entry", resultado: "Recibido" });
    return esperar(undefined, 900);
  },

  obtenerCola: () => esperar(cola),
  obtenerEstadosCasos: () => esperar(estados, 50),
  obtenerTerminologia: () => esperar(terminologia, 50),

  async guardarCaso(id, decision: DecisionCaso) {
    estados[id] = { estado: "resuelto", decision };
    const especie = terminologia.especies.find((e) => e.codigo === decision.especie);
    registrarEvento({
      muestra: id,
      accion: decision.relacion === "repetido" ? "Clasificado como escaneo repetido" : `Normalizado a ${especie?.display ?? "especie"}`,
      binding: `SNOMED: ${decision.especie}`,
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
    registrarEvento({
      muestra: `${cola.patron.lote}-*`,
      accion: `Regla aplicada a ${cola.patron.casos} casos similares`,
      binding: "SNOMED: 4716008",
      resultado: "Normalizado",
    });
    return esperar(cola.patron.casos, 600);
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

  obtenerExportacion: () => esperar(exportacion),

  async transmitirBundle(url) {
    // Simulación: nunca se envían datos. Una URL con "error" simula una falla del servidor.
    if (url.includes("error")) {
      return esperar({ ok: false, recursos: 0, mensaje: "El servidor respondió 503 (simulado). Reintente más tarde." }, 1500);
    }
    registrarEvento({ muestra: "Bundle", accion: `Transmisión simulada a ${url}`, binding: "Bundle.type=transaction", resultado: "Enviado" });
    return esperar({ ok: true, recursos: exportacion.certificacion.total, mensaje: "Bundle aceptado (simulado)" }, 1500);
  },
};
