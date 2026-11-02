# Music Corner 0.3.0

Publicación preparada el 2 de noviembre de 2026.

## Novedades

- **Lista de canciones:** abre el panel «Canciones» junto a los controles y cambia de pista con un clic o con Tab e Intro/Espacio. Muestra título, artista y la canción actual cuando está identificada. El botón aparece solo si el reproductor admite MPRIS TrackList; la lista puede contener solo parte de su cola.
- **Abre tu reproductor:** pulsa la carátula o el título para llevarlo al frente cuando admita la acción MPRIS Raise.
- **Letras con recuperación:** hasta tres intentos ante fallos de carga y un botón de recarga para volver a intentarlo. Los errores no se guardan en caché.
- **Mejoras de visualización:** la tarjeta mantiene la composición al abrirse sobre aplicaciones a pantalla completa y ajusta el espacio de letras y canciones según el monitor y la escala.

Se mantienen los controles desde la esquina, la barra de progreso, las letras opcionales, los temas y el atajo Ctrl+Alt+M. La actualización conserva el UUID y los ajustes existentes.

## Compatibilidad y privacidad

GNOME Shell 45–50; pruebas de ejecución realizadas en GNOME Shell 50 sobre Wayland. Las versiones 45–49 conservan la compatibilidad declarada, sin pruebas de ejecución en esta entrega. Las funciones disponibles dependen de las capacidades MPRIS del reproductor.

Las letras se consultan en LRCLIB solo al activarlas, enviando título, artista, álbum y duración disponibles. Las carátulas remotas se descargan desde la URL proporcionada por el reproductor. Sin telemetría.

## Archivos de publicación

- Para extensions.gnome.org: `dist/music-companion@alanpro.dev.shell-extension.zip`.
- Copia versionada para adjuntar a una publicación en GitHub: `dist/music-corner-0.3.0.shell-extension.zip`.
- Sumas de comprobación de ambos paquetes: `dist/SHA256SUMS`.

Título sugerido para GitHub: **Music Corner 0.3.0 — lista de canciones y mejoras de letras**. Etiqueta prevista: `v0.3.0`.

La descripción de la ficha está actualizada en `src/metadata.json`. El informe de verificación y la huella del paquete están en [publication-review.md](publication-review.md). Las capturas del README son de una versión anterior y aún muestran el nombre Music Companion.

## Subida

En [extensions.gnome.org](https://extensions.gnome.org/upload/), inicia sesión con la cuenta propietaria y sube el ZIP con el UUID original. Si ya existe la extensión, usa su ficha para enviar la actualización. Revisa la descripción y las condiciones antes de enviar; la revisión de GNOME determina su aprobación.

Para GitHub, usa las novedades y la compatibilidad de este documento como cuerpo de la publicación y adjunta el ZIP versionado con `SHA256SUMS`. Publica la etiqueta sobre el commit que incluya todos los cambios de esta entrega.

Esta preparación no crea etiquetas ni publicaciones remotas y no instala la extensión en la sesión habitual.
