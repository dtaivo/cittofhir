/** Construye recursos FHIR R4 a partir de las decisiones del curador. */
import type { Caso, DecisionCaso, FilaLote, Terminologia } from "../api";
import { aNumero, codigoEstadio, siNo } from "./planilla";

const SNOMED = "http://snomed.info/sct";
const LOINC = "http://loinc.org";

/**
 * Devuelve el concepto SNOMED más específico disponible:
 * especie + estadio (ej. "Giardia lamblia cyst") o, si no existe, solo la especie.
 */
export function conceptoOrganismo(t: Terminologia, especie: string, estadio: string) {
  if (especie === "negativo") return { code: t.negativo.codigo, display: t.negativo.display };
  const especifico = t.especificos.find((e) => e.especie === especie && e.estadio === estadio);
  if (especifico) return { code: especifico.codigo, display: especifico.display };
  const esp = t.especies.find((e) => e.codigo === especie);
  return esp ? { code: esp.codigo, display: esp.display } : null;
}

/** Datos de la planilla que se agregan al recurso cuando existen. */
export interface ExtrasPlanilla {
  idLamina: string;
  institucion: string;
  /** Referencia al recurso Media de la lámina dentro del Bundle. */
  media?: string;
}

export function observacionDesdeCaso(caso: Caso, d: DecisionCaso, t: Terminologia, extras?: ExtrasPlanilla) {
  const examen = t.examenes.find((e) => e.tipoMuestra === caso.tipoMuestra) ?? t.examenes.find((e) => e.tipoMuestra === "otro") ?? t.examenes[0];
  const organismo = conceptoOrganismo(t, d.especie, d.estadio);
  const estadio = t.estadios.find((e) => e.codigo === d.estadio);
  const estadioCodigo = codigoEstadio(t, d.estadio, d.especie);
  const tincion = t.tinciones.find((e) => e.codigo === d.tincion);

  const recurso: Record<string, unknown> = {
    resourceType: "Observation",
    id: `obs-${caso.id.toLowerCase()}-normalized`,
    status: "preliminary",
    code: { coding: [{ system: LOINC, code: examen.codigo, display: examen.display }] },
    valueCodeableConcept: organismo
      ? { coding: [{ system: SNOMED, ...organismo }], ...(d.especie === "negativo" ? { text: t.negativo.texto } : {}) }
      : null,
  };
  if (extras) {
    if (extras.idLamina) recurso.specimen = { identifier: { system: "urn:parafhir:lamina", value: extras.idLamina } };
    if (extras.institucion) recurso.performer = [{ display: extras.institucion }];
    if (extras.media) recurso.derivedFrom = [{ reference: extras.media, display: "Imagen digitalizada (WSI)" }];
  }
  if (estadio) {
    recurso.component = [
      {
        code: { text: "life-stage" },
        valueCodeableConcept: estadioCodigo
          ? { coding: [{ system: SNOMED, code: estadioCodigo.codigo, display: estadioCodigo.display }], text: estadio.display }
          : { text: estadio.display },
      },
    ];
  }
  if (tincion?.snomed) {
    recurso.method = { coding: [{ system: SNOMED, code: tincion.snomed, display: tincion.snomedDisplay }], text: tincion.display };
  }
  if (d.relacion === "repetido" && caso.comparaCon) {
    const previo = (recurso.derivedFrom as unknown[] | undefined) ?? [];
    recurso.derivedFrom = [...previo, { identifier: { system: "urn:parafhir:lamina", value: caso.comparaCon }, display: "Reescaneo de la misma lámina" }];
  }
  if (d.nota.trim()) recurso.note = [{ text: d.nota.trim() }];
  return recurso;
}

/**
 * Recurso Media con los metadatos de digitalización de la lámina (WSI).
 * No incluye nombres de personas (evaluadores ni encargado): minimización de datos.
 */
export function mediaDesdeFila(f: FilaLote) {
  const d = f.digitalizacion;
  const entero = (v: string) => {
    const n = aNumero(v);
    return n !== null && Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const gb = aNumero(d.tamano_gb);
  const notas = [
    d.aumento && `Aumento: ${d.aumento}`,
    d.resolucion && `Resolución: ${d.resolucion}`,
    d.espaciado && `Espaciado Z: ${d.espaciado}`,
    d.rango_enfoque && `Rango de enfoque: ${d.rango_enfoque}`,
    d.tiempo && `Tiempo de digitalización: ${d.tiempo}`,
    d.tamano_disco_gb && `Tamaño en disco: ${d.tamano_disco_gb} GB`,
    d.formato && `Formato: ${d.formato}`,
  ].filter(Boolean) as string[];
  return {
    resourceType: "Media",
    status: siNo(d.digitalizada) === false ? "preparation" : "completed",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/media-type", code: "image", display: "Image" }] },
    identifier: f.idLamina ? [{ system: "urn:parafhir:lamina", value: f.idLamina }] : undefined,
    createdDateTime: f.fecha ?? undefined,
    device: d.equipo ? { display: d.equipo } : undefined,
    width: entero(d.width),
    height: entero(d.height),
    frames: entero(d.n_z),
    content: {
      title: f.nombreWsi || undefined,
      url: d.link_ndp || undefined,
      size: gb !== null ? Math.round(gb * 1e9) : undefined,
    },
    note: notas.length ? notas.map((text) => ({ text })) : undefined,
  };
}

/** Entrada del Bundle: con fullUrl si otro recurso necesita referenciarla. */
export type EntradaBundle = unknown | { fullUrl: string; resource: unknown };

export function bundleDeEjemplo(id: string, total: number, entradas: EntradaBundle[], etiqueta = "PROTOTIPO - datos sintéticos") {
  const conUrl = (e: EntradaBundle): e is { fullUrl: string; resource: unknown } =>
    typeof e === "object" && e !== null && "fullUrl" in e && "resource" in e;
  return {
    resourceType: "Bundle",
    id,
    type: "transaction",
    total,
    meta: { tag: [{ display: etiqueta }] },
    entry: entradas.map((e) => {
      const resource = conUrl(e) ? e.resource : e;
      return {
        ...(conUrl(e) ? { fullUrl: e.fullUrl } : {}),
        resource,
        request: { method: "POST", url: (resource as { resourceType: string }).resourceType },
      };
    }),
  };
}
