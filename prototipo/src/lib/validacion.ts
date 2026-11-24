/**
 * Reglas de validación de formularios.
 * Cada función devuelve un mensaje de error (texto) o `null` si el valor es válido.
 */

export const EXTENSIONES_PERMITIDAS = [".xlsx", ".xls", ".csv"];
export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ResultadoArchivo {
  error: string | null;
  alerta: string | null;
}

/** Revisa el archivo antes de "procesarlo": tipo, tamaño y que no esté vacío. */
export function validarArchivo(archivo: { name: string; size: number }): ResultadoArchivo {
  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES_PERMITIDAS.some((ext) => nombre.endsWith(ext))) {
    return { error: `Formato no admitido. Use ${EXTENSIONES_PERMITIDAS.join(", ")}.`, alerta: null };
  }
  if (archivo.size === 0) return { error: "El archivo está vacío.", alerta: null };
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { error: "El archivo supera el máximo de 20 MB.", alerta: null };
  }
  if (nombre.endsWith(".csv")) {
    return { error: null, alerta: "Los CSV no traen diccionarios embebidos: revise la codificación UTF-8." };
  }
  return { error: null, alerta: null };
}

export function requerido(valor: string, nombreCampo: string): string | null {
  return valor.trim() ? null : `Seleccione ${nombreCampo}.`;
}

// --- Códigos clínicos ---------------------------------------------------

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 8, 7, 6, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** SNOMED CT usa el algoritmo de Verhoeff como dígito verificador. */
export function verhoeffValido(codigo: string): boolean {
  let c = 0;
  [...codigo].reverse().forEach((ch, i) => {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]];
  });
  return c === 0;
}

/** LOINC usa un dígito verificador "módulo 10" después del guion. */
export function loincValido(codigo: string): boolean {
  const [numero, digito] = codigo.split("-");
  const invertido = [...numero].reverse();
  let impares = "";
  let pares = "";
  invertido.forEach((d, i) => {
    if (i % 2 === 0) impares = d + impares;
    else pares = d + pares;
  });
  const suma = [...String(Number(impares) * 2) + pares].reduce((a, d) => a + Number(d), 0);
  return (10 - (suma % 10)) % 10 === Number(digito);
}

export interface ResultadoCodigo {
  error: string | null;
  alerta: string | null;
}

export function validarCodigo(ontologia: string, codigo: string): ResultadoCodigo {
  const c = codigo.trim();
  if (!c) return { error: "Ingrese el código canónico.", alerta: null };
  if (ontologia === "LOINC") {
    if (!/^\d{1,7}-\d$/.test(c)) return { error: "Formato LOINC inválido. Ejemplo: 10704-5", alerta: null };
    if (!loincValido(c)) return { error: "El dígito verificador LOINC no coincide.", alerta: null };
    return { error: null, alerta: null };
  }
  if (!/^\d{6,18}$/.test(c)) return { error: "Un código SNOMED CT tiene entre 6 y 18 dígitos.", alerta: null };
  if (!verhoeffValido(c)) return { error: "El dígito verificador SNOMED no coincide: el código está mal escrito.", alerta: null };
  return { error: null, alerta: "Confirme el nombre oficial del código en el navegador SNOMED antes de guardar." };
}

export function validarUrlFhir(url: string): string | null {
  const v = url.trim();
  if (!v) return "Ingrese la URL base del servidor.";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return "La URL debe usar https:// para proteger los datos clínicos.";
    return null;
  } catch {
    return "La URL no es válida. Ejemplo: https://fhir.ejemplo.org/baseR4";
  }
}

export function validarToken(token: string): string | null {
  const v = token.trim();
  if (!v) return "Ingrese el token de acceso OAuth2.";
  if (v.length < 12) return "El token parece incompleto (mínimo 12 caracteres).";
  return null;
}
