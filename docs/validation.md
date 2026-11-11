# Validación de la v0.1

Ejecutada el 11 de noviembre de 2026 en Linux, Node 24.22.1, FFmpeg y Chromium locales. Sin claves de API ni llamadas reales a proveedores de IA.

| Comprobación                                     | Resultado                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run typecheck`                              | Correcto; genera tipos de rutas y comprueba TypeScript           |
| `npm test`                                       | 13 pruebas correctas                                             |
| `npm run build`                                  | Compilación de producción correcta, sin advertencias del código  |
| `npm run format:check`                           | Correcto                                                         |
| `CHROME_PATH=/usr/bin/chromium npm run test:e2e` | 3 pruebas correctas, sin saltos; última ejecución completa ~43 s |

Las pruebas de navegador cubren la instrucción del segundo 25, guardado y recarga, rechazo de solicitudes no compatibles, vista móvil sin desbordamiento horizontal, subida MP4/MOV, importación y edición de subtítulos, cortes y gráficos, descarga y rangos HTTP. Se captura cualquier error JavaScript en la prueba de vídeo.

El vídeo de prueba se genera con FFmpeg (barras/patrón y tono, sin contenido de terceros). Se monta una fuente de cuatro segundos, se elimina el segundo 1 al 2 y se añaden subtítulos, texto animado, contador, zoom y sonido. El archivo exportado se valida con FFprobe:

- Vídeo H.264, 1080 × 1920, 30/1 fps.
- Pista de audio presente.
- Duración aproximada: 3.008 s (tolerancia del contenedor/audio).
- Fotograma exportado inspeccionado visualmente: texto y contador incrustados en el vídeo.

Además, se inició la compilación con `npm start` en el puerto 3002 y almacenamiento aislado. Se comprobó subida, guardado, creación de trabajo y descarga de una exportación de un segundo: H.264 1080 × 1920 y AAC, duración 1.003 s.

Se inspeccionaron capturas de escritorio y de 390 px de ancho, el Player de Remotion y su plantilla en Studio. Las capturas y el MP4 de prueba se regeneran en `test-results/` y `.data/fixtures/`, excluidos de Git.

Los tests de proveedor usan `fetch` simulado para verificar rechazo de JSON inválido y ausencia de clave. Eso no acredita disponibilidad, coste, calidad lingüística o tiempos de la API real. Tampoco se ha validado calidad editorial profesional, vídeos reales largos, múltiples usuarios, despliegue remoto o recuperación de una cola distribuida.

La integración continua está preparada en `.github/workflows/ci.yml`; no se ha ejecutado en GitHub todavía.
