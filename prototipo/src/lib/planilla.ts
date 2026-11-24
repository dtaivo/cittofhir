/**
 * Lectura y análisis de planillas de muestras DENTRO DEL NAVEGADOR.
 * El archivo nunca se envía a ningún servidor: se lee en la memoria de la computadora.
 */
import type { Caso, FilaLote, Lote, PropuestaCaso, ReglaMapeo, Terminologia, TipoProblema } from "../api";
import {
  columnaProhibida,
  crearReconocedorEspecies,
  crearReconocedorEstadios,
  crearReconocedorTinciones,
  normalizar,
  pareceIdentificador,
  reconocerAumento,
  reconocerTipoMuestra,
} from "./reconocer";

export const MAX_FILAS = 50_000;

/** Columnas de la plantilla ParaFHIR y los nombres alternativos que también se aceptan. */
export const COLUMNAS = [
  { clave: "id_lamina", requerida: true, destino: "Specimen.identifier", alias: ["lamina", "id lam", "codigo lamina", "n lamina"], ayuda: "Código único de la lámina. Ej.: LAM-0001" },
  { clave: "id_muestra", requerida: true, destino: "Specimen.subject (seudónimo)", alias: ["muestra", "codigo muestra", "id pseudonimo", "seudonimo", "pseudonimo"], ayuda: "Código seudonimizado de la muestra o paciente. NUNCA nombre ni RUT." },
  { clave: "tipo_muestra", requerida: true, destino: "Observation.code (LOINC)", alias: ["tipo", "muestra tipo", "especimen"], ayuda: "heces · heces-concentrado · sangre" },
  { clave: "fecha_toma", requerida: false, destino: "Specimen.collection.collectedDateTime", alias: ["fecha", "fecha toma muestra", "fecha muestra"], ayuda: "AAAA-MM-DD. Ej.: 2025-02-12" },
  { clave: "especie_observada", requerida: true, destino: "Observation.valueCodeableConcept (SNOMED)", alias: ["especie", "parasito", "hallazgo", "resultado"], ayuda: "Nombre científico o 'Negativo'. Ej.: Giardia lamblia" },
  { clave: "estadio", requerida: false, destino: "Observation.component (SNOMED)", alias: ["estadio evolutivo", "forma", "fase"], ayuda: "trofozoíto · quiste · ooquiste · huevo · larva · tripomastigote" },
  { clave: "tincion", requerida: false, destino: "Observation.method (SNOMED)", alias: ["protocolo tincion", "metodo", "tecnica"], ayuda: "Lugol · Fresco · Giemsa · Kinyoun · Tricrómica · Hematoxilina" },
  { clave: "aumento", requerida: false, destino: "Media.device (aumento)", alias: ["aumento objetivo", "objetivo", "magnificacion"], ayuda: "10x · 40x · 100x" },
  { clave: "archivo_imagen", requerida: false, destino: "Media.content", alias: ["imagen", "archivo"], ayuda: "Nombre del archivo de imagen (opcional)" },
  { clave: "observaciones", requerida: false, destino: "Observation.note", alias: ["nota", "comentario", "comentarios"], ayuda: "Texto libre, sin datos personales (opcional)" },
] as const;

type Clave = (typeof COLUMNAS)[number]["clave"];

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

