import type { Resource } from "./fhir.js";

/** Chequeos estructurales básicos (no sustituyen al validador oficial de HL7). */
export function validate(resources: Resource[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const csCodes = new Map<string, Set<string>>();
  for (const r of resources) {
    const key = `${r.resourceType}/${r.id}`;
    if (seen.has(key)) issues.push(`Id duplicado: ${key}`);
    seen.add(key);
    if (!/^[A-Za-z0-9\-.]{1,64}$/.test(r.id)) issues.push(`Id inválido: ${key}`);
    if (r.resourceType === "CodeSystem") {
      const codes = new Set<string>();
      for (const k of r.concept) (codes.has(k.code) ? issues.push(`Código duplicado en ${key}: ${k.code}`) : codes.add(k.code));
      csCodes.set(r.url, codes);
      if (r.count !== r.concept.length) issues.push(`${key}: count no coincide`);
    }
  }
  for (const r of resources) {
    const key = `${r.resourceType}/${r.id}`;
    if (r.resourceType === "CodeSystem")
      for (const k of r.concept)
        for (const p of k.property ?? []) {
          if (p.code === "parent" && !csCodes.get(r.url)!.has(p.valueCode)) issues.push(`${key}: padre inexistente ${p.valueCode} en ${k.code}`);
          const sys = p.valueCoding?.system;
          if (sys && csCodes.has(sys) && !csCodes.get(sys)!.has(p.valueCoding.code)) issues.push(`${key}: Coding inexistente ${p.valueCoding.code}`);
        }
    if (r.resourceType === "ValueSet")
      for (const inc of r.compose.include)
        for (const k of inc.concept) if (!csCodes.get(inc.system)?.has(k.code)) issues.push(`${key}: código inexistente ${k.code}`);
    if (r.resourceType === "ConceptMap")
      for (const g of r.group)
        for (const e of g.element) if (!csCodes.get(g.source)?.has(e.code)) issues.push(`${key}: código origen inexistente ${e.code}`);
  }
  return issues;
}
