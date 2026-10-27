# Revisión previa a publicación de Music Corner

Fecha: 27 de octubre de 2026. Versión: 0.2.0. Destino: GNOME Shell 50.

## Fuentes consultadas

- [Formulario de subida](https://extensions.gnome.org/upload/): redirige al inicio de sesión. No se han podido inspeccionar los campos autenticados ni se ha enviado ningún archivo.
- [Directrices de revisión](https://gjs.guide/extensions/review-guidelines/review-guidelines.html): referencia para ciclo de vida, importaciones, metadatos, esquemas, contenido del paquete y licencia. La aprobación corresponde al equipo de revisión de GNOME.

## Resultado de la inspección del proyecto

| Área                     | Resultado y evidencia                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicialización           | Los módulos contienen importaciones, funciones, clases y datos estáticos. Los objetos GObject se crean desde el ciclo de activación.                      |
| Desactivación            | extension.js retira el atajo, desconecta ajustes y destruye sensor, tarjeta, cliente e indicador.                                                         |
| Señales y temporizadores | Revisados hotCorner, playerCard, progress, lyrics y theme. Se retiran fuentes y señales externas; las señales de widgets propios terminan al destruirlos. |
| D-Bus                    | Cliente asíncrono, solicitudes cancelables, retirada de suscripción y desconexión de proxies.                                                             |
| Red                      | Soup asíncrono y cancelable para carátulas y letras; límites de tamaño y tiempo; abortado al destruir los servicios.                                      |
| Separación de procesos   | Gtk, Gdk y Adw solo en prefs.js. prefs.js comparte palette.js, que no importa bibliotecas de Shell. GdkPixbuf se usa para imágenes en Shell.              |
| Código distribuido       | JavaScript legible; sin minificación, ejecutables, scripts Python, dependencias npm, telemetría, acceso al portapapeles ni subprocessos.                  |
| Metadatos                | Nombre Music Corner, UUID válido music-companion@alanpro.dev, GNOME 50, sin versión numérica impuesta ni modos de sesión adicionales.                     |
| GSettings                | XML incluido, nombre/base de esquema y ruta coherentes; compilación estricta sin errores.                                                                 |
| Licencia                 | GPL-2.0-or-later elegida por el titular; identificadores SPDX en JS, CSS y XML; texto GPL-2 incluido en COPYING.                                          |
| Nombre                   | Búsqueda del catálogo oficial con Music Corner, cuatro páginas: sin coincidencia exacta. No constituye una reserva de nombre ni una revisión de marcas.   |
| Cambios de escritorio    | hotCorner sustituye la esquina de Actividades del monitor principal; al destruirse la reconstruye desde la configuración actual, sin modificarla.         |

## Correcciones realizadas

- Incorporada la licencia y su inclusión explícita mediante gnome-extensions pack.
- Corregido el rótulo MUSIC COMPANION que permanecía en la tarjeta.
- Ampliada la descripción pública para explicar controles, atajo, letras opcionales, consultas a LRCLIB, carátulas remotas y sustitución temporal de Actividades.
- Mantenido el UUID y el esquema para conservar la identidad y los ajustes existentes.

## Verificación

- npm run check: ESLint, Prettier, sintaxis JavaScript/Python y esquema GSettings.
- npm test: parser LRC, servidor y cliente MPRIS, interfaz GNOME Shell 50 y preferencias GTK4.
- Las pruebas GNOME usan un monitor virtual de 1280 × 720, bus privado y reproductores simulados. Se comprueban esquina, controles, búsqueda, teclado, letras con respuestas deterministas, preferencias y desactivación/reactivación.
- Inspección del ZIP: integridad CRC, 17 archivos, COPYING y XML presentes, bytes idénticos a src/, sin archivos de desarrollo.
- Los avisos de servicios de la sesión aislada (portales, IBus, fondo, GVfs y PipeWire) no hicieron fallar las pruebas. No se observaron JS ERROR de la extensión.

## Pendiente antes de dar por cerrada la validación

- Probar con reproductores reales y con una consulta real a LRCLIB; las pruebas de letras usan respuestas simuladas.
- Comprobar bloqueo/desbloqueo de sesión, varios monitores y escalado fraccional en un escritorio real.
- Añadir una URL pública de soporte a metadata.json cuando exista un repositorio. Actualmente no hay remoto Git configurado; no se ha inventado una URL.
- Revisar con el autor la procedencia de cualquier código o recurso externo y añadir atribuciones si corresponde. El paquete no incluye las carátulas ni las letras utilizadas durante la ejecución.
- El autor debe comprender y poder explicar el código presentado, de acuerdo con la regla sobre asistencia de IA de las directrices.
- Iniciar sesión en extensions.gnome.org, revisar los campos y condiciones del formulario autenticado y subir el ZIP cuando se decida publicar.

## Paquete

Archivo: dist/music-companion@alanpro.dev.shell-extension.zip

SHA-256: debd34afb6808824cb16ef8a2c9637a4f8aed5c8384d522366a52e3d4f1127a9

Esta revisión no equivale a la aprobación de GNOME ni a una validación completa con reproductores reales.
