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
| `/carga` | 1. Carga y Diagnóstico | Arrastrar un archivo o usar el teclado; ver errores si el archivo no es .xlsx/.xls/.csv, está vacío o supera 20 MB; filtrar hallazgos; ver el esquema; descargar el reporte CSV |
| `/limpieza` | 2. Limpieza Guiada | Elegir casos de la cola, completar el formulario y guardar. Si falta un campo, aparece un resumen de errores. Además: alertas que no bloquean el guardado, zoom de la imagen y vista FHIR en vivo |
| `/mapeos` | Configuración de Mapeos SNOMED/LOINC (ventana) | Buscar, filtrar, activar o desactivar el auto-mapeo, asignar el código pendiente y crear, editar o eliminar reglas. El código se valida con su dígito verificador |
| `/confirmacion` | 3. Confirmación y Exportación | Transmitir (simulado) con validación de URL y token. Para ver el estado de error, escribe una URL que contenga `error`. También: descargar el Bundle JSON y revisar la auditoría de la sesión |

"Visor Citológico" y "Auditoría & Logs" aparecen en el menú del diseño, pero no tienen pantalla diseñada todavía. Por eso muestran un aviso.

---

## Lo que es "de mentira" en este prototipo

### Datos
- Todos los números, casos, láminas, nombres (por ejemplo "Dra. V. Morales") y eventos de auditoría son **sintéticos**. Están en `src/data/*.json`.
- **El archivo que subes no se lee.** Solo se revisan su nombre, tipo y tamaño. El diagnóstico (1,420 registros, 148 alertas, etc.) siempre es el mismo.
- Los cambios (casos resueltos, reglas nuevas) se guardan **solo en memoria**. Al recargar la página, todo vuelve al estado inicial.
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
- Descargas: el **Bundle JSON es real** (se arma con los casos que resolviste). El "Excel curado" se entrega como **.csv**. El paquete **Parquet no existe**.
- El enlace "Docs HL7/LOINC" abre la documentación pública de FHIR R4.
- "Comparar con #LAM-…" muestra la misma imagen reflejada. No compara imágenes de verdad.

---

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
