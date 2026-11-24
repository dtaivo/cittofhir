/**
 * Convierte el catálogo de parásitos de la tutora (data/Repositorio.xlsx)
 * en src/data/catalogo.json, agregando el código SNOMED CT real de cada especie.
 *
 * Uso:  npm run catalogo
 *
 * - Busca cada nombre (y sus sinónimos) en el servidor de terminología tx.fhir.org.
 *   Solo envía NOMBRES DE PARÁSITOS, nunca datos de pacientes.
 * - Solo acepta coincidencias EXACTAS de nombre: si no hay, la especie queda
 *   con "snomed": null y aparece en la lista "Por revisar" del resumen.
 * - También verifica que los códigos LOINC recomendados del catálogo existan.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SERVIDOR = process.env.SERVIDOR_TERMINOLOGIA ?? "https://tx.fhir.org/r4";
const ENTRADA = new URL("../../data/Repositorio.xlsx", import.meta.url);
const SALIDA = new URL("../src/data/catalogo.json", import.meta.url);
const ORGANISMOS = "http://snomed.info/sct?fhir_vs=isa/410607006";

const separar = (s, sep) => (s ?? "").split(sep).map((x) => x.trim()).filter(Boolean);
const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function buscarSnomed(nombre) {
  const url = new URL(`${SERVIDOR}/ValueSet/$expand`);
  url.searchParams.set("url", ORGANISMOS);
  url.searchParams.set("filter", nombre);
  url.searchParams.set("count", "20");
  const r = await fetch(url, { headers: { Accept: "application/fhir+json" } });
  const d = await r.json();
  const exacto = (d.expansion?.contains ?? []).find((c) => normal(c.display) === normal(nombre));
  return exacto ? { codigo: exacto.code, display: exacto.display } : null;
}

async function loincExiste(codigo) {
  const r = await fetch(`${SERVIDOR}/CodeSystem/$lookup?system=http://loinc.org&code=${codigo}`, {
    headers: { Accept: "application/fhir+json" },
  });
  const d = await r.json();
  return d.resourceType === "Parameters" ? d.parameter.find((p) => p.name === "display")?.valueString : null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(fileURLToPath(ENTRADA));
const ws = wb.worksheets[0];
const col = {};
ws.getRow(1).eachCell((c, i) => (col[c.text.trim()] = i));
const celda = (fila, nombre) => (col[nombre] ? fila.getCell(col[nombre]).text.trim() : "");

const filas = [];
ws.eachRow((fila, n) => {
  if (n === 1 || !celda(fila, "Tax")) return;
  filas.push({
    tax: celda(fila, "Tax"),
    nombre: celda(fila, "Especie"),
    clasificacion: celda(fila, "Clasificacion"),
    filo: celda(fila, "Filo"),
    clase: celda(fila, "Clase"),
    rango: celda(fila, "Taxonomic_Rank"),
    sinonimos: separar(celda(fila, "Synonyms"), /;/),
    loinc: separar(celda(fila, "LOINC_codes_recomendados"), /[,;]/),
    estadios: separar(celda(fila, "Image_Life_Stages"), /,/).map((e) => e.toLowerCase()),
    habitat: celda(fila, "Habitat humano específico"),
    enfermedad: celda(fila, "Enfermedad o asociación clínica"),
  });
});

/** Variantes de nombre a probar: tal cual, sin "spp.", con prefijo de rango ("Genus …") y sinónimos. */
function candidatos(f) {
  const sinTilde = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const base = sinTilde(f.nombre).replace(/\s+(spp?\.?)$/i, "").trim();
  const prefijo = { genus: "Genus", family: "Family", superfamily: "Superfamily", phylum: "Phylum" }[f.rango];
  const lista = [f.nombre, sinTilde(f.nombre), base];
  if (prefijo) lista.push(`${prefijo} ${base}`);
  if (/\sspp?\.?$/i.test(f.nombre)) lista.push(`Genus ${base}`);
  lista.push(...f.sinonimos);
  return [...new Set(lista)];
}

const porRevisar = [];
for (const [i, f] of filas.entries()) {
  let encontrado = null;
  for (const candidato of candidatos(f)) {
    encontrado = await buscarSnomed(candidato);
    if (encontrado) {
      if (candidato !== f.nombre) encontrado.via = candidato;
      break;
    }
  }
  f.snomed = encontrado;
  if (!encontrado) porRevisar.push(`${f.tax} ${f.nombre} (${f.rango})`);
  if ((i + 1) % 40 === 0 || i + 1 === filas.length) console.log(`${i + 1}/${filas.length} especies consultadas`);
}

const loincs = [...new Set(filas.flatMap((f) => f.loinc))].sort();
const loincInvalidos = [];
const loincNombres = {};
for (const c of loincs) {
  const nombre = await loincExiste(c);
  if (nombre) loincNombres[c] = nombre;
  else loincInvalidos.push(c);
}

writeFileSync(
  SALIDA,
  JSON.stringify(
    {
      _nota: "Generado por `npm run catalogo` desde data/Repositorio.xlsx. No editar a mano: corregir el Excel y volver a generar.",
      _generado: new Date().toISOString().slice(0, 10),
      loinc: loincNombres,
      loincInvalidos,
      especies: filas,
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n\nSNOMED encontrado: ${filas.length - porRevisar.length} de ${filas.length} especies.`);
console.log(`LOINC válidos: ${Object.keys(loincNombres).length} de ${loincs.length}.`);
if (loincInvalidos.length) console.log(`LOINC que NO existen: ${loincInvalidos.join(", ")}`);
if (porRevisar.length) console.log(`\nSin SNOMED exacto (revisar a mano):\n  - ${porRevisar.join("\n  - ")}`);