const ES_NEGATIVO = /^(negativo|neg|no se observan( parasitos| elementos parasitarios)?|sin hallazgos?|no se observa(n)? parasitos)$/;

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
  // 1. Protección de datos: rechazar columnas identificatorias
  const prohibidas = tabla.encabezados.filter((h) => h && columnaProhibida(h));
  if (prohibidas.length) {
    throw new ErrorPlanilla(
      `La planilla tiene columnas con datos personales (${prohibidas.join(", ")}). Elimínelas y use solo el código seudonimizado en "id_muestra".`,
    );
  }

  // 2. Encontrar cada columna de la plantilla (por nombre o alias)
  const indice = new Map<Clave, number>();
  tabla.encabezados.forEach((h, i) => {
    const n = normalizar(h);
    const col = COLUMNAS.find((c) => normalizar(c.clave) === n || c.alias.some((a) => normalizar(a) === n));
    if (col && !indice.has(col.clave)) indice.set(col.clave, i);
  });
  const faltantes = COLUMNAS.filter((c) => c.requerida && !indice.has(c.clave)).map((c) => c.clave);
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
  const especie = crearReconocedorEspecies(t, reglas);
  const estadio = crearReconocedorEstadios(t);
  const tincion = crearReconocedorTinciones(t);
  const primeraVez = new Map<string, string>();

  const filas: FilaLote[] = tabla.filas.map((fila, i) => {
    const n = i + 2;
    const crudo = {
      especie: valor(fila, "especie_observada"),
      estadio: valor(fila, "estadio"),
      tincion: valor(fila, "tincion"),
      aumento: valor(fila, "aumento"),
      tipoMuestra: valor(fila, "tipo_muestra"),
      fecha: valor(fila, "fecha_toma"),
    };
    const problemas: { tipo: TipoProblema; texto: string }[] = [];
    const idLamina = valor(fila, "id_lamina");
    const idMuestra = valor(fila, "id_muestra");
    if (!idLamina) problemas.push({ tipo: "formato", texto: "Falta id_lamina" });
    if (!idMuestra) problemas.push({ tipo: "formato", texto: "Falta id_muestra" });
    const tipoMuestra = reconocerTipoMuestra(crudo.tipoMuestra);
    if (!tipoMuestra) problemas.push({ tipo: "formato", texto: crudo.tipoMuestra ? `Tipo de muestra "${crudo.tipoMuestra}" no válido` : "Falta tipo_muestra" });
    const fecha = crudo.fecha ? fechaValida(crudo.fecha) : null;
    if (crudo.fecha && !fecha) problemas.push({ tipo: "formato", texto: `Fecha "${crudo.fecha}" no válida` });
    if (fecha && fecha > new Date().toISOString().slice(0, 10)) problemas.push({ tipo: "formato", texto: "Fecha en el futuro" });

    const negativo = ES_NEGATIVO.test(normalizar(crudo.especie));
    const esp = negativo ? { codigo: "negativo", calidad: "exacto" as const } : especie(crudo.especie);
    const est = estadio(crudo.estadio);
    const tin = tincion(crudo.tincion);
    const aum = reconocerAumento(crudo.aumento, t);

    if (esp.calidad !== "exacto") {
      problemas.push({ tipo: "taxonomia", texto: `Especie: ${DESCRIPCION_CALIDAD[esp.calidad]}${crudo.especie ? ` ("${crudo.especie}")` : ""}` });
    }
    if (!negativo) {
      if (est.calidad !== "exacto") problemas.push({ tipo: "optica", texto: `Estadio: ${DESCRIPCION_CALIDAD[est.calidad]}` });
      if (tin.calidad !== "exacto") problemas.push({ tipo: "optica", texto: `Tinción: ${DESCRIPCION_CALIDAD[tin.calidad]}` });
      if (aum.calidad !== "exacto") problemas.push({ tipo: "optica", texto: `Aumento: ${DESCRIPCION_CALIDAD[aum.calidad]}` });
    }

    let duplicadoDe: string | null = null;
    if (idLamina) {
      if (primeraVez.has(idLamina)) {
        duplicadoDe = primeraVez.get(idLamina)!;
        problemas.push({ tipo: "duplicado", texto: `ID repetido (ya aparece en la fila ${duplicadoDe.split("#")[1]})` });
      } else primeraVez.set(idLamina, `${idLamina}#${n}`);
    }

    const propuesta: PropuestaCaso = {
      relacion: duplicadoDe ? "" : "nuevo",
      especie: esp.codigo,
      estadio: negativo ? "" : est.codigo,
      tincion: tin.codigo,
      aumento: aum.codigo,
    };
    return {
      fila: n,
      idLamina,
      idMuestra,
      tipoMuestra,
      fecha,
      crudo,
      propuesta,
      calidad: { especie: esp.calidad, estadio: est.calidad, tincion: tin.calidad, aumento: aum.calidad },
      problemas,
      duplicadoDe: duplicadoDe?.split("#")[0] ?? null,
      archivoImagen: valor(fila, "archivo_imagen"),
      observaciones: valor(fila, "observaciones"),
    };
  });

  const columnasReconocidas = new Set(indice.values());
  return {
    archivo,
    hoja: tabla.hoja,
    columnas: COLUMNAS.filter((c) => indice.has(c.clave)).map((c) => ({ columna: tabla.encabezados[indice.get(c.clave)!], destino: c.destino })),
    columnasIgnoradas: tabla.encabezados.filter((h, i) => h && !columnasReconocidas.has(i)),
    filas,
    cargadoEn: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Del lote a las pantallas                                            */
/* ------------------------------------------------------------------ */

/** Id único del caso: el id de lámina, o lámina + fila si está repetida. */
export const idCaso = (f: FilaLote) => (f.duplicadoDe || !f.idLamina ? `${f.idLamina || "SIN-ID"} · fila ${f.fila}` : f.idLamina);

export function casoDesdeFila(f: FilaLote, t: Terminologia, nombreArchivo: string): Caso {
  const especie = t.especies.find((e) => e.codigo === f.propuesta.especie);
  const nombreEspecie = f.propuesta.especie === "negativo" ? t.negativo.texto : especie?.nombreLocal ?? especie?.display;
  const partes: string[] = [];
  if (nombreEspecie && f.calidad.especie !== "exacto") partes.push(`Se propone "${nombreEspecie}" para "${f.crudo.especie}"; confirme la especie.`);
  if (!nombreEspecie) partes.push(`No se reconoce "${f.crudo.especie || "(vacío)"}": elija la especie o asígnela en Mapeos.`);
  if (f.duplicadoDe) partes.push(`El ID ${f.idLamina} ya aparece antes en la planilla: indique si es un escaneo repetido o un nuevo corte.`);
  const opticos = f.problemas.filter((p) => p.tipo === "optica" || p.tipo === "formato").map((p) => p.texto.toLowerCase());
  if (opticos.length) partes.push(`Complete: ${opticos.join(", ")}.`);

  return {
    id: idCaso(f),
    titulo: f.crudo.especie || "(sin especie)",
    muestra: `Muestra ${f.idMuestra || "—"} · fila ${f.fila}`,
    categoria: f.problemas.some((p) => p.tipo === "duplicado") ? "duplicados" : "snomed",
    tipoMuestra: f.tipoMuestra ?? "heces",
    imagen: "",
    imagenGrande: "",
    imagenAlt: "",
    aumentoMiniatura: f.propuesta.aumento || "?",
    insignia: { texto: f.problemas.length === 1 ? "1 Alerta" : `${f.problemas.length} Alertas`, tono: "error" },
    etiquetas: f.problemas.slice(0, 2).map((p) => ({ texto: p.texto.length > 34 ? `${p.texto.slice(0, 33)}…` : p.texto, tono: p.tipo === "duplicado" ? "info" : "neutral" })),
    archivoOriginal: f.archivoImagen || `${nombreArchivo}, fila ${f.fila}`,
    comparaCon: f.duplicadoDe,
    textoCrudo: f.crudo.especie || "(vacío)",
    sospechaDuplicado: f.duplicadoDe ? { con: f.duplicadoDe, texto: `El identificador ${f.idLamina} aparece más de una vez en la planilla.` } : null,
    sugerencia: partes.join(" ") || "Revise los datos de la fila.",
    propuesta: f.propuesta,
    deteccionTincion: f.crudo.tincion ? `Planilla: "${f.crudo.tincion}"` : "Planilla: sin tinción indicada",
  };
}

/** Error de escritura más repetido entre los casos: se puede corregir en bloque. */
export function patronMasFrecuente(filas: FilaLote[]) {
  const grupos = new Map<string, FilaLote[]>();
  for (const f of filas) {
    if (!f.propuesta.especie || (f.calidad.especie !== "sinonimo" && f.calidad.especie !== "parecido")) continue;
    const k = normalizar(f.crudo.especie);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const [mejor] = [...grupos.values()].sort((a, b) => b.length - a.length);
  return mejor && mejor.length >= 2 ? mejor : null;
}

/* ------------------------------------------------------------------ */
/* Plantilla descargable                                               */
/* ------------------------------------------------------------------ */

export async function generarPlantilla(): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  libro.creator = "ParaFHIR";
  const hoja = libro.addWorksheet("Muestras", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.clave, key: c.clave, width: Math.max(14, c.clave.length + 4) }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
  const ejemplos = [
    ["LAM-0001", "PSD-7F3A", "heces", "2025-02-12", "Giardia duodenalis", "quiste", "Lugol", "40x", "IMG_0001.tif", "EJEMPLO: borre esta fila"],
    ["LAM-0002", "PSD-91C2", "heces", "2025-02-12", "Entamoeba histolytica", "trofozoíto", "Tricrómica", "100x", "", "EJEMPLO: borre esta fila"],
    ["LAM-0003", "PSD-1B08", "sangre", "2025-02-13", "Trypanosoma cruzi", "tripomastigote", "Giemsa", "100x", "", "EJEMPLO: borre esta fila"],
    ["LAM-0004", "PSD-55D0", "heces", "2025-02-13", "Negativo", "", "Fresco", "40x", "", "EJEMPLO: borre esta fila"],
  ];
  ejemplos.forEach((e) => hoja.addRow(e));
  for (let r = 2; r <= 1000; r++) {
    hoja.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"heces,heces-concentrado,sangre"'] };
    hoja.getCell(`H${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"10x,40x,100x"'] };
  }
  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.columns = [
    { header: "Columna", width: 20 },
    { header: "¿Obligatoria?", width: 14 },
    { header: "Qué escribir", width: 70 },
  ];
  ayuda.getRow(1).font = { bold: true };
  COLUMNAS.forEach((c) => ayuda.addRow([c.clave, c.requerida ? "Sí" : "No", c.ayuda]));
  ayuda.addRow([]);
  ayuda.addRow(["IMPORTANTE", "", "No incluya nombres, RUT, fechas de nacimiento, teléfonos ni correos. La app rechaza esos datos."]);
  ayuda.addRow(["", "", "Use en id_muestra un código seudonimizado; la tabla que lo vincula con la persona queda en su institución."]);
  ayuda.addRow(["", "", "Una fila por lámina. Si una lámina se escaneó dos veces, repita su id_lamina: la app lo detectará."]);
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Excel curado: una fila por lámina con códigos finales. */
export async function generarExcelCurado(
  filas: { fila: FilaLote; decision: PropuestaCaso & { nota: string } }[],
  t: Terminologia,
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Curado");
  hoja.columns = [
    "id_lamina", "id_muestra", "tipo_muestra", "fecha_toma", "especie_original", "especie_snomed", "especie_nombre",
    "estadio", "estadio_snomed", "tincion", "tincion_snomed", "aumento", "relacion", "nota",
  ].map((h) => ({ header: h, key: h, width: 18 }));
  hoja.getRow(1).font = { bold: true };
  for (const { fila, decision } of filas) {
    const esp = decision.especie === "negativo" ? { codigo: t.negativo.codigo, display: t.negativo.display } : t.especies.find((e) => e.codigo === decision.especie);
    const est = t.estadios.find((e) => e.codigo === decision.estadio);
    const tin = t.tinciones.find((e) => e.codigo === decision.tincion);
    hoja.addRow([
      fila.idLamina, fila.idMuestra, fila.tipoMuestra ?? "", fila.fecha ?? "", fila.crudo.especie, esp?.codigo ?? "", esp?.display ?? "",
      est?.display ?? "", est?.snomed ?? "", tin?.display ?? "", tin?.snomed ?? "", decision.aumento, decision.relacion, decision.nota,
    ]);
  }
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
