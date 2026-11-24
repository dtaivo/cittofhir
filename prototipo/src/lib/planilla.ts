/**
 * Lectura y análisis de planillas de digitalización DENTRO DEL NAVEGADOR.
 * El archivo nunca se envía a ningún servidor: se lee en la memoria de la computadora.
 *
 * Formato: planilla de seguimiento de láminas digitalizadas (WSI), una fila por lámina.
 * La especie se identifica con el código "Tax" del catálogo Repositorio.xlsx.
 */
import type { Caso, FilaLote, Lote, PropuestaCaso, ReglaMapeo, Terminologia, TipoProblema } from "../api";
import {
  columnaProhibida,
  crearReconocedorEspecies,
  crearReconocedorEstadios,
  normalizar,
  pareceIdentificador,
  reconocerAumento,
  reconocerTipoMuestra,
} from "./reconocer";

export const MAX_FILAS = 50_000;

type Uso = "especimen" | "flujo" | "tecnico";

/** Columnas de la planilla, en el mismo orden que la planilla del laboratorio. */
export const COLUMNAS = [
  { clave: "codigo", encabezado: "Código", requerida: true, uso: "especimen", destino: "Specimen / Media.identifier", alias: ["codigo lamina", "id lamina", "id_lamina"], ayuda: "Código único de la lámina. Ej.: LAM-0001" },
  { clave: "tax", encabezado: "Tax", requerida: true, uso: "especimen", destino: "Observation.valueCodeableConcept (SNOMED, vía catálogo)", alias: ["codigo tax", "taxon"], ayuda: "Código del catálogo Repositorio.xlsx. Ej.: tax-017 (Giardia duodenalis)" },
  { clave: "nombre_wsi", encabezado: "Nombre WSI", requerida: false, uso: "especimen", destino: "Media.content.title", alias: ["wsi", "archivo wsi", "nombre archivo"], ayuda: "Nombre del archivo de la imagen digitalizada" },
  { clave: "institucion", encabezado: "Institución", requerida: false, uso: "especimen", destino: "Observation.performer (texto)", alias: ["institucion de origen", "centro"], ayuda: "Institución que aporta la lámina" },
  { clave: "tipo_muestra", encabezado: "Tipo muestra", requerida: true, uso: "especimen", destino: "Observation.code (LOINC)", alias: ["tipo de muestra", "muestra"], ayuda: "Heces · Heces concentrado · Sangre · Aspirado · LBA · Otro" },
  { clave: "estado_evolutivo", encabezado: "Estado evolutivo", requerida: false, uso: "especimen", destino: "Observation.component (SNOMED)", alias: ["estadio", "estadio evolutivo"], ayuda: "Trofozoíto · Quiste · Huevo · Larva · Adulto · Amastigote · …" },
  { clave: "digitalizada", encabezado: "Digitalizada", requerida: false, uso: "flujo", destino: "Media.status", alias: [], ayuda: "Sí / No" },
  { clave: "evaluacion_alan", encabezado: "Evaluación Alan", requerida: false, uso: "flujo", destino: "Control de calidad (no va a FHIR)", alias: [], ayuda: "Resultado de la evaluación de calidad" },
  { clave: "evaluacion_armin", encabezado: "Evaluación Armin", requerida: false, uso: "flujo", destino: "Control de calidad (no va a FHIR)", alias: [], ayuda: "Resultado de la evaluación de calidad" },
  { clave: "solicitud_reescaneo", encabezado: "Solicitud Reescaneo", requerida: false, uso: "flujo", destino: "Control de calidad", alias: ["solicitud reescaneo"], ayuda: "Sí / No" },
  { clave: "link_ndp", encabezado: "Link NDP.serve", requerida: false, uso: "tecnico", destino: "Media.content.url", alias: ["link ndp", "link ndpserve", "link ndp serve"], ayuda: "Enlace a la imagen en NDP.serve" },
  { clave: "link_reescaneo", encabezado: "Link resscaneo", requerida: false, uso: "tecnico", destino: "Control de calidad", alias: ["link reescaneo", "link rescaneo"], ayuda: "Enlace a la imagen re-escaneada" },
  { clave: "aprobada", encabezado: "Aprobadas para ingreso al repositorio", requerida: false, uso: "flujo", destino: "Flujo del repositorio", alias: ["aprobada para ingreso al repositorio", "aprobada"], ayuda: "Sí / No" },
  { clave: "ingresada", encabezado: "Ingresadas al repositorio", requerida: false, uso: "flujo", destino: "Flujo del repositorio", alias: ["ingresada al repositorio", "ingresada"], ayuda: "Sí / No" },
  { clave: "respaldada", encabezado: "Respaldadas en el disco", requerida: false, uso: "flujo", destino: "Flujo del repositorio", alias: ["respaldada en el disco", "respaldada"], ayuda: "Sí / No" },
  { clave: "publico", encabezado: "Ingreso RPMV Público", requerida: false, uso: "flujo", destino: "Flujo del repositorio", alias: ["ingreso rpmv publico", "rpmv publico"], ayuda: "Sí / No" },
  { clave: "equipo", encabezado: "Equipo", requerida: false, uso: "tecnico", destino: "Media.device", alias: ["escaner", "scanner"], ayuda: "Escáner utilizado" },
  { clave: "encargado", encabezado: "Encargado digitalización", requerida: false, uso: "flujo", destino: "No va a FHIR (minimización de datos)", alias: ["encargado de digitalizacion", "encargado"], ayuda: "Persona del equipo que digitalizó" },
  { clave: "fecha_digitalizacion", encabezado: "Fecha digitalización", requerida: false, uso: "tecnico", destino: "Media.createdDateTime", alias: ["fecha de digitalizacion", "fecha"], ayuda: "AAAA-MM-DD (también DD-MM-AAAA)" },
  { clave: "tamano_gb", encabezado: "Tamaño (GB)", requerida: false, uso: "tecnico", destino: "Media.content.size", alias: ["tamano gb", "tamano"], ayuda: "Número. Ej.: 1.8" },
  { clave: "tamano_disco_gb", encabezado: "Tamaño en disco (GB)", requerida: false, uso: "tecnico", destino: "Media.note", alias: ["tamano en disco gb", "tamano en disco"], ayuda: "Número. Ej.: 1.9" },
  { clave: "aumento", encabezado: "Aumento", requerida: false, uso: "tecnico", destino: "Media.note", alias: ["aumento objetivo", "objetivo"], ayuda: "10x · 20x · 40x · 100x" },
  { clave: "resolucion", encabezado: "Resolución", requerida: false, uso: "tecnico", destino: "Media.note", alias: ["resolucion um pixel"], ayuda: "Ej.: 0.25 µm/pixel" },
  { clave: "width", encabezado: "Width (pixeles)", requerida: false, uso: "tecnico", destino: "Media.width", alias: ["width", "ancho", "ancho pixeles"], ayuda: "Número entero" },
  { clave: "height", encabezado: "Height (pixeles)", requerida: false, uso: "tecnico", destino: "Media.height", alias: ["height", "alto", "alto pixeles"], ayuda: "Número entero" },
  { clave: "n_z", encabezado: "n° Z", requerida: false, uso: "tecnico", destino: "Media.frames", alias: ["n z", "no z", "nz", "numero z", "planos z"], ayuda: "Número entero de planos focales" },
  { clave: "espaciado", encabezado: "Espaciado", requerida: false, uso: "tecnico", destino: "Media.note", alias: ["espaciado z"], ayuda: "Distancia entre planos Z" },
  { clave: "rango_enfoque", encabezado: "Rango de enfoque", requerida: false, uso: "tecnico", destino: "Media.note", alias: [], ayuda: "Rango total de enfoque" },
  { clave: "tiempo", encabezado: "Tiempo de digitalización", requerida: false, uso: "tecnico", destino: "Media.note", alias: ["tiempo digitalizacion", "tiempo"], ayuda: "Duración de la digitalización" },
  { clave: "formato", encabezado: "Formato", requerida: false, uso: "tecnico", destino: "Media.content (formato)", alias: ["formato archivo"], ayuda: "Ej.: NDPI, SVS, TIFF" },
] as const satisfies readonly { clave: string; encabezado: string; requerida: boolean; uso: Uso; destino: string; alias: readonly string[]; ayuda: string }[];

