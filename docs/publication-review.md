# Revisión previa a publicación de Music Corner

Fecha: 2 de noviembre de 2026. Versión: 0.3.0. Destino declarado: GNOME Shell 45–50. Validación ejecutada: GNOME Shell 50 sobre Wayland.

## Resultado

Entrega preparada para subir a extensions.gnome.org o adjuntar a una publicación de GitHub. No se ha enviado ningún archivo ni creado una publicación o etiqueta remota. La aprobación de GNOME corresponde a su equipo de revisión.

Las [notas de la versión](release-notes-0.3.0.md) describen las novedades y los archivos que se deben adjuntar. `package.json`, `package-lock.json` y `metadata.json` identifican la versión 0.3.0. Se conserva el UUID `music-companion@alanpro.dev` y el esquema de ajustes.

## Cambios revisados

| Área                     | Resultado y evidencia                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista de canciones       | Panel lateral accesible; título, artista y pista actual; detección de HasTrackList, consulta de metadatos en bloques de 100 y selección con GoTo. Reacciona a cambios de lista y de reproductor. Se oculta cuando no hay soporte. |
| Solicitudes obsoletas    | Revisión de la lista y vigencia del reproductor antes de aplicar resultados. Cancelación al retirar reproductores o destruir el cliente.                                                                                          |
| Apertura del reproductor | Carátula y título respetan CanRaise; la tarjeta libera su captura modal antes de enviar Raise.                                                                                                                                    |
| Letras                   | Tres intentos ante fallos, caché solo de resultados válidos, cancelación y botón de recarga accesible.                                                                                                                            |
| Composición              | Inhibición de unredirect al abrir la tarjeta; restauración al cerrarla o destruirla, sin acumular inhibiciones al reabrir.                                                                                                        |
| Desactivación            | Retirada de señales, temporizadores, atajo, captura y actores; cancelación de consultas y restauración de la esquina de Actividades.                                                                                              |
| Red                      | Consultas asíncronas y cancelables; letras limitadas a 512 KiB y 12 segundos por intento. Carátulas limitadas a 2 MiB. Sin telemetría.                                                                                            |
| Metadatos                | Descripción actualizada con TrackList, Raise y recuperación de letras; misma identidad y compatibilidad declarada. Sin versión numérica impuesta por el proyecto.                                                                 |
| Distribución             | JavaScript legible, CSS, metadatos, esquema XML y COPYING. Sin herramientas de desarrollo, dependencias npm ni capturas.                                                                                                          |
| Licencia                 | GPL-2.0-or-later; COPYING incluido en el ZIP.                                                                                                                                                                                     |

## Verificación ejecutada

- `npm run check`: ESLint, Prettier, sintaxis JavaScript/Python y compilación estricta del esquema GSettings.
- `npm test`: parser LRC, servicio de letras con recuperación/caché/cancelación, contrato MPRIS y cliente con bus privado, interfaz GNOME Shell 50 y preferencias GTK4.
- La prueba de Shell comprueba esquina, ratón y teclado, controles, búsqueda, TrackList, Raise, letras con respuestas deterministas, temas, composición, preferencias y desactivación/reactivación.
- Las pruebas de integración se ejecutaron fuera del sandbox para permitir sockets D-Bus y el compositor virtual. Usan un bus y una sesión de pruebas aislados.
- El simulador provoca un error `GetTracksMetadata: Metadata unavailable` para comprobar la recuperación. Los avisos de servicios de la sesión aislada no hicieron fallar las pruebas. Registro de Shell: `.dev/shell-smoke.log`.
- ZIP reconstruido para 0.3.0: integridad CRC, metadatos, licencia, esquema y correspondencia con los archivos de `src/` comprobados. La copia versionada contiene los mismos bytes.

## Paquete

Archivo para GNOME: `dist/music-companion@alanpro.dev.shell-extension.zip`.

Copia para GitHub: `dist/music-corner-0.3.0.shell-extension.zip`.

SHA-256 de ambos: `30251e45b1fd7aac660ebde39e711ccde960d153e874d8b749aa6f3287cb12fa`.

Sumas: `dist/SHA256SUMS`.

## Límites de la validación

- GNOME 45–49 conserva la compatibilidad declarada por decisión del autor; esta entrega se ha ejecutado solo en GNOME 50.
- Las pruebas usan reproductores simulados y respuestas de letras deterministas. Queda pendiente validar reproductores reales y una consulta real a LRCLIB.
- Queda pendiente comprobar bloqueo/desbloqueo, varios monitores y escalado fraccional en un escritorio real. La prueba de composición comprueba el equilibrio de las llamadas; no sustituye una prueba visual sobre una aplicación real a pantalla completa.
- Las capturas del README muestran una versión anterior con el nombre Music Companion; no ilustran el nuevo panel Canciones.

## Referencias de publicación

Consultadas el 2 de noviembre de 2026:

- [Directrices de revisión de GNOME](https://gjs.guide/extensions/review-guidelines/review-guidelines.html): inicialización estática, activación y limpieza, código distribuido y revisión del autor.
- [Estructura y metadatos de una extensión](https://gjs.guide/extensions/overview/anatomy.html): ZIP, UUID, compatibilidad y versión pública.
- [Formulario de subida](https://extensions.gnome.org/upload/): destino de la entrega; los campos y condiciones autenticados deben revisarse al enviar.

El autor debe revisar la procedencia de recursos externos, añadir atribuciones cuando corresponda y comprender el código que presenta. El paquete no incluye las carátulas ni las letras consultadas durante su uso. Esta revisión local no equivale a la aprobación de GNOME.
