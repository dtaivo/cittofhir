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

export interface DatosCarga {
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
  sospechaDuplicado: { con: string; similitud: number; segundos: number } | null;
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
  totalPendientes: number;
  resueltosPrevios: number;
  filtros: { todos: number; snomed: number; duplicados: number };
  casos: Caso[];
  patron: { lote: string; casos: number; error: string };
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
  registrarArchivo(nombre: string, tamanoBytes: number): Promise<void>;
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
