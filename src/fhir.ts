import type { Parasite } from "./excel.js";

export interface Config {
  baseUrl: string; // sin "/" final
  version: string;
  publisher: string;
  ncbiSystem: string;
  loincSystem: string;
  date: string;
  loincDisplays: Record<string, string>;
  bundleType: "collection" | "transaction";
}

export const defaultConfig: Config = {
  baseUrl: "https://cittofhir.example.org/fhir",
  version: "0.1.0",
  publisher: "cittofhir",
  ncbiSystem: "http://purl.bioontology.org/ontology/NCBITAXON",
  loincSystem: "http://loinc.org",
  date: new Date().toISOString().slice(0, 10),
  loincDisplays: {},
  bundleType: "collection",
};

export type Resource = { resourceType: string; id: string; [k: string]: any };
export interface Result {
  resources: Resource[];
  warnings: string[];
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const meta = (c: Config, id: string, type: string, title: string, description: string) => ({
  id,
  url: `${c.baseUrl}/${type}/${id}`,
  version: c.version,
  name: id.replace(/(^|-)([a-z0-9])/g, (_, __, ch) => ch.toUpperCase()),
  title,
  status: "draft",
  experimental: false,
  date: c.date,
  publisher: c.publisher,
  description,
});

export function buildAll(rows: Parasite[], c: Config): Result {
  const warnings: string[] = [];
  const csUrl = `${c.baseUrl}/CodeSystem/parasitos`;
  const disUrl = `${c.baseUrl}/CodeSystem/enfermedades-parasitarias`;
  const resources: Resource[] = [];

  // ---- 6. CodeSystem de enfermedades (texto libre, sin normalización clínica)
  const diseaseCode = new Map<string, string>();
  for (const r of rows) {
    if (r.disease && !diseaseCode.has(r.disease))
      diseaseCode.set(r.disease, `dis-${String(diseaseCode.size + 1).padStart(3, "0")}`);
  }
  const diseaseCS: Resource = {
    resourceType: "CodeSystem",
    ...meta(c, "enfermedades-parasitarias", "CodeSystem", "Enfermedades o asociaciones clínicas de parásitos",
      "Textos de la columna 'Enfermedad o asociación clínica' del repositorio, un concepto por texto distinto. No está normalizado clínicamente ni mapeado a SNOMED CT/CIE."),
    caseSensitive: true,
    content: "complete",
    count: diseaseCode.size,
    concept: [...diseaseCode].map(([display, code]) => ({ code, display })),
  };

  // ---- Jerarquía: especie -> género (fila genus) -> familia (fila family)
  const genusRow = new Map<string, Parasite>();
  const familyRow = new Map<string, Parasite>();
  for (const r of rows) {
    if (r.rank === "genus" && r.genus) genusRow.set(r.genus.toLowerCase(), r);
    if (r.rank === "family" && r.family) familyRow.set(r.family.toLowerCase(), r);
  }
  const parentOf = (r: Parasite): string | undefined => {
    if (r.rank === "family" || r.rank === "phylum") return undefined;
    if (r.rank !== "genus" && r.genus) {
      const g = genusRow.get(r.genus.toLowerCase());
      if (g && g !== r) return g.code;
    }
    if (r.family) {
      const f = familyRow.get(r.family.toLowerCase());
      if (f && f !== r) return f.code;
    }
    return undefined;
  };

  // ---- 1. CodeSystem principal
  const props: [string, string, string][] = [
    ["parent", "code", "Concepto padre (is-a)"],
    ["clasificacion", "string", "Clasificación general"],
    ["rank", "string", "Rango taxonómico"],
    ["domain", "string", "Dominio taxonómico"],
    ["kingdom", "string", "Reino"],
    ["phylum", "string", "Filo"],
    ["class", "string", "Clase"],
    ["order", "string", "Orden"],
    ["family", "string", "Familia"],
    ["genus", "string", "Género"],
    ["ncbi-taxid", "Coding", "Identificador NCBI Taxonomy"],
    ["loinc-recomendado", "Coding", "Código LOINC recomendado para su detección"],
    ["habitat", "string", "Hábitat humano específico"],
    ["organ", "string", "Órgano humano afectado"],
    ["disease", "Coding", "Enfermedad o asociación clínica"],
    ["life-stage", "string", "Estadio visible en imagen"],
    ["host", "string", "Hospedero"],
  ];
  const concept = rows.map((r) => {
    const p: any[] = [];
    const add = (code: string, type: string, v: any) => v !== undefined && v !== "" && p.push({ code, [`value${type}`]: v });
    add("parent", "Code", parentOf(r));
    add("clasificacion", "String", r.clasificacion);
    add("rank", "String", r.rank);
    add("domain", "String", r.domain);
    add("kingdom", "String", r.kingdom);
    add("phylum", "String", r.phylum);
    add("class", "String", r.class);
    add("order", "String", r.order);
    add("family", "String", r.family);
    add("genus", "String", r.genus);
    if (r.ncbi) add("ncbi-taxid", "Coding", { system: c.ncbiSystem, code: r.ncbi });
    r.loinc.forEach((l) => add("loinc-recomendado", "Coding", { system: c.loincSystem, code: l }));
    add("habitat", "String", r.habitat);
    r.organs.forEach((o) => add("organ", "String", o));
    if (r.disease) add("disease", "Coding", { system: disUrl, code: diseaseCode.get(r.disease), display: r.disease });
    r.lifeStages.forEach((s) => add("life-stage", "String", s));
    add("host", "String", r.host);
    const designation = r.synonyms.map((s) => ({
      language: "la",
      use: { system: "http://snomed.info/sct", code: "900000000000013009", display: "Synonym" },
      value: s,
    }));
    return { code: r.code, display: r.name, ...(designation.length ? { designation } : {}), property: p };
  });
  const mainCS: Resource = {
    resourceType: "CodeSystem",
    ...meta(c, "parasitos", "CodeSystem", "Catálogo de parásitos de importancia clínica",
      "Catálogo taxonómico de parásitos con su clasificación, códigos NCBI y LOINC recomendados, hábitat, órgano afectado y enfermedad asociada. Generado desde Repositorio.xlsx."),
    caseSensitive: true,
    hierarchyMeaning: "is-a",
    content: "complete",
    count: rows.length,
    property: props.map(([code, type, description]) => ({ code, description, type })),
    concept,
  };

  // ---- 2. ValueSets
  const vs = (id: string, title: string, desc: string, list: Parasite[]): Resource => ({
    resourceType: "ValueSet",
    ...meta(c, id, "ValueSet", title, desc),
    compose: { include: [{ system: csUrl, concept: list.map((r) => ({ code: r.code, display: r.name })) }] },
  });
  const valueSets: Resource[] = [vs("parasitos-todos", "Todos los parásitos", "Todos los conceptos del catálogo de parásitos.", rows)];
  for (const cl of [...new Set(rows.map((r) => r.clasificacion).filter(Boolean))])
    valueSets.push(vs(`parasitos-${slug(cl)}`, `Parásitos: ${cl}`, `Parásitos con clasificación "${cl}".`, rows.filter((r) => r.clasificacion === cl)));

  // ---- 3. ConceptMap -> NCBI
  const ncbiRows = rows.filter((r) => r.ncbi);
  rows.filter((r) => !r.ncbi).forEach((r) => warnings.push(`Sin NCBI_TaxID: ${r.code} (${r.name}), no incluido en el ConceptMap NCBI`));
  const byNcbi = new Map<string, string[]>();
  ncbiRows.forEach((r) => byNcbi.set(r.ncbi!, [...(byNcbi.get(r.ncbi!) ?? []), r.code]));
  byNcbi.forEach((codes, id) => codes.length > 1 && warnings.push(`NCBI_TaxID ${id} repetido en: ${codes.join(", ")}`));
  const cmNcbi: Resource = {
    resourceType: "ConceptMap",
    ...meta(c, "parasitos-a-ncbi-taxonomy", "ConceptMap", "Parásitos a NCBI Taxonomy", "Mapea cada código del catálogo de parásitos a su NCBI Taxonomy ID."),
    sourceCanonical: `${c.baseUrl}/ValueSet/parasitos-todos`,
    group: [{
      source: csUrl,
      target: c.ncbiSystem,
      element: ncbiRows.map((r) => ({ code: r.code, display: r.name, target: [{ code: r.ncbi, equivalence: "equivalent" }] })),
    }],
  };

  // ---- 4. ConceptMap -> LOINC
  const loincRows = rows.filter((r) => r.loinc.length);
  rows.filter((r) => !r.loinc.length).forEach((r) => warnings.push(`Sin LOINC recomendado: ${r.code} (${r.name})`));
  const cmLoinc: Resource = {
    resourceType: "ConceptMap",
    ...meta(c, "parasitos-a-loinc", "ConceptMap", "Parásitos a pruebas LOINC recomendadas", "Relaciona cada parásito con los códigos LOINC recomendados para su detección."),
    sourceCanonical: `${c.baseUrl}/ValueSet/parasitos-todos`,
    group: [{
      source: csUrl,
      target: c.loincSystem,
      element: loincRows.map((r) => ({
        code: r.code,
        display: r.name,
        target: r.loinc.map((l) => ({ code: l, ...(c.loincDisplays[l] ? { display: c.loincDisplays[l] } : {}), equivalence: "relatedto" })),
      })),
    }],
  };

  // ---- 5. ObservationDefinition (+ ValueSet de organismos por LOINC)
  const byLoinc = new Map<string, Parasite[]>();
  loincRows.forEach((r) => r.loinc.forEach((l) => byLoinc.set(l, [...(byLoinc.get(l) ?? []), r])));
  const obsDefs: Resource[] = [];
  const loincVS: Resource[] = [];
  for (const [l, list] of [...byLoinc].sort()) {
    const vsId = `parasitos-loinc-${l}`;
    loincVS.push(vs(vsId, `Parásitos con LOINC ${l}`, `Parásitos para los que se recomienda el código LOINC ${l}.`, list));
    obsDefs.push({
      resourceType: "ObservationDefinition",
      id: `loinc-${l}`,
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
      code: { coding: [{ system: c.loincSystem, code: l, ...(c.loincDisplays[l] ? { display: c.loincDisplays[l] } : {}) }] },
      extension: [{ url: `${c.baseUrl}/StructureDefinition/observationdefinition-organisms`, valueCanonical: `${c.baseUrl}/ValueSet/${vsId}` }],
    });
  }
  if (!Object.keys(c.loincDisplays).length)
    warnings.push("Los LOINC no llevan 'display' (el Excel solo trae códigos). Puedes completarlos en data/loinc-displays.json");

  resources.push(mainCS, diseaseCS, ...valueSets, ...loincVS, cmNcbi, cmLoinc, ...obsDefs);

  // ---- 7. Bundle
  const bundle: Resource = {
    resourceType: "Bundle",
    id: "cittofhir-parasitos",
    type: c.bundleType,
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({
      fullUrl: r.url ?? `${c.baseUrl}/${r.resourceType}/${r.id}`,
      resource: r,
      ...(c.bundleType === "transaction" ? { request: { method: "PUT", url: `${r.resourceType}/${r.id}` } } : {}),
    })),
  };
  resources.push(bundle);
  return { resources, warnings };
}
