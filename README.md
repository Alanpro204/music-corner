# Music Corner

Extensión para **GNOME Shell 50 / Wayland**, desarrollada con JavaScript (GJS), St y D-Bus/MPRIS.

El MVP abre una tarjeta musical al mantener el cursor **200 ms en la esquina superior izquierda del monitor principal**. La tarjeta queda pegada a los bordes superior e izquierdo, con reproducir/pausar justo bajo el cursor: **llegar a la esquina → clic → pausar o continuar**, sin moverlo otra vez. Si haces clic antes de los 200 ms, abre y ejecuta la acción inmediatamente, una sola vez. También puedes abrirla con **Ctrl+Alt+M** o desde el icono musical de la barra, que puede ocultarse en Preferencias.

- Título, artista, carátula y estado de reproducción.
- Anterior, retroceder, reproducir/pausar, adelantar y siguiente, respetando las capacidades del reproductor. Los botones de reproducción de la esquina y del centro están sincronizados. Avance y retroceso saltan 5 segundos por defecto; el intervalo común se ajusta de 1 a 300 segundos en Preferencias y se aplica al instante.
- Barra de progreso con tiempo transcurrido y duración. Haz clic o arrastra para saltar; con el foco en la barra, usa las flechas izquierda/derecha. Si falta duración o el reproductor no permite buscar, funciona solo como indicador. También permite buscar en reproductores que no publican el identificador de la pista, como G4Music.
- Botón de letras junto a Preferencias. Al activarlo, las letras ocupan el centro y la información de la canción queda debajo. La frase actual se resalta y se centra suavemente; puedes leer otras partes con rueda, barra de scroll o flechas/RePág/AvPág. El seguimiento se pausa al alejarte y se retoma al volver a la frase actual o pulsar «Volver a la frase actual».
- Las letras se consultan en [LRCLIB](https://lrclib.net/docs) solo cuando la función está activada, enviando título, artista, álbum y duración disponibles. Hay una caché en memoria de hasta 32 canciones, cancelación al cambiar de pista y estados para instrumental, texto sin sincronización, ausencia de letras o fallo de conexión. No todas las canciones tienen letras sincronizadas.
- Selección automática del reproductor en reproducción y selección manual desde el desplegable.
- Cierre al salir del menú (350 ms), con Escape, con el botón de cierre o haciendo clic fuera.
- Navegación con Tab, Mayús+Tab y activación con Espacio/Intro. Al abrir con teclado, el menú permanece abierto hasta cerrarlo explícitamente.
- Preferencias para ajustar los tiempos de apertura/cierre, mostrar u ocultar el icono de la barra y elegir entre cinco temas predefinidos, colores personalizados o un tema que toma el color de la carátula de la canción actual. Los cambios se aplican al instante.
- La carátula llena un cuadrado mediante recorte centrado, sin franjas laterales, y muestra esquinas redondeadas. Si falta, aparece un icono musical y el tema de carátula usa los colores de Medianoche.

Mientras está activa, la extensión sustituye la esquina de Actividades del monitor principal. Al desactivarla, reconstruye las esquinas según los ajustes actuales de GNOME, sin escribir en ellos. Actividades sigue disponible desde su botón y la tecla Super.

## Empezar

En la carpeta del proyecto:

```bash
nvm use
npm ci
npm run doctor
npm run dev
```

`nvm use` es opcional si ya tienes Node 24. Node se usa para las herramientas de desarrollo; **GNOME ejecuta la extensión con GJS**, sin Node ni npm en producción.

`npm run dev` abre **Mutter Development Kit** con un escritorio de pruebas. Incluye la extensión y un reproductor MPRIS simulado sin audio. Sus ajustes, extensión instalada y bus D-Bus están separados de la sesión normal. El kit utiliza la sesión gráfica y PipeWire del usuario para mostrar la ventana. Cierra esa ventana o pulsa `Ctrl+C` para terminar. Los registros se guardan en `.dev/dev.log`.

Después de editar el código, cierra el escritorio de pruebas y ejecuta de nuevo `npm run dev`: GNOME conserva los módulos JavaScript cargados y desactivar/reactivar una extensión no basta para recargar sus archivos.

## Dependencias

Se necesita una sesión GNOME 50 sobre Wayland, GJS, Python 3, Node 22.13+ (recomendado 24), npm, D-Bus, las herramientas `gnome-extensions`, `gnome-shell-test-tool`, `gsettings`, `gdbus` y Mutter Devkit. `npm run doctor` comprueba su disponibilidad.

En este equipo el kit de Mutter está extraído en `.tools/mutter`, sin instalación global. Para obtenerlo de nuevo en Ubuntu:

```bash
npm run setup:devkit
```

Este comando descarga `mutter-dev-bin` desde los repositorios APT configurados y lo extrae dentro del proyecto. Necesita que sus bibliotecas de ejecución ya estén disponibles. Como alternativa, puedes instalar el paquete del sistema:

```bash
sudo apt install mutter-dev-bin
```

Con la copia local puede aparecer en el registro un aviso de que falta `/usr/libexec/mutter-devkit`: Mutter intenta esa ruta primero y el lanzador del proyecto abre después la copia local. Ese aviso es esperado; el lanzador comprueba además que la extensión haya quedado activada.

En otras distribuciones instala el paquete que proporcione `mutter-devkit`. La extensión está dirigida a GNOME 50; no declara compatibilidad con versiones aún no comprobadas.

## Comandos

| Comando                 | Resultado                                                    |
| ----------------------- | ------------------------------------------------------------ |
| `npm run doctor`        | Diagnóstico del entorno                                      |
| `npm run check`         | ESLint, formato y sintaxis                                   |
| `npm run format`        | Formatear los archivos                                       |
| `npm run build`         | ZIP instalable en `dist/`                                    |
| `npm run dev`           | Escritorio visual de pruebas y reproductor simulado          |
| `npm test`              | Pruebas reales de D-Bus/MPRIS y ciclo de vida en GNOME Shell |
| `npm run test:lyrics`   | Timestamps LRC, offsets, traducciones y búsqueda de frase    |
| `npm run test:mpris`    | Solo la prueba MPRIS en un bus privado                       |
| `npm run test:shell`    | Solo GNOME Shell con monitor virtual, sin ventana            |
| `npm run mpris:list`    | Listar reproductores de la sesión desde la que se ejecuta    |
| `npm run mpris:mock`    | Publicar el reproductor simulado en ese mismo bus            |
| `npm run install:local` | Instalar el ZIP en la sesión habitual del usuario            |
| `npm run logs`          | Seguir los registros de GNOME de la sesión habitual          |

Las pruebas de Shell necesitan poder crear sockets locales y acceder al entorno gráfico de ejecución; pueden requerir salir de un sandbox restrictivo. El modo sin ventana usa renderizado por software. Los registros completos de esa prueba quedan en `.dev/shell-smoke.log`.

El reproductor simulado permite probar anterior, siguiente, reproducción, pausa y cambios de metadatos. Simula el avance del tiempo, la velocidad y los saltos de posición, pero no reproduce audio; no pretende sustituir las pruebas con reproductores reales. Los reproductores de tu sesión habitual **no aparecen** en el bus privado de `npm run dev`.

## Archivos

```text
src/
  extension.js                 Ciclo de vida de GNOME
  metadata.json                Identidad y versión compatible
  stylesheet.css               Estilos de GNOME Shell
  prefs.js                     Preferencias GTK4/libadwaita
  schemas/                     Tiempos y atajo en GSettings
  ui/playerCard.js              Tarjeta y navegación accesible
  ui/progress.js               Barra, tiempos y búsqueda accesible
  ui/lyrics.js                  Letras, sincronización y scroll manual/automático
  lyrics/lrc.js                 Parser LRC y búsqueda de la frase actual
  lyrics/service.js             Consulta cancelable a LRCLIB y caché
  ui/artwork.js                 Carátulas asíncronas y cancelables
  ui/palette.js                 Colores y estilos de interacción
  ui/theme.js                   Aplicación de colores en vivo
  triggers/hotCorner.js         Esquina, permanencia y restauración
  mpris/client.js               Descubrimiento, selección y controles
  mpris/constants.js           Nombres del protocolo compartidos
tools/
  dev.py                       Diagnóstico, paquete y sesión de desarrollo
  mock-player.js               Reproductor MPRIS simulado
  run-mock.js                  Ejecución y cierre del simulador
  mpris-probe.js               Diagnóstico de reproductores disponibles
tests/
  lyrics-test.js               Tiempos LRC, offsets y búsqueda de frase
  mpris-smoke.js               Contrato D-Bus y señales del simulador
  client-smoke.js              Varios reproductores, capacidades y cierre
  shell-smoke.js               Ratón, teclado, controles y ciclo de vida
  prefs-smoke.js               Construcción de preferencias GTK4
docs/architecture.md           Arquitectura del MVP
```

## Alcance y verificación

Se han probado el protocolo y el cliente con reproductores simulados en un bus privado, y la interfaz con dispositivos virtuales de ratón y teclado dentro de GNOME Shell 50. Las pruebas comprueban apertura desde la esquina, pausa/reanudación sin mover el cursor, clic antes del retardo, botones, atajo, Tab, Escape, desaparición del reproductor, restauración de Actividades, carátula local, preferencias y búsqueda mediante clic, arrastre y teclado. Las pruebas de letras usan respuestas deterministas y verifican el botón, la disposición, saltos de posición, scroll manual, reanudación del seguimiento y descarte de respuestas de canciones anteriores.

La carátula acepta `file://`, HTTP y HTTPS, con un máximo de 2 MiB. Si no se puede cargar, aparece un icono musical. El MVP no incluye control de volumen. La compatibilidad con reproductores reales, otros factores de escala y configuraciones de varios monitores requiere validación manual; la esquina se limita al monitor principal.

## Instalar en tu escritorio habitual

El flujo de desarrollo no instala ni activa automáticamente la extensión en tu escritorio habitual. Cuando quieras hacerlo:

```bash
npm run check
npm test
npm run install:local
```

Cierra sesión y vuelve a entrar para que GNOME descubra la extensión o cargue sus archivos actualizados. Después:

```bash
gnome-extensions enable music-companion@alanpro.dev
```

Para desactivarla o desinstalarla:

```bash
gnome-extensions disable music-companion@alanpro.dev
gnome-extensions uninstall music-companion@alanpro.dev
```

## Referencias

- [Entorno de desarrollo de extensiones GNOME](https://gjs.guide/extensions/development/creating.html)
- [Depuración y recarga de extensiones](https://gjs.guide/extensions/development/debugging.html)
- [Cambios y herramienta de pruebas de GNOME 50](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- [Especificación MPRIS](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html)

## Licencia

Music Corner se distribuye bajo GPL-2.0-or-later (GNU GPL versión 2 o cualquier versión posterior). El texto completo está en [src/COPYING](src/COPYING) y se incluye en el ZIP.
