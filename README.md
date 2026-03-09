# Vtuber Simple (Programmatic Mouth)

A standalone browser-based tool for real-time vowel detection and programmatic mouth animation using microphone input. Ideal for simple VTuber setups using OBS.

## 🔗 Live Demos (GitHub Pages)

- **[🎙️ Dashboard & Calibración (index.html)](https://seyacat.github.io/Vtuber_Simple/index.html)**
- **[👄 Boca VTuber para OBS (boca.html)](https://seyacat.github.io/Vtuber_Simple/boca.html)**

---

## 👄 Boca Dinámica (`boca.html`)
Esta es la interfaz pensada para ser capturada e integrada en OBS (U otra herramienta de streaming).
- **Fondo Transparente**: Al ser agregada como *Browser Source* en OBS, el fondo es invisible.
- **Sin Botones Intrusivos**: No tiene UI visible, muestra exclusivamente la animación de la boca.
- **Animación Vectorial (SVG)**: La boca cambia de forma interpolando matemáticamente curvas de Bézier cúbicas entre un estado neutral y los visemas detectados (A, E, I, O, U).
- **Apertura por Volumen**: La boca se abre o cierra de forma progresiva según la energía pura del audio en decibelios (Volumen RMS).
- **Modo Debug y Monitor**: Si accedes a `boca.html?debug=1`, se habilita una interfaz de control que incluye un **Monitor de Audio con Latencia**, el cual retrasa el audio que escuchas en tus auriculares para sincronizarlo perfectamente con el retraso natural de la detección visual.

## 🎙️ Panel de Control (`index.html`)
Es el panel de diagnóstico, calibración y testeo del motor de audio.
- Visualización en tiempo real de la forma de onda (Osciloscopio).
- Panel de depuración que muestra el Nivel de Volumen, el Flujo Espectral (cambios de frecuencia), y las distancias acústicas calculadas.
- **Calibración Guiada**: El sistema permite calibrar la red de detección de fonemas (A, E, I, O, U) pidiéndote que pronuncies cada vocal, guardando tu "huella acústica" personal en el caché local (`localStorage`).

## ⚙️ ¿Cómo Funciona el Motor? (`mel-core.js`)
El sistema analiza el audio en tiempo real usando **Mel Filterbanks**. 
A diferencia de los detectores básicos de formantes, este algoritmo:
1. Convierte el espectro de frecuencias usando una escala logarítmica (Mel), similar a cómo escucha el oído humano.
2. Extrae una firma o "huella digital" acústica (un vector matemático) en cada frame de tiempo de tu voz.
3. Lo compara con las huellas de referencia guardadas (A, E, I, O, U) usando la distancia Euclidiana, seleccionando la vocal ganadora ("Best Match").
4. Utiliza detección de ataque vocal (Vocal Attack) analizando tanto las subidas repentinas de volumen como los cambios abruptos en la composición armónica (Spectral Flux) para saber exactamente cuándo empieza una sílaba nueva.
5. Emplea un algoritmo de calibración de piso de ruido (Dynamic Noise Floor) que se adapta automáticamente a tu entorno para ignorar el ruido de fondo o los ventiladores.

## 📡 Integración con OBS vía WebSocket (Audio Streaming)
La aplicación soporta recibir audio en crudo directamente desde un plugin de OBS u otra fuente local, bypaseando la necesidad de seleccionar un micrófono físico en el navegador.

Para activarlo, debes pasar el parámetro `?port=` en la URL apuntando al puerto donde tu plugin está emitiendo el websocket:
- Ejemplo: `index.html?port=9904`
- Ejemplo: `boca.html?port=9904`

**Beneficios de esta integración:**
- **Latencia Optimizada**: El audio en crudo (`Float32Array`) se inyecta directamente al `AudioContext` usando buffers nativos de la Web Audio API.
- **Sin Eco**: El stream entrante es redirigido a las rutinas de análisis (FFT/Gain) pero es silenciado (`gain.value = 0`) antes de llegar al master de salida de tus auriculares.
- **Requiere Interacción**: Por políticas de "Autoplay" de los navegadores modernos, iniciar mediante WebSocket requiere que el usuario haga clic manualmente en "Start Microphone" o interactúe con el documento una vez cargado.
