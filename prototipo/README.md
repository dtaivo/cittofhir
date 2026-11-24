# ParaFHIR · Prototipo navegable

Prototipo web de **ParaFHIR / CittoFHIR Data Curator**, construido a partir del diseño de alta fidelidad hecho en Stitch.
Sirve para **ver y probar el flujo completo** (cargar un lote, limpiarlo y exportarlo). Todavía **no** procesa datos reales.

> ⚠️ **Todos los datos son inventados.** Ningún dato corresponde a pacientes reales.

---

## Cómo ejecutarlo

Necesitas **Node.js 18 o superior** (es el mismo que usas para el proyecto de tu tutora).

En la ventana de comandos (cmd), escribe cada línea por separado y presiona Enter:

```bash
cd C:\Users\usuario\cittofhir\prototipo
npm install
npm run dev
```

- `npm install` se hace **solo la primera vez**. Descarga las piezas que el prototipo necesita.
- `npm run dev` enciende el prototipo y abre el navegador en `http://localhost:5173`.
- Para apagarlo: `Ctrl + C` en la ventana de comandos.

Mientras está encendido, si cambias un archivo y lo guardas, la página se actualiza sola.

Otros comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | Revisa que el código no tenga errores de tipos (como un control de calidad) |
| `npm run catalogo` | Lee `data/Repositorio.xlsx` y busca el código SNOMED de cada especie (genera `src/data/catalogo.json`) |
| `npm run verificar-codigos` | Comprueba en un servidor de terminología que cada código SNOMED CT y LOINC exista y tenga el nombre oficial correcto |
| `npm run build` | Genera la versión final optimizada en la carpeta `dist/` |

---

## Qué pantallas tiene

| Ruta | Pantalla | Qué puedes probar |
|---|---|---|
| `/carga` | 1. Carga y Diagnóstico | Descargar la plantilla .xlsx, completarla y cargarla. Se calcula el diagnóstico real. Si la planilla trae datos personales, columnas faltantes o un formato no válido, aparece un error. También puedes filtrar hallazgos, ver el esquema y descargar el reporte |
| `/limpieza` | 2. Limpieza Guiada | Elegir casos de la cola, completar el formulario y guardar. Si falta un campo, aparece un resumen de errores. Además: alertas que no bloquean el guardado, zoom de la imagen y vista FHIR en vivo |
| `/mapeos` | Configuración de Mapeos SNOMED/LOINC (ventana) | Buscar, filtrar, activar o desactivar el auto-mapeo, asignar el código pendiente y crear, editar o eliminar reglas. El código se valida con su dígito verificador |
| `/confirmacion` | 3. Confirmación y Exportación | Transmitir (simulado) con validación de URL y token. Para ver el estado de error, escribe una URL que contenga `error`. También: descargar el Bundle JSON y revisar la auditoría de la sesión |

"Visor Citológico" y "Auditoría & Logs" aparecen en el menú del diseño, pero no tienen pantalla diseñada todavía. Por eso muestran un aviso.

---

## Lo que es "de mentira" en este prototipo

### Datos
- Todos los números, casos, láminas, nombres (por ejemplo "Dra. V. Morales") y eventos de auditoría son **sintéticos**. Están en `src/data/*.json`.
- Mientras no cargues una planilla, la app muestra **datos de demostración**: 1,420 registros, la Dra. V. Morales y la cola de ejemplo. Un aviso en la pantalla de Carga indica si estás viendo la demo o tu planilla.
- **Tu planilla sí se lee de verdad**, pero **solo dentro del navegador** (ver "Planillas de muestras" más abajo).
- Los cambios (casos resueltos, reglas nuevas) se guardan **solo en memoria**. Al recargar la página, se borran, incluida la planilla.
- El nombre del operador en la auditoría es siempre "Dra. V. Morales". Cuando exista el login (Cloudflare Access), será el correo de la persona que inició sesión.
- Los **códigos SNOMED CT y LOINC son reales** (ver la sección "Códigos clínicos" más abajo). Lo inventado son los *casos* a los que se aplican.
- Las imágenes de microscopía fueron generadas por el diseño en Stitch. No son muestras reales.

### Seguridad
- **No hay inicio de sesión** ni control de quién puede hacer qué.
- El "token OAuth2" que aparece en Exportación es un texto de ejemplo y no se envía a ningún lugar.
- "Anonimización HIPAA / GDPR OK" y "TLS v1.3 Conectado" son solo textos del diseño. No se comprueba nada.
- El "checksum SHA-256" **sí se calcula de verdad**, pero solo sobre el JSON que se descarga.

