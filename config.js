// Configuration - Mel Filterbank & Detection
export let config = {
    audio: {
        sampleRate: 16000,
        bufferSize: 4096,
        fftSize: 4096,
        minFrequency: 80,
        maxFrequency: 8000,
        gain: 4.0
    },
    detection: {
        confidenceThreshold: 0.12,
        smoothingWindow: 10,
        noiseFloorMargin: 8.0,
        maxEuclideanDistance: 2.0,
        lerpAttackDown: 0.5,
        lerpDecayUp: 0.001
    },
    labels: ["A", "E", "I", "O", "U"]
};

// Load configuration from config.json
export async function loadConfig() {
    let fileConfig = {};
    try {
        // Añade un timestamp para evitar la caché del navegador al leer el JSON
        const response = await fetch('./config.json?t=' + Date.now());
        if (response.ok) {
            fileConfig = await response.json();
            console.log('Configuration loaded from config.json');
        } else {
            console.warn('Could not load config.json, using default configuration');
        }
    } catch (error) {
        console.warn('Error loading config.json:', error, 'Using default configuration');
    }
    
    // Merge profundo de la configuración
    config = { 
        audio: { ...config.audio, ...(fileConfig.audio || {}) },
        detection: { ...config.detection, ...(fileConfig.detection || {}) },
        labels: fileConfig.labels || config.labels
    };
    
    console.log('Final configuration loaded:', config);
}