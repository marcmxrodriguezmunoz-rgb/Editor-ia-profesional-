# Editor IA Profesional

Primera versión funcional de un editor semiautomático para TikTok, Reels y fuentes de vídeo largas. Next.js + TypeScript, composición y vista previa con Remotion, FFmpeg y SQLite. **Aplicación local de un solo usuario; no es un editor autónomo profesional terminado.**

## Inicio rápido

Requisitos: Node.js **22.13 o posterior** (recomendado 24 LTS), npm, FFmpeg y FFprobe en el PATH, Chromium/Chrome y espacio en disco. Comprobado en Linux con Node 24.22, FFmpeg y Chromium. En macOS se pueden instalar FFmpeg y Chromium con el gestor de paquetes habitual; Windows requiere que sus ejecutables estén en PATH.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abre **http://127.0.0.1:3000**. La primera visita crea una demo gráfica de 30 segundos con subtítulos de muestra, contador, zoom y sonido; se identifica como demostración. No necesitas una clave para subir vídeos, editar, importar palabras o exportar.

La exportación necesita un navegador. Configura `CHROME_PATH` en `.env.local` si usas uno instalado; por ejemplo `/usr/bin/chromium` en Linux. Si lo omites, Remotion intentará descargar Chrome Headless Shell la primera vez. Mantén el servidor activo durante el renderizado. El renderizador es local, sin infraestructura ni despliegues de pago.

Para producción local:

```bash
npm run build
npm start
```

Ejecuta desde la raíz del repositorio con las dependencias de desarrollo instaladas: el worker utiliza `tsx`. No uses un alojamiento estático ni funciones serverless: se necesitan disco persistente, procesos Node de larga duración y Chromium. `APP_ORIGIN` debe coincidir con la URL utilizada, incluido puerto y protocolo. El servidor escucha en loopback por defecto; **no tiene autenticación ni aislamiento entre usuarios**.

## Qué funciona

- Subida por streaming de MP4/MOV, máximo 250 MB y 30 minutos. FFprobe valida la fuente y FFmpeg la normaliza a H.264/AAC, 30 fps, como máximo 1920 píxeles por lado. MOV depende de que FFmpeg pueda decodificar su códec; la extensión por sí sola no garantiza compatibilidad.
- Reproducción del original y vista previa Remotion del montaje con recorte central a 9:16.
- Línea de tiempo con clips y pistas de texto, contador, zoom y sonido. Selecciona un elemento y modifica sus tiempos/propiedades en el inspector; no hay arrastre de bordes ni reordenación con el ratón en esta versión.
- Cortes por rangos, recorte de clips, textos con entrada animada, zoom suave, contador de horas que descuenta segundos reales y volumen original ajustable.
- Tres sonidos locales originales: reloj, pop y whoosh. Son golpes únicos, no bucles de reloj. Contador y sonido son elementos independientes.
- Subtítulos por palabra: importación JSON, edición de texto y tiempos, resaltado sincronizado con la fuente y conservación de la sincronía tras los cortes.
- Guardado manual en SQLite, preferencias y reglas por proyecto; deshacer/rehacer de sesión. Las instrucciones guardan primero los cambios pendientes. Detección de conflictos entre revisiones.
- Exportación local asíncrona a MP4 H.264/AAC, **1080 × 1920, 30 fps**, con progreso y descarga. Cada render usa una copia inmutable del montaje.
- Cuatro perfiles reutilizables: educativa, retos, emprendimiento y lifestyle/cine. Cambian el acento visual y orientan las propuestas, no aplican automáticamente un estilo cinematográfico completo.

## Instrucciones sin API

El modo local usa una gramática limitada y explícita, no un modelo de IA. Tiempos en segundos del **montaje final**, con resolución de 1/30 s. No reconoce todas las formas de lenguaje natural. Ejemplos:

```text
En el segundo 25, añade un contador de 24 horas y un sonido de reloj
En el segundo 5, añade zoom 1.3x durante 3 segundos
En el segundo 1, añade texto «Una gran idea» durante 4 segundos
En el segundo 3, añade sonido whoosh
Corta del segundo 2 al 4
```

El ejemplo del segundo 25 necesita un montaje de más de 25 segundos (la demo sirve). La duración predeterminada es 5 segundos, acotada al final del vídeo. Los sonidos se limitan a un segundo. Un corte elimina el intervalo de salida, mueve/acorta los efectos y conserva las marcas originales de los subtítulos. Al recortar manualmente un clip, ajusta los efectos que queden fuera del montaje; no se guardan documentos inválidos. Ante un ajuste inválido, la vista previa conserva la última composición válida.

## Transcripción e IA opcionales

Configura **solo en `.env.local`** y reinicia el servidor:

```dotenv
OPENAI_API_KEY=
AI_MODEL=gpt-4o-mini
```

