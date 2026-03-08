// Configuration - Fingerprint con 5 bandas
export let config = {
    audio: {
        sampleRate: 16000,
        bufferSize: 4096,
        fftSize: 4096,
        minFrequency: 80,
        maxFrequency: 3000
    },
    // Removed 5-band fingerprint and vowel dynamic bands configurations for LPC.

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
    let fileConfig = {};
    try {
        const response = await fetch('./config.json');
        if (response.ok) {
            fileConfig = await response.json();
            console.log('Configuration loaded from config.json');
        } else {
            console.warn('Could not load config.json, using default configuration');
        }
    } catch (error) {
        console.warn('Error loading config.json:', error, 'Using default configuration');
    }
    
    // Merge configurations
    config = { ...config, ...fileConfig };
    console.log('Final configuration loaded:', config);
}