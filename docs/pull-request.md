# feat: primera versión funcional del editor audiovisual

El repositorio estaba vacío. Esta implementación permite subir MP4/MOV, preparar el vídeo con FFmpeg, editar una composición vertical y exportarla como MP4 1080 × 1920 desde una aplicación Next.js local.

Incluye Player y render compartidos de Remotion, línea de tiempo editable mediante inspector, cortes con subtítulos ligados a la fuente, textos animados, contador, zoom y sonidos originales CC0. Los proyectos, preferencias, reglas y trabajos se guardan en SQLite con control de revisiones; el render usa un snapshot inmutable y un worker separado.

El asistente local interpreta instrucciones acotadas, incluido el ejemplo del segundo 25. Los adaptadores opcionales de Whisper/OpenAI generan transcripciones por palabra y propuestas JSON revisables. Los cinco perfiles de agentes son responsabilidades de un coordinador; no hay análisis visual autónomo. La demo, las reglas locales y los resultados de API se identifican en la interfaz.

Validación local: TypeScript, 13 pruebas de dominio/persistencia/proveedor, compilación de producción y 3 pruebas Playwright. Se ha renderizado un MP4 real con cortes, subtítulos, contador, zoom y sonido; FFprobe confirma 1080 × 1920, H.264, 30 fps, audio y duración esperada. Se revisaron capturas de escritorio/móvil y fotogramas del render.

Límites: aplicación de un usuario en loopback, sin autenticación ni infraestructura cloud; las API reales no se comprobaron por falta de credenciales. No incluye detección de escenas, música, mezcla avanzada, extracción de estilos desde referencias, arrastre en la línea de tiempo o cola durable de producción. README y docs/architecture.md explican instalación, contratos, licencias y siguiente fase. No incorpora claves ni despliegues.
