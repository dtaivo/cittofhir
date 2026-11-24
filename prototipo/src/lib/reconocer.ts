/**
 * Reconoce textos libres escritos en una planilla ("G. lamblia", "trofo", "Lugol")
 * y los traduce a los códigos de la app.
 *
 * Tipos de resultado:
 *  - "exacto":    coincide con el nombre del catálogo → se acepta sin revisión.
 *  - "sinonimo":  coincide con un sinónimo o abreviatura → se propone, pero se revisa.
 *  - "parecido":  se parece (posible error de tipeo) → se propone, pero se revisa.
 *  - "desconocido": no se reconoce → requiere asignación manual.
 */
import type { OpcionTerminologia, ReglaMapeo, Terminologia, TipoMuestra } from "../api";

export type Calidad = "exacto" | "sinonimo" | "parecido" | "desconocido" | "vacio";
export interface Reconocido {
  codigo: string;
  calidad: Calidad;
}

/** minúsculas, sin tildes ni signos, sin "spp." al final */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+(spp|sp)$/g, "")
    .trim();
}

/** "Giardia lamblia" → "g lamblia" (abreviatura habitual en laboratorio) */
const abreviar = (n: string) => {
  const [g, ...resto] = n.split(" ");
  return resto.length ? `${g[0]} ${resto.join(" ")}` : n;
};

