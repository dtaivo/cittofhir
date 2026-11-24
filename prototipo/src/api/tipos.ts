/**
 * Tipos de datos del prototipo.
 * Describen la "forma" de cada dato, como una ficha clínica con campos obligatorios.
 * TypeScript avisa si algún componente usa un campo que no existe.
 */

export type Tono = "error" | "info" | "neutral" | "warning" | "success";

export interface Estudio {
  nombre: string;
  lote: string;
  perfil: string;
  specimenDb: string;
  parser: string;
  loinc: string;
}

export interface ColumnaEsquema {
  columna: string;
  destino: string;
}

export interface Hallazgo {
  id: string;
  icono: string;
  titulo: string;
  prioridad: string;
  severidad: "alta" | "media" | "duplicado";
  descripcion: string;
  impacta: string;
  detalle: string;
  casos: number;
}

/* ---------- Planilla cargada por el usuario (se procesa en el navegador) ---------- */

export type Calidad = "exacto" | "sinonimo" | "parecido" | "desconocido" | "vacio";
export type TipoProblema = "taxonomia" | "optica" | "duplicado" | "formato";

export interface FilaLote {
  /** Número de fila en la planilla (la fila 1 son los encabezados). */
  fila: number;
  idLamina: string;
  idMuestra: string;
  tipoMuestra: TipoMuestra | null;
  fecha: string | null;
  crudo: { especie: string; estadio: string; tincion: string; aumento: string; tipoMuestra: string; fecha: string };
  propuesta: PropuestaCaso;
  calidad: { especie: Calidad; estadio: Calidad; tincion: Calidad; aumento: Calidad };
  problemas: { tipo: TipoProblema; texto: string }[];
  duplicadoDe: string | null;
  archivoImagen: string;
  observaciones: string;
}

export interface Lote {
  archivo: { nombre: string; tamanoBytes: number };
  hoja: string;
  columnas: { columna: string; destino: string }[];
  columnasIgnoradas: string[];
  filas: FilaLote[];
  cargadoEn: string;
}

export interface DatosCarga {
  /** null = datos de demostración; si no, resumen del lote cargado. */
  lote?: { nombre: string; tamanoBytes: number; hoja: string; columnasIgnoradas: string[]; cargadoEn: string } | null;
  estudio: Estudio;
  usuario: { nombre: string; rol: string };
  servidor: { nombre: string; estado: string };
  archivoEjemplo: { nombre: string; tamanoBytes: number; columnas: number };
  esquema: ColumnaEsquema[];
  diagnostico: { total: number; conformes: number; alertas: number; duplicados: number };
  hallazgos: Hallazgo[];
  muestraTestigo: { id: string; imagen: string; alt: string; objetivo: string; tincion: string; alerta: string };
}

export type Relacion = "repetido" | "nuevo" | "";

export interface PropuestaCaso {
  relacion: Relacion;
  especie: string;
  estadio: string;
  tincion: string;
  aumento: string;
}

export interface Caso {
  id: string;
  titulo: string;
  muestra: string;
  categoria: "snomed" | "duplicados";
  tipoMuestra: TipoMuestra;
  imagen: string;
  imagenGrande: string;
  imagenAlt: string;
  aumentoMiniatura: string;
  insignia: { texto: string; tono: Tono };
  etiquetas: { texto: string; tono: Tono }[];
  archivoOriginal: string;
  comparaCon: string | null;
  textoCrudo: string;
  /** Sospecha de duplicado: por similitud de imagen (demo) o por ID repetido en la planilla (texto). */
  sospechaDuplicado: { con: string; similitud?: number; segundos?: number; texto?: string } | null;
  sugerencia: string;
  propuesta: PropuestaCaso;
  deteccionTincion: string;
}

export interface DecisionCaso extends PropuestaCaso {
  nota: string;
}

export interface EstadoCaso {
  estado: "pendiente" | "resuelto" | "descartado";
  decision?: DecisionCaso;
}

export interface ColaLimpieza {
  /** true = la cola viene de una planilla cargada por el usuario (no de la demo). */
  real?: boolean;
  totalPendientes: number;
  resueltosPrevios: number;
  filtros: { todos: number; snomed: number; duplicados: number };
  casos: Caso[];
  patron: { lote: string; casos: number; error: string } | null;
}