export type Clave = (typeof COLUMNAS)[number]["clave"];

export class ErrorPlanilla extends Error {}

export interface Tabla {
  hoja: string;
  encabezados: string[];
  filas: string[][];
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

function celdaATexto(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return celdaATexto(o.result);
    return "";
  }
  return String(v);
}

function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) fila.push(campo), (campo = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo), filas.push(fila), (fila = []), (campo = "");
    } else campo += c;
  }
  if (campo || fila.length) fila.push(campo), filas.push(fila);
  return filas.filter((f) => f.some((x) => x.trim()));
}

export async function leerArchivo(archivo: File): Promise<Tabla> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".xls")) throw new ErrorPlanilla("El formato .xls (Excel antiguo) no se puede leer. Ábralo en Excel y guárdelo como .xlsx.");
  if (nombre.endsWith(".csv")) {
    const [encabezados = [], ...filas] = leerCsv(await archivo.text());
    return { hoja: "CSV", encabezados, filas };
  }
  // .xlsx: la librería se descarga solo cuando hace falta (no hace más lenta la primera carga)
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    throw new ErrorPlanilla("No se pudo abrir el archivo. ¿Está dañado o protegido con contraseña?");
  }
  const hoja = libro.getWorksheet("Muestras") ?? libro.worksheets[0];
  if (!hoja) throw new ErrorPlanilla("El archivo no tiene hojas.");
  const encabezados: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (encabezados[i - 1] = celdaATexto(c.value).trim()));
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    if (n === 1) return;
    const valores = encabezados.map((_, i) => celdaATexto(fila.getCell(i + 1).value).trim());
    if (valores.some(Boolean)) filas.push(valores);
  });
  return { hoja: hoja.name, encabezados, filas };
}

