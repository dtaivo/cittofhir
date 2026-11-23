/** Construye recursos FHIR R4 de ejemplo a partir de las decisiones del curador. */
import type { Caso, DecisionCaso, OpcionTerminologia, Terminologia } from "../api";

const buscar = (lista: OpcionTerminologia[], codigo: string) => lista.find((o) => o.codigo === codigo);

export function observacionDesdeCaso(caso: Caso, d: DecisionCaso, t: Terminologia) {
  const especie = buscar(t.especies, d.especie);
  const estadio = buscar(t.estadios, d.estadio);
  const recurso: Record<string, unknown> = {
    resourceType: "Observation",
    id: `obs-${caso.id.toLowerCase()}-normalized`,
    status: "preliminary",
    code: {
      coding: [{ system: "http://loinc.org", code: "10701-1", display: `${especie?.display ?? "Parasite"} [Presence] in Stool by Microscopy` }],
    },
    valueCodeableConcept: especie
      ? { coding: [{ system: "http://snomed.info/sct", code: especie.codigo, display: especie.display }] }
      : null,
  };
  if (estadio) recurso.component = [{ code: { text: "life-stage" }, valueString: estadio.display }];
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
