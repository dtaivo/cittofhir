import fs from "node:fs";
import path from "node:path";
import { readParasites } from "./excel.js";
import { buildAll, defaultConfig, type Config } from "./fhir.js";
import { validate } from "./validate.js";

const root = path.resolve(import.meta.dirname, "..");
export const DEFAULT_XLSX = process.env.XLSX_PATH ?? path.join(root, "data", "Repositorio.xlsx");
export const OUT_DIR = path.join(root, "out");

function loadLoincDisplays(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "data", "loinc-displays.json"), "utf8"));
  } catch {
    return {};
  }
}

export async function generate(input: Buffer | string, overrides: Partial<Config> = {}) {
  const config: Config = { ...defaultConfig, loincDisplays: loadLoincDisplays(), ...overrides };
  config.baseUrl = config.baseUrl.replace(/\/+$/, "");
  const rows = await readParasites(input);
  const { resources, warnings } = buildAll(rows, config);
  const issues = validate(resources);
  const files = resources.map((r) => ({
    filename: `${r.resourceType}-${r.id}.json`,
    resourceType: r.resourceType,
    id: r.id,
    json: r,
  }));
  return { rows: rows.length, files, warnings, issues };
}

export function writeFiles(files: { filename: string; json: unknown }[]) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(OUT_DIR, f.filename), JSON.stringify(f.json, null, 2));
  return OUT_DIR;
}
