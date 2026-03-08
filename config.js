// Configuration - Fingerprint con 5 bandas
export let config = {
    audio: {
        sampleRate: 16000,
        bufferSize: 4096,
        fftSize: 4096,
        minFrequency: 80,
        maxFrequency: 3000
    },
    // 5 bandas de frecuencia para fingerprint de alta resolución
    fingerprintBands: [
        { name: "B1", range: [200, 400] },    // Muy baja frecuencia (F1 bajo)
        { name: "B2", range: [400, 800] },    // Baja frecuencia (F1 medio-alto)
        { name: "B3", range: [800, 1200] },   // Frecuencia media (F2 bajo)
        { name: "B4", range: [1200, 1800] },  // Frecuencia media-alta (F2 medio)
        { name: "B5", range: [1800, 2500] }   // Alta frecuencia (F2 alto)
    ],
    // Fingerprints de referencia para cada vocal (5 valores normalizados)
    
  "vowelFingerprints": {
    "A": [
      0.509,
      0.291,
      0.196,
      0.004,
      0
    ],
    "E": [
      0.828,
      0.166,
      0.005,
      0,
      0
    ],
    "I": [
      0.972,
      0.028,
      0,
      0,
      0
    ],
    "O": [
      0.769,
      0.187,
      0.043,
      0,
      0
    ],
    "U": [
      0.795,
      0.203,
      0.003,
      0,
      0
    ]
  },

    detection: {
        confidenceThreshold: 0.12,
        smoothingWindow: 12,
        minVolumeDb: -70,
        noiseFloor: 0.005
    },
    labels: ["A", "E", "I", "O", "U", "noise"]
};

// Load configuration from config.json
export async function loadConfig() {
    try {
        const response = await fetch('./config.json');
        if (!response.ok) {
            console.warn('Could not load config.json, using default configuration');
            return;
        }
        const loadedConfig = await response.json();
        // Merge loaded config with defaults
        config = { ...config, ...loadedConfig };
        console.log('Configuration loaded from config.json:', config);
    } catch (error) {
        console.warn('Error loading config.json:', error, 'Using default configuration');
    }
}