### Integraciones
- **No hay conexión con un servidor FHIR.** El botón "Transmitir" espera un momento y muestra un resultado simulado.
- **La app no consulta servidores de terminología mientras se usa.** La lista de códigos está guardada en `src/data/terminologia.json` y se verifica aparte con `npm run verificar-codigos`.
- "Importar diccionario" solo valida el tipo de archivo. No agrega reglas.
- Descargas: el **Bundle JSON** y el **Excel curado (.xlsx)** se generan de verdad a partir de tu planilla (con la demo, el Excel sale como .csv). El paquete **Parquet no existe**.
- El enlace "Docs HL7/LOINC" abre la documentación pública de FHIR R4.
- "Comparar con #LAM-…" muestra la misma imagen reflejada. No compara imágenes de verdad.

---

## Planillas de digitalización

### El formato

La app lee la **planilla de seguimiento de láminas digitalizadas (WSI)** del laboratorio: una fila por lámina y 30 columnas. En la pantalla de Carga, **"Descargar plantilla .xlsx"** entrega la planilla vacía con 3 filas de ejemplo (para borrar) y una hoja **Instrucciones**.

| Columna | ¿Obligatoria? | Qué hace la app con ella |
|---|---|---|
| **Código** | Sí | Identificador de la lámina (`Specimen` y `Media.identifier`). Detecta códigos repetidos |
| **Tax** | Sí | Código del catálogo `Repositorio.xlsx` (ej. `tax-017` = *Giardia duodenalis*) → código **SNOMED CT** de la especie |
| Nombre WSI | No | Título de la imagen (`Media.content.title`). Si falta el Tax, intenta deducir la especie desde este nombre |
| Institución | No | `Observation.performer` |
| **Tipo muestra** | Sí | Elige el examen **LOINC**: heces 10704-5 · heces concentrado 10701-1 · sangre / gota gruesa 17784-0 · aspirado 106048-2 · LBA 106047-4 · otro (biopsia, piel, vector…) 673-4 |
| Estado evolutivo | No* | Estadio con código SNOMED (trofozoíto, quiste, ooquiste, amastigote, microfilaria, esquizonte…). Para **huevo, larva y adulto** usa el código del grupo: nematodo, cestodo o trematodo |
| Digitalizada | No | `Media.status` (Sí → completed, No → preparation) |
| Evaluación Alan / Evaluación Armin | No | Control de calidad: avisa si **no coinciden**. **No** van a FHIR |
| Solicitud Reescaneo / Link resscaneo | No | Avisa si se pidió reescaneo y **no hay link** |
| Link NDP.serve | No | `Media.content.url` |
| Aprobadas / Ingresadas / Respaldadas / Ingreso RPMV Público | No | Avisa si una lámina está **ingresada sin estar aprobada**, o **en RPMV público sin estar ingresada** |
| Equipo | No | `Media.device` |
| Encargado digitalización | No | Solo queda en el Excel curado. **No** va a FHIR (minimización de datos personales del equipo) |
| Fecha digitalización | No | `Media.createdDateTime`. Avisa si es inválida o futura |
| Tamaño (GB) | No | `Media.content.size` (en bytes) |
| Width / Height (pixeles), n° Z | No | `Media.width`, `Media.height`, `Media.frames`. Avisa si no son números |
| Aumento | No* | 10x, 20x, 40x, 60x, 100x |
| Tamaño en disco, Resolución, Espaciado, Rango de enfoque, Tiempo de digitalización, Formato | No | Notas del recurso `Media` |

\* No es obligatoria para cargar la planilla, pero si falta, la fila queda **por revisar** en Limpieza Guiada.

### Libro con varias pestañas

La planilla del equipo puede tener **dos pestañas**: una con las láminas (las 30 columnas) y otra con el catálogo de parásitos (`Tax`, `Clasificacion`, …, `Especie`, …, `Host`, igual que `Repositorio.xlsx`). No importa el orden ni el nombre de las pestañas:

- La app **revisa todas las pestañas** y reconoce sola cuál tiene las láminas (porque tiene `Código`, `Tax` y `Tipo muestra`) y cuál el catálogo (porque tiene `Tax`, `Especie` y `Clasificacion`).
- Los encabezados pueden estar **más abajo de la fila 1**, por ejemplo si hay un título arriba. Se buscan en las primeras 15 filas.
- Si viene el catálogo, la app lo usa para interpretar los códigos `Tax`. Si un taxón del archivo tiene otro nombre o no existe en el catálogo de la app, busca su código SNOMED por nombre o sinónimo, y lo avisa.
- Los **hipervínculos** se guardan con su dirección (URL), no con el texto visible. Las fechas y fórmulas de Excel se leen con su valor.
- En la pantalla de Carga aparece qué pestaña se usó para cada cosa.

