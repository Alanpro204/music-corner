# Arquitectura del MVP

## Componentes

- `extension.js` coordina el ciclo de vida, el indicador de la barra y el atajo Ctrl+Alt+M.
- `triggers/hotCorner.js` registra una zona de 12 × 12 unidades del escenario en la esquina superior izquierda del monitor principal. Usa eventos de entrada/salida y un temporizador de permanencia. No consulta periódicamente el cursor. Suprime la esquina de Actividades correspondiente cuando GNOME reconstruye las esquinas y la restaura al desactivarse, sin cambiar preferencias del escritorio.
- `ui/playerCard.js` muestra una tarjeta St sobre las ventanas. La tarjeta se ancla al origen del monitor, sin márgenes ni borde superior/izquierdo. El botón de reproducir/pausar ocupa las primeras 72 × 72 unidades de estilo, incluida la esquina exacta. Al abrir, la tarjeta se eleva por encima del sensor para que el clic alcance el botón sin mover el cursor. Un clic primario en el sensor antes del retardo abre la tarjeta y ejecuta la acción al soltar, evitando una doble activación. La salida del puntero programa el cierre; abrir mediante teclado utiliza un grab modal de GNOME y conserva el menú hasta Escape, clic exterior o cierre explícito.
- `mpris/client.js` descubre nombres MPRIS y observa `NameOwnerChanged`. Los proxies reciben actualizaciones de propiedades, incluidas las invalidadas. Todas las consultas y acciones desde Shell son asíncronas y cancelables. La selección manual se conserva hasta que desaparece ese reproductor; la selección automática favorece uno que esté reproduciendo.
- `ui/progress.js` presenta un deslizador nativo accesible y los tiempos. Actualiza la vista cada 250 ms solo mientras el menú está abierto; agrupa las pulsaciones de teclado y confirma el arrastre al soltar. El cliente lee `Position` al abrir y cuando cambian estado/metadatos, escucha `Seeked` y estima el avance con reloj monotónico y `Rate`, sin consultar D-Bus periódicamente. Envía `SetPosition` con el identificador de pista; si el reproductor no lo publica, refresca `Position` y usa `Seek` con un desplazamiento relativo. Descarta búsquedas si cambia el reproductor o la canción, comparando también título, artista, álbum y duración. Sin duración o `CanSeek`, la barra es solo informativa.
- `ui/lyrics.js` coloca un `St.ScrollView` antes de la información de la canción. Cada 100 ms, mientras está visible y el menú abierto, busca la frase activa en los timestamps con una búsqueda binaria y usa la posición MPRIS estimada para mantener la sincronía con pausa, velocidad y saltos. Desplaza suavemente el ajuste vertical, respeta la lectura manual y retoma seguimiento cuando la frase vuelve a la zona central. El botón de retorno y las flechas/RePág/AvPág permiten usarlo con teclado.
- `lyrics/service.js` consulta `/api/get` de LRCLIB mediante Soup 3 con título, artista, álbum y duración; limita la respuesta a 512 KiB, usa un timeout de 12 s y conserva hasta 32 resultados en memoria. Cancela peticiones anteriores y la vista descarta resultados obsoletos mediante una generación. `lyrics/lrc.js` interpreta timestamps, offsets, repeticiones y líneas simultáneas; letras sin timestamps se presentan como texto sin sincronización.
- `ui/artwork.js` carga imágenes locales o HTTP(S) de forma asíncrona, limita los datos a 2 MiB y cancela la carga anterior al cambiar de canción. Conserva la carátula y el color anteriores hasta que la nueva carga termina. Una carátula ausente no bloquea los controles.
- `prefs.js` usa GTK4/libadwaita en un proceso aparte. Los tiempos, el atajo y cinco colores se guardan en GSettings. Los selectores de color actualizan el menú en vivo y permiten restaurar la paleta original.
- `ui/palette.js` valida los colores hexadecimales y deriva los colores de interacción y el contraste del icono de reproducción. `ui/theme.js` interpola la paleta durante 200 ms y aplica estilos directamente a los actores de la tarjeta, sin recargar el tema global de GNOME Shell. Las esquinas mantienen su forma redondeada.

## Ciclo de vida

`disable()` desconecta señales, cancela consultas D-Bus y descargas, elimina temporizadores, libera el grab de teclado, destruye actores y retira el atajo. Los resultados asíncronos comprueban la vigencia de sus objetos antes de actualizar la interfaz. La extensión funciona en la sesión de usuario; GNOME la desactiva al bloquearse.

## Accesibilidad

Los controles tienen nombres accesibles, foco visible y tamaños mínimos de 44 unidades de estilo (72 para reproducir/pausar en la esquina y 56 para el botón central). Los controles no disponibles se desactivan. El acceso por teclado permite recorrer el menú sin depender de la esquina. Los retardos se ajustan en preferencias.

## Verificación y límites

Las pruebas usan un bus privado y GNOME Shell 50 con monitor virtual. Comprueban descubrimiento inicial y dinámico, cambios de estado y metadatos, capacidades, selección manual, desaparición de reproductores, ratón y teclado, restauración de Actividades y limpieza. Se comprueba la carga de carátulas locales, la sincronización de ambos botones de reproducción, los cambios de color en vivo y el guardado/restablecimiento desde preferencias.

La primera versión actúa sobre el monitor principal. No incluye volumen ni soporte para otros escritorios. Queda pendiente probar reproductores reales, varios monitores y escalado fraccional en uso cotidiano. El contrato MPRIS de pruebas no reproduce audio.
