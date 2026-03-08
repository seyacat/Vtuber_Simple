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

// Load calibration data from localStorage
function loadCalibrationFromLocalStorage() {
    try {
        const storageKey = 'vtube_calibration';
        const calibrationData = localStorage.getItem(storageKey);
        
        if (!calibrationData) {
            console.log('No calibration data found in localStorage');
            return null;
        }
        
        const parsedData = JSON.parse(calibrationData);
        
        // Check if we have any sessions
        if (!parsedData.sessions || parsedData.sessions.length === 0) {
            console.log('No calibration sessions found in localStorage');
            return null;
        }
        
        // Get the most recent session (last in array)
        const latestSession = parsedData.sessions[parsedData.sessions.length - 1];
        
        if (!latestSession.vowels || Object.keys(latestSession.vowels).length === 0) {
            console.log('No vowel data in latest calibration session');
            return null;
        }
        
        // Extract fingerprints from the latest session
        const vowelFingerprints = {};
        for (const [vowel, data] of Object.entries(latestSession.vowels)) {
            if (data.fingerprint && Array.isArray(data.fingerprint) && data.fingerprint.length === 5) {
                vowelFingerprints[vowel] = data.fingerprint;
            }
        }
        
        if (Object.keys(vowelFingerprints).length === 0) {
            console.log('No valid fingerprints found in calibration data');
            return null;
        }
        
        console.log(`Loaded calibration data from localStorage for vowels: ${Object.keys(vowelFingerprints).join(', ')}`);
        return { vowelFingerprints };
        
    } catch (error) {
        console.error('Error loading calibration from localStorage:', error);
        return null;
    }
}

// Load configuration from config.json and localStorage
export async function loadConfig() {
    // First try to load calibration from localStorage
    const localStorageConfig = loadCalibrationFromLocalStorage();
    
    // Then load from config.json
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
    
    // Merge configurations with priority: localStorage > config.json > defaults
    // Start with default config
    let mergedConfig = { ...config };
    
    // Apply config.json overrides
    mergedConfig = { ...mergedConfig, ...fileConfig };
    
    // Apply localStorage calibration overrides (only vowelFingerprints)
    if (localStorageConfig && localStorageConfig.vowelFingerprints) {
        // Only override vowelFingerprints from localStorage
        mergedConfig.vowelFingerprints = {
            ...mergedConfig.vowelFingerprints,
            ...localStorageConfig.vowelFingerprints
        };
        console.log('Applied calibration data from localStorage');
    }
    
    // Update global config
    config = mergedConfig;
    console.log('Final configuration loaded:', config);
}