La plantilla descargable ya incluye la pestaña **Tax** con el catálogo y el código SNOMED de cada especie.

Los nombres de columna se reconocen **sin importar tildes ni mayúsculas**. Los valores Sí/No aceptan también "si", "x", "1", "aprobada", "no", "0", "rechazada". Formatos aceptados: **.xlsx** y **.csv** (UTF-8). El **.xls** antiguo hay que guardarlo como .xlsx.

### Qué hace la app con la planilla

1. **La lee dentro del navegador.** El archivo **no se envía a ningún servidor** y se borra al recargar o cerrar la página.
2. **Rechaza la planilla completa** si encuentra columnas de datos de pacientes (nombre, paciente, RUT, dirección, teléfono, correo, fecha de nacimiento, ficha clínica) o **un RUT o correo en cualquier celda**.
3. **Clasifica cada fila** en una de estas categorías de hallazgo:
   - **Especie:** Tax inexistente, sin código SNOMED o vacío.
   - **Estadio / aumento:** faltan o no se reconocen.
   - **Duplicado:** el mismo Código aparece en más de una fila.
   - **Formato:** faltan datos obligatorios, hay fechas inválidas o números mal escritos.
   - **Control de calidad del flujo:** evaluaciones distintas, reescaneo sin link, ingresada sin aprobación, etc.
4. Las filas **sin problemas** van directo al Bundle. Las demás forman la cola de **Limpieza Guiada**.
5. **En el Bundle FHIR**, cada lámina genera un recurso **Media** (la imagen y su digitalización) y un recurso **Observation** (el hallazgo), que apunta al Media.

## Códigos clínicos (SNOMED CT y LOINC)

Los códigos del diseño de Stitch **no eran reales**: los SNOMED no existían y los LOINC correspondían a otros exámenes (por ejemplo, 622-1 es "bacterias en esputo"). Se reemplazaron por códigos reales, verificados el 24-11-2026 contra el servidor público de terminología `tx.fhir.org` (SNOMED CT edición internacional y LOINC).

| Qué | Dónde se usa en FHIR | Ejemplo |
|---|---|---|
| Examen (LOINC), según el tipo de muestra | `Observation.code` | Heces: **10704-5** · Sangre: **17784-0** |
| Organismo (SNOMED), lo más específico posible | `Observation.valueCodeableConcept` | *Giardia duodenalis* **78181009**; si es quiste: **608948005** "Giardia lamblia cyst" |
| Estadio (SNOMED genérico) | `Observation.component` | Trofozoíto: **103551003** |
| Tinción (SNOMED) | `Observation.method` | Giemsa: **104208006** |

### Catálogo de especies (desde `Repositorio.xlsx` de la tutora)

La lista de especies de la app sale del catálogo `data/Repositorio.xlsx` (162 parásitos y vectores). El comando `npm run catalogo` lo lee y busca el **código SNOMED CT real** de cada especie, que guarda en `src/data/catalogo.json`:

- **152 de 162** tienen código. Para los géneros ("Taenia spp.") se usa el concepto de género ("Taenia", "Genus Fasciola").
- Algunos se encontraron **por sinónimo** del catálogo (por ejemplo *Hymenolepis nana* → "Rodentolepis nana"). En la pantalla aparecen con una alerta ámbar.
- **10 quedan sin código** porque SNOMED no tiene un nombre exacto: *E. moshkovskii*, el complejo *histolytica/dispar/moshkovskii/bangladeshi*, el complejo *Adenocephalus/Dibothriocephalus*, *Taenia asiatica*, *Leishmania donovani*, Filariae, *Paragonimus westermani* y las 3 *Mepraia*. Estas no se ofrecen en la lista hasta que se les asigne un código a mano.
- Los **18 códigos LOINC** recomendados en el catálogo existen todos.

Si cambias el Excel, vuelve a ejecutar `npm run catalogo` (tarda unos minutos).

**Por revisar por una profesional clínica** (aparecen con alerta ámbar en la pantalla):
- *Lugol directo* y *examen en fresco*: SNOMED no tiene un concepto exacto. Se usaron "wet mount with simple stain" (104195008) y "wet and dry mount, for ova and parasites" (104223001).
- *Larva*: no hay un código genérico. Solo existe el específico de *Ascaris lumbricoides* (609064008).