No compartas claves por chat, commits o variables `NEXT_PUBLIC_*`. No hay ninguna clave incluida.

- **Transcribir mediante API**: FFmpeg extrae audio MP3 mono; el adaptador llama a `whisper-1` con `verbose_json` y marcas por palabra. Envía audio a OpenAI y puede generar costes. La respuesta se valida antes de guardarla. Audio máximo 24 MB; sin audio, sin clave o ante un error, muestra el fallo y no inventa una transcripción.
- **OpenAI API**, en el selector del asistente: envía instrucciones, transcripción, reglas y metadatos de composición al modelo. No envía imágenes ni el vídeo. Devuelve operaciones JSON validadas y una propuesta que debes revisar y aplicar. Su validez estructural no garantiza calidad editorial.
- **Proponer montaje**: en modo local ejecuta reglas conservadoras; en modo API coordina cinco responsabilidades mediante una única llamada. Son roles dentro del coordinador, no cinco modelos autónomos ni cinco agentes que inspeccionan el vídeo.

Las integraciones de API están implementadas y sus errores/formato se prueban con respuestas simuladas. **No se validaron contra el servicio real: este entorno no tiene claves configuradas.** No existe transcripción automática offline. Puedes trabajar completamente sin API importando palabras JSON:

```json
[
  { "text": " Hola", "startMs": 100, "endMs": 500, "timestampMs": 300, "confidence": null },
  { "text": " mundo", "startMs": 500, "endMs": 1000, "timestampMs": 750, "confidence": null }
]
```

Tiempos en milisegundos relativos al vídeo fuente normalizado, no al montaje. Conserva el espacio antes de cada palabra. Se admite el formato `Caption` de Remotion; no se importa SRT en esta versión. Ejemplo también en [docs/captions.example.json](docs/captions.example.json).

## Datos y recursos

`.data/editor.sqlite` guarda proyectos (documento versión 1), preferencias, reglas, revisiones y trabajos. `.data/media/` guarda fuentes normalizadas; `.data/exports/` guarda MP4. Los originales temporales se eliminan después de convertir. Estos datos no se añaden a Git. Haz copias de `.data` con la aplicación detenida; no hay migraciones ni limpieza automática de medios/exportaciones aún.

`public/assets/` contiene sonidos sintetizados, dedicados a CC0. Regeneración determinista: `npm run assets`. No se han extraído efectos de CapCut ni usado grabaciones de terceros. [Licencias y procedencia](public/assets/LICENSE.md). El catálogo `src/domain/assets.ts` prepara la clasificación de futuros recursos; no hay buscador de imágenes, música, b-roll ni extracción de patrones desde referencias todavía. Revisa la [licencia de Remotion](https://www.remotion.dev/license) antes de un uso comercial sujeto a sus condiciones.

## Validación

```bash
npm run typecheck
npm test
npm run build
# Chromium instalado o navegador de Playwright:
CHROME_PATH=/usr/bin/chromium npm run test:e2e
# Alternativa a un Chromium local:
npx playwright install --with-deps chromium
npm run test:e2e
# Studio de la composición de demostración:
npm run studio
```

Studio: http://localhost:3001. La edición de proyectos vive en la aplicación y en SQLite; Studio muestra la plantilla de demostración. No escribe los proyectos de la aplicación en JSX.

Las pruebas de navegador generan sus propios vídeos sintéticos MP4/MOV con FFmpeg; no descargan contenido de terceros ni llaman a IA. Comprueban subida, persistencia, el ejemplo del segundo 25, edición de subtítulos, recorte, rangos HTTP, validación de orígenes y exportación real con dimensiones, duración y pista de audio verificadas con FFprobe. Guardan capturas en `test-results/` y un MP4 en `.data/fixtures/rendered.mp4`. El test de exportación puede tardar varios minutos en equipos modestos. El entorno CI instala Chromium y FFmpeg, sin despliegues.

## Límites y próxima fase

El análisis de narrativa, detección de escenas/silencios, selección de mejores tomas, seguimiento del sujeto, música, mezcla avanzada, gráficos semánticos y extracción de estilos de vídeos de referencia **no están implementados**. El supervisor actual valida rangos y emite avisos básicos; no verifica automáticamente la corrección de lo que se dice ni la calidad profesional del resultado.

Prioridades siguientes: transcripción local o por lotes con reintentos; análisis visual y sonoro con propuestas trazables; editor de pistas con arrastre, transiciones y capas; biblioteca con metadatos de licencias; cola persistente con cancelación/recuperación y limpieza; pruebas con material largo y real. Antes de acceso remoto: autenticación, permisos, límites globales de trabajos, almacenamiento privado y aislamiento de renderizado. La v0.1 no está probada para carga concurrente o renderizados largos de 30 minutos.

[Arquitectura y contratos](docs/architecture.md) · [Estado verificable](docs/validation.md)
