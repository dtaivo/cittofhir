/**
 * Punto único de acceso a datos ("ventanilla").
 * Las pantallas solo hablan con `api`. Para conectar un backend real,
 * basta con crear otra fuente que cumpla `FuenteDatos` y cambiar esta línea.
 */
import { fuenteLocal } from "./fuenteLocal";
import type { FuenteDatos } from "./tipos";

export const api: FuenteDatos = fuenteLocal;
export type * from "./tipos";
