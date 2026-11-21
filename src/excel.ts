import ExcelJS from "exceljs";

export interface Parasite {
  code: string;
  clasificacion: string;
  domain?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  name: string;
  rank?: string;
  loinc: string[];
  ncbi?: string;
  synonyms: string[];
  habitat?: string;
  organs: string[];
  disease?: string;
  lifeStages: string[];
  host?: string;
}

const HEADERS: Record<string, keyof Parasite | "loincRaw" | "synRaw" | "organRaw" | "stageRaw"> = {
  Tax: "code",
  Clasificacion: "clasificacion",
  Taxonomic_Domain: "domain",
  Reino: "kingdom",
  Filo: "phylum",
  Clase: "class",
  Orden: "order",
  Familia: "family",
  Genero: "genus",
  Especie: "name",
  Taxonomic_Rank: "rank",
  LOINC_codes_recomendados: "loincRaw",
  NCBI_TaxID: "ncbi",
  Synonyms: "synRaw",
  "Habitat humano específico": "habitat",
  "Tag organo humano afectado": "organRaw",
  "Enfermedad o asociación clínica": "disease",
  Image_Life_Stages: "stageRaw",
  Host: "host",
};

const split = (s: string | undefined, sep: RegExp) =>
  (s ?? "").split(sep).map((x) => x.trim()).filter(Boolean);

export async function readParasites(data: Buffer | string): Promise<Parasite[]> {
  const wb = new ExcelJS.Workbook();
  if (typeof data === "string") await wb.xlsx.readFile(data);
  else await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("El archivo no tiene hojas");

  const colToField = new Map<number, string>();
  ws.getRow(1).eachCell((cell, col) => {
    const f = HEADERS[cell.text.trim()];
    if (f) colToField.set(col, f);
  });
  const found = new Set(colToField.values());
  for (const required of ["code", "name", "clasificacion"]) {
    if (!found.has(required)) throw new Error(`Falta la columna requerida para "${required}"`);
  }

  const out: Parasite[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const raw: Record<string, string> = {};
    for (const [col, field] of colToField) {
      const t = row.getCell(col).text.trim();
      if (t) raw[field] = t;
    }
    if (!raw.code) return; // fila vacía
    out.push({
      code: raw.code,
      clasificacion: raw.clasificacion ?? "",
      domain: raw.domain,
      kingdom: raw.kingdom,
      phylum: raw.phylum,
      class: raw.class,
      order: raw.order,
      family: raw.family,
      genus: raw.genus,
      name: raw.name ?? raw.code,
      rank: raw.rank,
      loinc: split(raw.loincRaw, /[,;]/),
      ncbi: raw.ncbi,
      synonyms: split(raw.synRaw, /;/),
      habitat: raw.habitat,
      organs: split(raw.organRaw, /,/),
      disease: raw.disease,
      lifeStages: split(raw.stageRaw, /,/),
      host: raw.host,
    });
  });
  return out;
}
