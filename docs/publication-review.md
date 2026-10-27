# Revisión previa a publicación de Music Corner

Fecha: 27 de octubre de 2026. Versión: 0.2.0. Destino declarado: GNOME Shell 45–50. Validación ejecutada: GNOME Shell 50.

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
| Metadatos                | Nombre Music Corner, UUID válido music-companion@alanpro.dev, GNOME 45–50, sin versión numérica impuesta ni modos de sesión adicionales.                  |
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
- URL de soporte configurada en metadata.json: https://github.com/Alanpro204/music-corner (repositorio facilitado por el autor).
- Revisar con el autor la procedencia de cualquier código o recurso externo y añadir atribuciones si corresponde. El paquete no incluye las carátulas ni las letras utilizadas durante la ejecución.
- El autor debe comprender y poder explicar el código presentado, de acuerdo con la regla sobre asistencia de IA de las directrices.
- Iniciar sesión en extensions.gnome.org, revisar los campos y condiciones del formulario autenticado y subir el ZIP cuando se decida publicar.

## Paquete

Archivo: dist/music-companion@alanpro.dev.shell-extension.zip

SHA-256: 1cb416bc3089820bf235d311b93677e54e44364ccd50cbc69ee941c51651e951

Esta revisión no equivale a la aprobación de GNOME ni a una validación completa con reproductores reales.

## Ampliación de compatibilidad

Por indicación del autor, metadata.json declara GNOME Shell 45, 46, 47, 48, 49 y 50. La compatibilidad con 45–49 se asume; no se ha ejecutado la extensión en esas versiones. La revisión anterior y los resultados de ejecución corresponden a GNOME 50. Se ha añadido detección de las APIs de ScrollView para el ajuste vertical y el contenedor de letras de GNOME 45.

GNOME 44 y anteriores no se incluyen: usan el sistema de módulos anterior a ESM y requieren otra implementación. Referencia: [migración a GNOME 45](https://gjs.guide/extensions/upgrading/gnome-shell-45.html).

Tras ampliar la compatibilidad, lint, formato, sintaxis, esquemas, LRC y MPRIS pasaron. La primera sesión de pruebas de Shell no cargó la extensión dentro del plazo; la repetición sin modificar el código pasó, incluidas las preferencias y la limpieza. Las versiones 45–49 permanecen sin pruebas de ejecución.