**Cómo mantenerlos al día:** cada vez que cambies `terminologia.json` o `mapeos.json`, ejecuta `npm run verificar-codigos`. Debe terminar con "N de N códigos correctos". El script solo envía *códigos*, nunca datos de pacientes.

**Licencias:** LOINC es gratuito aceptando su licencia. SNOMED CT requiere licencia para uso en producción: confírmala con tu institución.

---

## Decisiones técnicas, explicadas en simple

| Decisión | En palabras simples | Por qué |
|---|---|---|
| **React** | Arma la página con piezas reutilizables, como un formulario clínico hecho de secciones estándar | Cada tarjeta, campo o ventana se escribe una vez y se reutiliza |
| **Vite** | El "motor" que muestra la página en tu computadora y la recarga al instante | Es rápido y simple de configurar |
| **TypeScript** | Revisa que cada dato tenga la forma correcta, como un control de calidad antes de liberar un resultado | Detecta errores (un campo mal escrito, un dato faltante) antes de que lleguen a la pantalla |
| **Tailwind** | Una lista de "estilos con nombre" (colores, tamaños, espacios) | Los colores, letras y espacios del diseño de Stitch se copiaron **exactos** a `tailwind.config.js`. Así la página se ve igual al diseño |
| **Datos en JSON + "ventanilla"** | Toda pantalla pide datos a una sola ventanilla (`src/api/index.ts`). Hoy la ventanilla lee archivos JSON | Cuando exista un servidor real, se escribe otra fuente que cumpla el mismo contrato (`FuenteDatos`) y se cambia **una sola línea**. Las pantallas no se tocan |
| **Validaciones separadas** (`src/lib/validacion.ts`) | Las reglas de "qué es un dato válido" están en un solo lugar | Se pueden revisar con un experto clínico sin leer el resto del código |
| **Errores vs. alertas** | **Error** (rojo) = no deja guardar. **Alerta** (ámbar) = deja guardar, pero avisa | Igual que en el laboratorio: un dato faltante detiene el proceso; una discrepancia se informa y la decide el profesional |

### Accesibilidad
- Todo se puede usar **solo con teclado**: `Tab` para moverse, `Enter` para guardar, `Esc` para cerrar ventanas y `Alt + ↓/↑` para cambiar de caso.
- Hay un enlace oculto "Saltar al contenido principal" que aparece al presionar `Tab`.
- Cada campo tiene su **etiqueta**. Los errores se anuncian a los lectores de pantalla y el foco salta al resumen de errores.
- Las ventanas emergentes **retienen el foco** y lo devuelven al botón que las abrió.
- Los colores siguen el diseño, que usa tonos oscuros sobre fondos claros (alto contraste). Se agregó un **anillo de foco visible** en cian.
- Si el sistema pide "reducir movimiento", se desactivan las animaciones.

### Tamaños de pantalla
- **Escritorio** (≥ 1024 px): menú lateral fijo, como en el diseño.
- **Tablet** (768–1023 px): el menú lateral se oculta y se abre con el botón ☰. Las columnas se apilan.

---

## Estructura de carpetas

```
prototipo/
├── public/img/          Logo e imágenes de microscopía
├── src/
│   ├── api/             La "ventanilla" de datos (tipos + fuente local)
│   ├── data/            Datos sintéticos en JSON
│   ├── components/      Piezas reutilizables (encabezado, ventanas, campos…)
│   ├── lib/             Validaciones, generador FHIR, utilidades
│   ├── pages/           Un archivo por cada pantalla del diseño
│   └── state/           Información compartida entre pantallas
└── tailwind.config.js   Colores, tipografía y espacios del diseño
```

## Cómo conectar un backend real (más adelante)

1. Crear `src/api/fuenteServidor.ts` que cumpla la interfaz `FuenteDatos` de `src/api/tipos.ts` (por ejemplo, llamando al servidor Express del proyecto principal).
2. En `src/api/index.ts`, cambiar `fuenteLocal` por `fuenteServidor`.

## Planilla de prueba

`ejemplos/planilla_de_prueba.xlsx` tiene **dos pestañas**, como la del equipo: «Digitalización», con 13 láminas **inventadas** y las 30 columnas del formato, y «Tax», con el catálogo. Las láminas traen errores a propósito:
- un Tax que no existe y otro sin código SNOMED;
- una fila sin Tax y un código de lámina repetido;
- evaluaciones que no coinciden y un reescaneo sin link;
- una lámina ingresada sin aprobación;
- una fecha imposible, un ancho que no es número y una fila sin Código.

Sirve para ver cómo responde cada pantalla.
