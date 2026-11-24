/** Construye recursos FHIR R4 a partir de las decisiones del curador. */
import type { Caso, DecisionCaso, Terminologia } from "../api";

const SNOMED = "http://snomed.info/sct";
const LOINC = "http://loinc.org";

/**
 * Devuelve el concepto SNOMED más específico disponible:
 * especie + estadio (ej. "Giardia lamblia cyst") o, si no existe, solo la especie.
 */
export function conceptoOrganismo(t: Terminologia, especie: string, estadio: string) {
  const especifico = t.especificos.find((e) => e.especie === especie && e.estadio === estadio);
  if (especifico) return { code: especifico.codigo, display: especifico.display };
  const esp = t.especies.find((e) => e.codigo === especie);
  return esp ? { code: esp.codigo, display: esp.display } : null;
}

export function observacionDesdeCaso(caso: Caso, d: DecisionCaso, t: Terminologia) {
  const examen = t.examenes.find((e) => e.tipoMuestra === caso.tipoMuestra) ?? t.examenes[0];
  const organismo = conceptoOrganismo(t, d.especie, d.estadio);
  const estadio = t.estadios.find((e) => e.codigo === d.estadio);
  const tincion = t.tinciones.find((e) => e.codigo === d.tincion);

  const recurso: Record<string, unknown> = {
    resourceType: "Observation",
    id: `obs-${caso.id.toLowerCase()}-normalized`,
    status: "preliminary",
    code: { coding: [{ system: LOINC, code: examen.codigo, display: examen.display }] },
    valueCodeableConcept: organismo ? { coding: [{ system: SNOMED, ...organismo }] } : null,
  };
  if (estadio) {
    recurso.component = [
      {
        code: { text: "life-stage" },
        valueCodeableConcept: estadio.snomed
          ? { coding: [{ system: SNOMED, code: estadio.snomed, display: estadio.snomedDisplay }], text: estadio.display }
          : { text: estadio.display },
      },
    ];
  }
  if (tincion?.snomed) {
    recurso.method = { coding: [{ system: SNOMED, code: tincion.snomed, display: tincion.snomedDisplay }], text: tincion.display };
  }
  if (d.relacion === "repetido" && caso.comparaCon) {
    recurso.derivedFrom = [{ reference: `Media/${caso.comparaCon}-capture`, display: "Escaneo repetido del mismo campo óptico" }];
  }
  if (d.nota.trim()) recurso.note = [{ text: d.nota.trim() }];
  return recurso;
}

export function bundleDeEjemplo(id: string, total: number, entradas: unknown[]) {
  return {
    resourceType: "Bundle",
    id,
    type: "transaction",
    total,
    meta: { tag: [{ display: "PROTOTIPO - datos sintéticos" }] },
    entry: entradas.map((resource) => ({ resource, request: { method: "POST", url: (resource as { resourceType: string }).resourceType } })),
  };
}
