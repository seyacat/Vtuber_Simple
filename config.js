// Configuration - Fingerprint con 5 bandas
let config = {
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
    vowelFingerprints: {
        "A": [0.3, 0.4, 0.2, 0.1, 0.0],  // Energía concentrada en B1-B3
        "E": [0.1, 0.2, 0.1, 0.3, 0.3],  // Energía en B4-B5 (frecuencias altas)
        "I": [0.0, 0.1, 0.1, 0.2, 0.6],  // Máxima energía en B5
        "O": [0.2, 0.3, 0.4, 0.1, 0.0],  // Energía en B2-B3
        "U": [0.4, 0.3, 0.2, 0.1, 0.0]   // Similar a A pero más en B1
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
async function loadConfig() {
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

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { config, loadConfig };
}