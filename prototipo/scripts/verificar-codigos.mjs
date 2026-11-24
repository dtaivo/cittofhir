/**
 * Verifica que todos los códigos SNOMED CT y LOINC del prototipo existan
 * y que su nombre (display) coincida con el oficial.
 *
 * Uso:  npm run verificar-codigos
 *
 * Consulta el servidor público de terminología tx.fhir.org.
 * Solo envía CÓDIGOS (nunca datos de pacientes).
 * Termina con error (código 1) si algún código no existe o su nombre no coincide.
 */
import { readFileSync } from "node:fs";

const SERVIDOR = process.env.SERVIDOR_TERMINOLOGIA ?? "https://tx.fhir.org/r4";
const SNOMED = "http://snomed.info/sct";
const LOINC = "http://loinc.org";

const leer = (ruta) => JSON.parse(readFileSync(new URL(`../src/data/${ruta}`, import.meta.url), "utf8"));
const t = leer("terminologia.json");
const m = leer("mapeos.json");

/** @type {{sistema:string, codigo:string, display:string, origen:string}[]} */
const codigos = [];
const agregar = (sistema, codigo, display, origen) => codigo && codigos.push({ sistema, codigo, display, origen });

t.especies.forEach((e) => agregar(SNOMED, e.codigo, e.display, `especie ${e.nombreLocal}`));
t.estadios.forEach((e) => agregar(SNOMED, e.snomed, e.snomedDisplay, `estadio ${e.codigo}`));
t.especificos.forEach((e) => agregar(SNOMED, e.codigo, e.display, `especie+estadio ${e.especie}/${e.estadio}`));
t.tinciones.forEach((e) => agregar(SNOMED, e.snomed, e.snomedDisplay, `tinción ${e.codigo}`));
t.examenes.forEach((e) => agregar(LOINC, e.codigo, e.display, `examen ${e.tipoMuestra}`));
agregar(SNOMED, t.negativo.codigo, t.negativo.display, "resultado negativo");
m.reglas
  .filter((r) => r.codigo && r.ontologia)
  .forEach((r) => agregar(r.ontologia === "LOINC" ? LOINC : SNOMED, r.codigo, r.display, `regla ${r.id}`));
m.opcionesPendiente.forEach((o) => agregar(o.ontologia === "LOINC" ? LOINC : SNOMED, o.codigo, o.display, "opción pendiente"));

async function consultar(sistema, codigo) {
  const url = `${SERVIDOR}/CodeSystem/$lookup?system=${encodeURIComponent(sistema)}&code=${encodeURIComponent(codigo)}`;
  const r = await fetch(url, { headers: { Accept: "application/fhir+json" } });
  const d = await r.json();
  if (d.resourceType !== "Parameters") return null;
  return d.parameter.find((p) => p.name === "display")?.valueString ?? "";
}

let fallas = 0;
const cache = new Map();
for (const c of codigos) {
  const clave = `${c.sistema}|${c.codigo}`;
  if (!cache.has(clave)) cache.set(clave, await consultar(c.sistema, c.codigo));
  const oficial = cache.get(clave);
  const sistema = c.sistema === LOINC ? "LOINC " : "SNOMED";
  if (oficial === null) {
    fallas++;
    console.log(`✗ ${sistema} ${c.codigo.padEnd(10)} NO EXISTE              (${c.origen})`);
  } else if (oficial.toLowerCase() !== String(c.display).toLowerCase()) {
    fallas++;
    console.log(`✗ ${sistema} ${c.codigo.padEnd(10)} nombre distinto: "${c.display}" ≠ oficial "${oficial}"  (${c.origen})`);
  } else {
    console.log(`✓ ${sistema} ${c.codigo.padEnd(10)} ${oficial}`);
  }
}
console.log(`\n${codigos.length - fallas} de ${codigos.length} códigos correctos.`);
process.exit(fallas ? 1 : 0);