function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function crearReconocedorEspecies(t: Terminologia, reglas: ReglaMapeo[]) {
  const exactos = new Map<string, string>();
  const alternos = new Map<string, string>();
  for (const e of t.especies) {
    const nombre = normalizar(e.nombreLocal ?? e.display);
    exactos.set(nombre, e.codigo);
    // El nombre oficial SNOMED también cuenta como exacto
    exactos.set(normalizar(e.display), e.codigo);
    for (const alt of [abreviar(nombre), ...(e.sinonimos ?? []).map(normalizar), ...(e.sinonimos ?? []).map((s) => abreviar(normalizar(s)))]) {
      if (!exactos.has(alt)) alternos.set(alt, e.codigo);
    }
  }
  // Diccionario local (pantalla de Mapeos)
  for (const r of reglas) {
    if (r.estado !== "mapeado" || r.ontologia !== "SNOMED CT" || !r.codigo || r.pestana === "metodos" || r.pestana === "estadios") continue;
    if (!t.especies.some((e) => e.codigo === r.codigo)) continue;
    for (const termino of r.terminos) if (!exactos.has(normalizar(termino))) alternos.set(normalizar(termino), r.codigo);
  }
  const todos = [...exactos.keys(), ...alternos.keys()];

  return (texto: string): Reconocido => {
    const n = normalizar(texto);
    if (!n) return { codigo: "", calidad: "vacio" };
    if (exactos.has(n)) return { codigo: exactos.get(n)!, calidad: "exacto" };
    if (alternos.has(n)) return { codigo: alternos.get(n)!, calidad: "sinonimo" };
    // Quitar texto entre paréntesis o después de "(" — ej. "Entamoba histolyt (quiste/trofo?)"
    const base = normalizar(texto.replace(/\(.*$/, ""));
    let mejor = { clave: "", d: 99 };
    for (const k of todos) {
      const d = distancia(base, k);
      if (d < mejor.d) mejor = { clave: k, d };
    }
    // Prefijo truncado: "entamoba histolyt" vs "entamoeba histolytica"
    const prefijo = todos.find((k) => base.length >= 8 && k.startsWith(base.slice(0, -1)));
    if (mejor.d <= 2 && base.length >= 5) return { codigo: exactos.get(mejor.clave) ?? alternos.get(mejor.clave)!, calidad: "parecido" };
    if (prefijo) return { codigo: exactos.get(prefijo) ?? alternos.get(prefijo)!, calidad: "parecido" };
    const truncadoConError = todos.find((k) => base.length >= 8 && distancia(base, k.slice(0, base.length)) <= 2);
    if (truncadoConError) return { codigo: exactos.get(truncadoConError) ?? alternos.get(truncadoConError)!, calidad: "parecido" };
    return { codigo: "", calidad: "desconocido" };
  };
}

/** Palabras clave → código propio. El primer patrón que coincida gana. */
function crearPorPalabras(opciones: OpcionTerminologia[], patrones: [RegExp, string][]) {
  const validos = new Set(opciones.map((o) => o.codigo));
  return (texto: string): Reconocido => {
    const n = normalizar(texto);
    if (!n) return { codigo: "", calidad: "vacio" };
    const exacto = opciones.find((o) => normalizar(o.display) === n || o.codigo === n);
    if (exacto) return { codigo: exacto.codigo, calidad: "exacto" };
    const encontrados = patrones.filter(([re, c]) => re.test(n) && validos.has(c)).map(([, c]) => c);
    const unicos = [...new Set(encontrados)];
    if (unicos.length === 1) return { codigo: unicos[0], calidad: n.split(" ").length <= 2 ? "exacto" : "sinonimo" };
    if (unicos.length > 1) return { codigo: unicos[0], calidad: "parecido" }; // ej. "quiste/trofo?" → ambiguo
    return { codigo: "", calidad: "desconocido" };
  };
}

export const crearReconocedorEstadios = (t: Terminologia) =>
  crearPorPalabras(t.estadios, [
    [/\b(trofozoito|trofo|trophozoite|vegetativ)/, "trofozoito"],
    [/\b(ooquiste|oocyst)/, "ooquiste"],
    [/\b(quiste|quistes|cyst)\b/, "quiste"],
    [/\b(tripomastigote|trypomastigote|tripo)\b/, "tripomastigote"],
    [/\b(huevo|huevos|egg|ova)\b/, "huevo"],
    [/\b(larva|larvas|rabditiforme|filariforme)\b/, "larva"],
  ]);

export const crearReconocedorTinciones = (t: Terminologia) =>
  crearPorPalabras(t.tinciones, [
    [/\b(lugol|yodo|iodo|iodine)\b/, "lugol"],
    [/\b(fresco|salino|salina|sf|suero)\b/, "fresco"],
    [/\b(hematoxilina|heidenhain|hematoxylin)\b/, "hematoxilina"],
    [/\b(kinyoun|ziehl|zn|acido alcohol|baar)\b/, "ziehl"],
    [/\b(tricromica|tricromico|gomori|wheatley|trichrome)\b/, "gomori"],
    [/\b(giemsa)\b/, "giemsa"],
  ]);

export function reconocerAumento(texto: string, t: Terminologia): Reconocido {
  const m = normalizar(texto).match(/(\d{2,3})\s*x?/);
  if (!m) return { codigo: "", calidad: texto.trim() ? "desconocido" : "vacio" };
  const codigo = `${Number(m[1])}x`;
  return t.aumentos.some((a) => a.codigo === codigo) ? { codigo, calidad: "exacto" } : { codigo: "", calidad: "desconocido" };
}

export function reconocerTipoMuestra(texto: string): TipoMuestra | null {
  const n = normalizar(texto);
  if (/concentr/.test(n)) return "heces-concentrado";
  if (/(heces|deposicion|stool|copro|fecal)/.test(n)) return "heces";
  if (/(sangre|blood|frotis sangu|gota gruesa)/.test(n)) return "sangre";
  return null;
}

/* ------------------------------------------------------------------ */
/* Protección de datos personales                                      */
/* ------------------------------------------------------------------ */

/** Encabezados que indican datos que identifican directamente a una persona. */
const COLUMNAS_PROHIBIDAS =
  /^(nombres?|apellidos?|nombre completo|paciente|rut|run|dni|pasaporte|cedula|direccion|domicilio|telefono|celular|fono|email|correo|e mail|fecha nacimiento|fecha de nacimiento|ficha clinica|n ficha)$/;

export function columnaProhibida(encabezado: string) {
  return COLUMNAS_PROHIBIDAS.test(normalizar(encabezado));
}

/** RUT/RUN chileno (con o sin puntos) o correo electrónico dentro de una celda. */
const PATRON_IDENTIFICADOR = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b|[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

export function pareceIdentificador(valor: string) {
  return PATRON_IDENTIFICADOR.test(valor);
}