export interface OpcionTerminologia {
  /** Código propio (estadios, tinciones, aumentos) o código SNOMED (especies). */
  codigo: string;
  display: string;
  /** Nombre en español para mostrar en pantalla (especies). */
  nombreLocal?: string;
  /** Código SNOMED CT asociado (estadios y tinciones). */
  snomed?: string | null;
  snomedDisplay?: string | null;
  /** true = la equivalencia debe ser confirmada por una profesional clínica. */
  revisar?: boolean;
  /** Grupo del catálogo (ej. "Parasitos intestinales"). */
  grupo?: string;
  /** Si el código SNOMED se encontró a través de un sinónimo del catálogo. */
  via?: string;
  sinonimos?: string[];
  calibracion?: string;
}

/** Concepto SNOMED que combina especie + estadio (ej. "Giardia lamblia cyst"). */
export interface ConceptoEspecifico {
  especie: string;
  estadio: string;
  codigo: string;
  display: string;
}

export type TipoMuestra = "heces" | "heces-concentrado" | "sangre";

export interface Terminologia {
  especies: OpcionTerminologia[];
  estadios: OpcionTerminologia[];
  tinciones: OpcionTerminologia[];
  aumentos: OpcionTerminologia[];
  especificos: ConceptoEspecifico[];
  examenes: { tipoMuestra: TipoMuestra; codigo: string; display: string }[];
  /** Código SNOMED para "no se observan parásitos". */
  negativo: { codigo: string; display: string; texto: string };
}

export type Ontologia = "SNOMED CT" | "LOINC";

export interface ReglaMapeo {
  id: string;
  pestana: string;
  terminos: string[];
  ontologia: Ontologia | null;
  codigo: string | null;
  display: string | null;
  autoAplicar: boolean;
  confianza: number | null;
  estado: "mapeado" | "pendiente" | "conflicto";
}

export interface DatosMapeos {
  pestanas: { id: string; nombre: string; total: number }[];
  reglas: ReglaMapeo[];
  opcionesPendiente: { ontologia: Ontologia; codigo: string; display: string }[];
  sincronizacion: { hace: string; versiones: string };
}

export interface EventoAuditoria {
  fecha: string;
  muestra: string;
  operador: string;
  accion: string;
  binding: string;
  resultado: string;
}

export interface DatosExportacion {
  /** Nombre que se muestra al cierre de la pantalla (estudio de demo o archivo cargado). */
  nombreLote: string;
  bundleId: string;
  packageSpec: string;
  certificacion: { verificados: number; total: number };
  resumen: { icono: string; texto: string; valor: string; unidad: string }[];
  kpis: { titulo: string; icono: string; valor: string; descripcion: string; pie: string; pieIcono: string | null; pieMono?: boolean }[];
  servidorDestino: { url: string; token: string; nombre: string };
  descargas: { id: string; icono: string; titulo: string; descripcion: string; tamano: string; boton: string }[];
  auditoria: EventoAuditoria[];
  eventosRegistrados: number;
}

export interface ResultadoTransmision {
  ok: boolean;
  recursos: number;
  mensaje: string;
}

/**
 * Contrato de la "ventanilla" de datos.
 * Cualquier fuente (JSON local hoy, servidor FHIR mañana) debe ofrecer estas funciones.
 */
export interface FuenteDatos {
  obtenerCarga(): Promise<DatosCarga>;
  /** Guarda en memoria el lote ya leído y analizado en el navegador. */
  cargarLote(lote: Lote): Promise<void>;
  /** Vuelve a los datos de demostración. */
  descartarLote(): Promise<void>;
  /** Filas listas para el Bundle: conformes + casos resueltos (solo con lote real). */
  obtenerFilasCuradas(): Promise<{ fila: FilaLote; decision: DecisionCaso }[] | null>;
  obtenerCola(): Promise<ColaLimpieza>;
  obtenerEstadosCasos(): Promise<Record<string, EstadoCaso>>;
  obtenerTerminologia(): Promise<Terminologia>;
  guardarCaso(id: string, decision: DecisionCaso): Promise<void>;
  descartarCaso(id: string): Promise<void>;
  aplicarPatron(): Promise<number>;
  obtenerMapeos(): Promise<DatosMapeos>;
  guardarRegla(regla: ReglaMapeo): Promise<ReglaMapeo>;
  eliminarRegla(id: string): Promise<void>;
  obtenerExportacion(): Promise<DatosExportacion>;
  transmitirBundle(url: string, token: string): Promise<ResultadoTransmision>;
}