/* ------------------------------------------------------------------ */
/* Análisis                                                            */
/* ------------------------------------------------------------------ */

function fechaValida(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** "Sí", "si", "x", "1", "ok", "aprobada" → true; "No", "0", "rechazada" → false; vacío → null */
export function siNo(valor: string): boolean | null {
  const n = normalizar(valor);
  if (!n) return null;
  if (/^(si|s|x|1|true|yes|ok|aprobad[oa]s?|listo|hecho|completad[oa])$/.test(n)) return true;
  if (/^(no|n|0|false|rechazad[oa]s?|pendiente)$/.test(n)) return false;
  return null;
}

const ES_NUMERO = /^\d+([.,]\d+)?$/;
/** "1,8" → 1.8 */
export const aNumero = (v: string) => (v && ES_NUMERO.test(v) ? Number(v.replace(",", ".")) : null);

const DESCRIPCION_CALIDAD = {
  sinonimo: "coincide por sinónimo o abreviatura",
  parecido: "posible error de escritura",
  desconocido: "valor no reconocido",
  vacio: "sin indicar",
} as const;

export function analizarTabla(
  tabla: Tabla,
  archivo: { nombre: string; tamanoBytes: number },
  t: Terminologia,
  reglas: ReglaMapeo[],
): Lote {
  // 1. Encontrar cada columna (por encabezado exacto, clave o alias; sin importar tildes ni mayúsculas)
  const indice = new Map<Clave, number>();
  tabla.encabezados.forEach((h, i) => {
    const n = normalizar(h);
    if (!n) return;
    const col = COLUMNAS.find((c) => [c.encabezado, c.clave, ...c.alias].some((x) => normalizar(x) === n));
    if (col && !indice.has(col.clave)) indice.set(col.clave, i);
  });

  // 2. Protección de datos: rechazar columnas que identifican a pacientes
  const prohibidas = tabla.encabezados.filter((h, i) => h && ![...indice.values()].includes(i) && columnaProhibida(h));
  if (prohibidas.length) {
    throw new ErrorPlanilla(`La planilla tiene columnas con datos personales (${prohibidas.join(", ")}). Elimínelas antes de cargar.`);
  }
  const faltantes = COLUMNAS.filter((c) => c.requerida && !indice.has(c.clave)).map((c) => `"${c.encabezado}"`);
  if (faltantes.length) {
    throw new ErrorPlanilla(`Faltan columnas obligatorias: ${faltantes.join(", ")}. Descargue la plantilla para ver el formato.`);
  }
  if (!tabla.filas.length) throw new ErrorPlanilla("La planilla no tiene filas con datos.");
  if (tabla.filas.length > MAX_FILAS) throw new ErrorPlanilla(`La planilla tiene ${tabla.filas.length} filas; el máximo es ${MAX_FILAS}.`);

  // 3. Buscar RUT o correos en cualquier celda
  for (const [i, fila] of tabla.filas.entries()) {
    const celda = fila.find((v) => pareceIdentificador(v));
    if (celda) {
      throw new ErrorPlanilla(`La fila ${i + 2} contiene lo que parece un RUT o correo ("${celda.slice(0, 3)}…"). Retire los datos personales antes de cargar.`);
    }
  }

  const valor = (fila: string[], c: Clave) => (indice.has(c) ? (fila[indice.get(c)!] ?? "").trim() : "");
  const porTax = new Map(t.taxones.map((x) => [normalizar(x.tax), x]));
  const especiePorNombre = crearReconocedorEspecies(t, reglas);
  const estadio = crearReconocedorEstadios(t);
  const primeraVez = new Map<string, number>();
  const hoy = new Date().toISOString().slice(0, 10);

  const filas: FilaLote[] = tabla.filas.map((fila, i) => {
    const n = i + 2;
    const problemas: { tipo: TipoProblema; texto: string }[] = [];
    const digitalizacion: Record<string, string> = {};
    for (const c of COLUMNAS) if (c.uso !== "especimen") digitalizacion[c.clave] = valor(fila, c.clave);

    const crudo = {
      especie: valor(fila, "tax"),
      estadio: valor(fila, "estado_evolutivo"),
      tincion: "",
      aumento: valor(fila, "aumento"),
      tipoMuestra: valor(fila, "tipo_muestra"),
      fecha: valor(fila, "fecha_digitalizacion"),
    };
    const idLamina = valor(fila, "codigo");
    const nombreWsi = valor(fila, "nombre_wsi");

    // --- Datos obligatorios y formato
    if (!idLamina) problemas.push({ tipo: "formato", texto: "Falta Código" });
    const tipoMuestra = reconocerTipoMuestra(crudo.tipoMuestra);
    if (!tipoMuestra) problemas.push({ tipo: "formato", texto: crudo.tipoMuestra ? `Tipo de muestra "${crudo.tipoMuestra}" no reconocido` : "Falta Tipo muestra" });
    const fecha = crudo.fecha ? fechaValida(crudo.fecha) : null;
    if (crudo.fecha && !fecha) problemas.push({ tipo: "formato", texto: `Fecha "${crudo.fecha}" no válida` });
    if (fecha && fecha > hoy) problemas.push({ tipo: "formato", texto: "Fecha de digitalización en el futuro" });
    for (const c of ["tamano_gb", "tamano_disco_gb", "width", "height", "n_z"] as const) {
      const v = valor(fila, c);
      if (v && !ES_NUMERO.test(v)) problemas.push({ tipo: "formato", texto: `${COLUMNAS.find((x) => x.clave === c)!.encabezado}: "${v}" no es un número` });
    }

    // --- Especie por código Tax del catálogo
    let especie = { codigo: "", calidad: "vacio" as FilaLote["calidad"]["especie"] };
    if (crudo.especie) {
      const taxon = porTax.get(normalizar(crudo.especie));
      if (!taxon) problemas.push({ tipo: "taxonomia", texto: `Tax "${crudo.especie}" no existe en el catálogo` });
      else if (!taxon.codigo) problemas.push({ tipo: "taxonomia", texto: `${taxon.nombre} (${taxon.tax}) aún no tiene código SNOMED` });
      else especie = { codigo: taxon.codigo, calidad: "exacto" };
    } else {
      // Sin Tax: intentar reconocer la especie desde el nombre del archivo WSI
      const deNombre = nombreWsi ? especiePorNombre(nombreWsi.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\b\w*\d\w*\b/g, " ").trim()) : null;
      if (deNombre?.codigo) especie = { codigo: deNombre.codigo, calidad: "parecido" };
      problemas.push({ tipo: "taxonomia", texto: deNombre?.codigo ? "Falta Tax: especie deducida del nombre WSI" : "Falta Tax" });
    }

    // --- Estadio y aumento
    const est = estadio(crudo.estadio);
    const aum = reconocerAumento(crudo.aumento, t);
    if (est.calidad !== "exacto") problemas.push({ tipo: "optica", texto: `Estado evolutivo: ${DESCRIPCION_CALIDAD[est.calidad]}${crudo.estadio && est.calidad !== "vacio" ? ` ("${crudo.estadio}")` : ""}` });
    if (aum.calidad !== "exacto") problemas.push({ tipo: "optica", texto: `Aumento: ${DESCRIPCION_CALIDAD[aum.calidad]}${crudo.aumento && aum.calidad !== "vacio" ? ` ("${crudo.aumento}")` : ""}` });

    // --- Control de calidad del flujo de digitalización
    const ev1 = normalizar(digitalizacion.evaluacion_alan);
    const ev2 = normalizar(digitalizacion.evaluacion_armin);
    if (ev1 && ev2 && ev1 !== ev2) problemas.push({ tipo: "flujo", texto: "Evaluaciones de calidad no coinciden" });
    if (siNo(digitalizacion.solicitud_reescaneo) && !digitalizacion.link_reescaneo) problemas.push({ tipo: "flujo", texto: "Reescaneo solicitado sin link" });
    if (siNo(digitalizacion.ingresada) && siNo(digitalizacion.aprobada) === false) problemas.push({ tipo: "flujo", texto: "Ingresada al repositorio sin aprobación" });
    if (siNo(digitalizacion.publico) && !siNo(digitalizacion.ingresada)) problemas.push({ tipo: "flujo", texto: "En RPMV público sin ingreso al repositorio" });
    if (siNo(digitalizacion.digitalizada) === false && digitalizacion.link_ndp) problemas.push({ tipo: "flujo", texto: "Marcada no digitalizada pero tiene link" });

    // --- Duplicados
    let duplicadoDe: string | null = null;
    if (idLamina) {
      if (primeraVez.has(idLamina)) {
        duplicadoDe = idLamina;
        problemas.push({ tipo: "duplicado", texto: `Código repetido (ya aparece en la fila ${primeraVez.get(idLamina)})` });
      } else primeraVez.set(idLamina, n);
    }

    const propuesta: PropuestaCaso = {
      relacion: duplicadoDe ? "" : "nuevo",
      especie: especie.codigo,
      estadio: est.codigo,
      tincion: "",
      aumento: aum.codigo,
    };
    return {
      fila: n,
      idLamina,
      tax: crudo.especie,
      nombreWsi,
      institucion: valor(fila, "institucion"),
      tipoMuestra,
      fecha,
      crudo,
      propuesta,
      calidad: { especie: especie.calidad, estadio: est.calidad, tincion: "vacio", aumento: aum.calidad },
      problemas,
      duplicadoDe,
      digitalizacion,
    };
  });

  const usadas = new Set(indice.values());
  return {
    archivo,
    hoja: tabla.hoja,
    columnas: COLUMNAS.filter((c) => indice.has(c.clave)).map((c) => ({ columna: tabla.encabezados[indice.get(c.clave)!], destino: c.destino })),
    columnasIgnoradas: tabla.encabezados.filter((h, i) => h && !usadas.has(i)),
    filas,
    cargadoEn: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Del lote a las pantallas                                            */
/* ------------------------------------------------------------------ */

/** Id único del caso: el código, o código + fila si está repetido. */
export const idCaso = (f: FilaLote) => (f.duplicadoDe || !f.idLamina ? `${f.idLamina || "SIN-CÓDIGO"} · fila ${f.fila}` : f.idLamina);

export function nombreEspecie(t: Terminologia, codigo: string) {
  const e = t.especies.find((x) => x.codigo === codigo);
  return e?.nombreLocal ?? e?.display;
}

export function casoDesdeFila(f: FilaLote, t: Terminologia, nombreArchivo: string): Caso {
  const taxon = t.taxones.find((x) => normalizar(x.tax) === normalizar(f.tax));
  const especie = nombreEspecie(t, f.propuesta.especie) ?? taxon?.nombre;
  const partes: string[] = [];
  const tax = f.problemas.find((p) => p.tipo === "taxonomia");
  if (tax) partes.push(`${tax.texto}${f.propuesta.especie ? `: se propone "${especie}"; confírmelo.` : ": elija la especie."}`);
  if (f.duplicadoDe) partes.push(`El código ${f.idLamina} ya aparece antes: indique si es un reescaneo de la misma lámina o un nuevo corte.`);
  const resto = f.problemas.filter((p) => p.tipo === "optica" || p.tipo === "formato" || p.tipo === "flujo").map((p) => p.texto.toLowerCase());
  if (resto.length) partes.push(`Revise: ${resto.join("; ")}.`);

  return {
    id: idCaso(f),
    titulo: especie ?? (f.tax ? `Tax ${f.tax}` : "(sin especie)"),
    muestra: `${f.institucion || "Sin institución"} · fila ${f.fila}`,
    categoria: f.problemas.some((p) => p.tipo === "duplicado") ? "duplicados" : "snomed",
    tipoMuestra: f.tipoMuestra ?? "otro",
    imagen: "",
    imagenGrande: "",
    imagenAlt: "",
    aumentoMiniatura: f.propuesta.aumento || "?",
    insignia: { texto: f.problemas.length === 1 ? "1 Alerta" : `${f.problemas.length} Alertas`, tono: "error" },
    etiquetas: f.problemas.slice(0, 2).map((p) => ({ texto: p.texto.length > 34 ? `${p.texto.slice(0, 33)}…` : p.texto, tono: p.tipo === "duplicado" ? "info" : "neutral" })),
    archivoOriginal: f.nombreWsi || `${nombreArchivo}, fila ${f.fila}`,
    comparaCon: f.duplicadoDe,
    textoCrudo: [f.tax || "(sin Tax)", f.crudo.estadio].filter(Boolean).join(" · "),
    sospechaDuplicado: f.duplicadoDe ? { con: f.duplicadoDe, texto: `El código ${f.idLamina} aparece más de una vez en la planilla.` } : null,
    sugerencia: partes.join(" ") || "Revise los datos de la fila.",
    propuesta: f.propuesta,
    deteccionTincion: "La planilla no incluye tinción (campo opcional)",
  };
}

/** Error más repetido entre los casos (mismo Tax / estadio mal escrito): se puede corregir en bloque. */
export function patronMasFrecuente(filas: FilaLote[]) {
  const grupos = new Map<string, FilaLote[]>();
  for (const f of filas) {
    if (f.calidad.estadio !== "sinonimo" && f.calidad.estadio !== "parecido") continue;
    const k = normalizar(f.crudo.estadio);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const [mejor] = [...grupos.values()].sort((a, b) => b.length - a.length);
  return mejor && mejor.length >= 2 ? mejor : null;
}

/* ------------------------------------------------------------------ */
/* Plantilla descargable                                               */
/* ------------------------------------------------------------------ */

const SI_NO = ['"Sí,No"'];

export async function generarPlantilla(): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  libro.creator = "ParaFHIR";
  const hoja = libro.addWorksheet("Muestras", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.encabezado, key: c.clave, width: Math.max(12, Math.min(28, c.encabezado.length + 4)) }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
  hoja.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  const ejemplo = (o: Partial<Record<Clave, string | number>>) => hoja.addRow(COLUMNAS.map((c) => o[c.clave] ?? ""));
  const comun = { institucion: "EJEMPLO – borre esta fila", digitalizada: "Sí", equipo: "Escáner de ejemplo", fecha_digitalizacion: "2025-02-12", formato: "NDPI", n_z: 1 };
  ejemplo({ ...comun, codigo: "LAM-0001", tax: "tax-017", nombre_wsi: "LAM-0001.ndpi", tipo_muestra: "Heces", estado_evolutivo: "Quiste", evaluacion_alan: "Aprobada", evaluacion_armin: "Aprobada", solicitud_reescaneo: "No", aprobada: "Sí", ingresada: "Sí", respaldada: "Sí", publico: "No", tamano_gb: 1.2, tamano_disco_gb: 1.3, aumento: "40x", resolucion: "0.23 µm/pixel", width: 98304, height: 61440 });
  ejemplo({ ...comun, codigo: "LAM-0002", tax: "tax-004", nombre_wsi: "LAM-0002.ndpi", tipo_muestra: "Heces", estado_evolutivo: "Trofozoíto", evaluacion_alan: "Aprobada", evaluacion_armin: "Aprobada", solicitud_reescaneo: "No", aprobada: "Sí", ingresada: "No", respaldada: "Sí", publico: "No", tamano_gb: 2.4, tamano_disco_gb: 2.5, aumento: "40x", resolucion: "0.23 µm/pixel", width: 120000, height: 80000 });
  ejemplo({ ...comun, codigo: "LAM-0003", tax: "tax-078", nombre_wsi: "LAM-0003.ndpi", tipo_muestra: "Sangre", estado_evolutivo: "Tripomastigote", evaluacion_alan: "Aprobada", evaluacion_armin: "Aprobada", solicitud_reescaneo: "No", aprobada: "Sí", ingresada: "Sí", respaldada: "Sí", publico: "Sí", tamano_gb: 0.9, tamano_disco_gb: 1.0, aumento: "100x", resolucion: "0.09 µm/pixel", width: 64000, height: 48000, n_z: 5, espaciado: "0.5 µm", rango_enfoque: "2 µm" });
  for (let r = 2; r <= 1000; r++) {
    for (const c of ["digitalizada", "solicitud_reescaneo", "aprobada", "ingresada", "respaldada", "publico"] as const) {
      const col = COLUMNAS.findIndex((x) => x.clave === c) + 1;
      hoja.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: SI_NO };
    }
    const colTipo = COLUMNAS.findIndex((x) => x.clave === "tipo_muestra") + 1;
    hoja.getCell(r, colTipo).dataValidation = { type: "list", allowBlank: false, formulae: ['"Heces,Heces concentrado,Sangre,Aspirado,LBA,Otro"'] };
  }
  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.columns = [
    { header: "Columna", width: 36 },
    { header: "¿Obligatoria?", width: 14 },
    { header: "Qué escribir", width: 60 },
    { header: "Dónde queda en FHIR", width: 45 },
  ];
  ayuda.getRow(1).font = { bold: true };
  COLUMNAS.forEach((c) => ayuda.addRow([c.encabezado, c.requerida ? "Sí" : "No", c.ayuda, c.destino]));
  ayuda.addRow([]);
  ayuda.addRow(["IMPORTANTE", "", "No incluya nombres de pacientes, RUT, fechas de nacimiento, teléfonos ni correos. La app rechaza esos datos."]);
  ayuda.addRow(["", "", "La especie se indica con el código Tax del catálogo Repositorio.xlsx (ej. tax-017 = Giardia duodenalis)."]);
  ayuda.addRow(["", "", "Una fila por lámina. Si una lámina aparece dos veces con el mismo Código, la app lo detectará."]);
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Excel curado: la planilla original + códigos finales. */
export async function generarExcelCurado(
  filas: { fila: FilaLote; decision: PropuestaCaso & { nota: string } }[],
  t: Terminologia,
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Curado");
  const extra = ["especie_snomed", "especie_nombre", "estadio_snomed", "examen_loinc", "nota_curacion"];
  hoja.columns = [...COLUMNAS.map((c) => c.encabezado), ...extra].map((h) => ({ header: h, width: 16 }));
  hoja.getRow(1).font = { bold: true };
  for (const { fila, decision } of filas) {
    const esp = decision.especie === "negativo" ? { codigo: t.negativo.codigo, display: t.negativo.display } : t.especies.find((e) => e.codigo === decision.especie);
    const est = codigoEstadio(t, decision.estadio, decision.especie);
    const examen = t.examenes.find((e) => e.tipoMuestra === fila.tipoMuestra) ?? t.examenes.find((e) => e.tipoMuestra === "otro");
    const base: Record<string, string> = {
      ...fila.digitalizacion,
      codigo: fila.idLamina,
      tax: fila.tax,
      nombre_wsi: fila.nombreWsi,
      institucion: fila.institucion,
      tipo_muestra: fila.crudo.tipoMuestra,
      estado_evolutivo: t.estadios.find((e) => e.codigo === decision.estadio)?.display ?? fila.crudo.estadio,
      aumento: decision.aumento || fila.crudo.aumento,
    };
    hoja.addRow([...COLUMNAS.map((c) => base[c.clave] ?? ""), esp?.codigo ?? "", esp?.display ?? "", est?.codigo ?? "", examen?.codigo ?? "", decision.nota]);
  }
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Código SNOMED del estadio: genérico, o según el grupo de la especie (huevo de nematodo, de cestodo…). */
export function codigoEstadio(t: Terminologia, estadio: string, especie: string) {
  const e = t.estadios.find((x) => x.codigo === estadio);
  if (!e) return null;
  if (e.snomed) return { codigo: e.snomed, display: e.snomedDisplay ?? "" };
  const grupo = t.especies.find((x) => x.codigo === especie)?.grupoTaxonomico;
  const g = grupo ? e.porGrupo?.[grupo] : undefined;
  return g ? { codigo: g.codigo, display: g.display } : null;
}
