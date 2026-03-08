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
      "A": [0.290, 0.257, 0.227, 0.219, 0.006],
      "E": [0.411, 0.347, 0.046, 0.042, 0.154],
      "I": [0.657, 0.235, 0.000, 0.000, 0.108],
      "O": [0.393, 0.355, 0.252, 0.000, 0.000],
      "U": [0.525, 0.392, 0.083, 0.000, 0.000]
    },

    // Dynamic bands for each vowel (populated from calibration)
    vowelDynamicBands: {
        "A": [
            { name: "B1", range: [195, 345], centerFreq: 270, expectedEnergy: 0.338 },
            { name: "B2", range: [468, 618], centerFreq: 543, expectedEnergy: 0.161 },
            { name: "B3", range: [1124, 1274], centerFreq: 1199, expectedEnergy: 0.076 },
            { name: "B4", range: [1398, 1548], centerFreq: 1473, expectedEnergy: 0.001 },
            { name: "B5", range: [2738, 2888], centerFreq: 2813, expectedEnergy: 0.002 }
        ],
        "E": [
            { name: "B1", range: [202, 352], centerFreq: 277, expectedEnergy: 0.324 },
            { name: "B2", range: [343, 493], centerFreq: 418, expectedEnergy: 0.156 },
            { name: "B3", range: [890, 1040], centerFreq: 965, expectedEnergy: 0.001 },
            { name: "B4", range: [1851, 2001], centerFreq: 1926, expectedEnergy: 0.003 },
            { name: "B5", range: [1995, 2145], centerFreq: 2070, expectedEnergy: 0.007 }
        ],
        "I": [
            { name: "B1", range: [202, 352], centerFreq: 277, expectedEnergy: 0.329 },
            { name: "B2", range: [339, 489], centerFreq: 414, expectedEnergy: 0.023 },
            { name: "B3", range: [722, 872], centerFreq: 797, expectedEnergy: 0.200 },
            { name: "B4", range: [1323, 1473], centerFreq: 1398, expectedEnergy: 0.200 },
            { name: "B5", range: [2702, 2852], centerFreq: 2777, expectedEnergy: 0.002 }
        ],
        "O": [
            { name: "B1", range: [198, 348], centerFreq: 273, expectedEnergy: 0.348 },
            { name: "B2", range: [335, 485], centerFreq: 410, expectedEnergy: 0.245 },
            { name: "B3", range: [745, 895], centerFreq: 820, expectedEnergy: 0.082 },
            { name: "B4", range: [1323, 1473], centerFreq: 1398, expectedEnergy: 0.200 },
            { name: "B5", range: [1925, 2075], centerFreq: 2000, expectedEnergy: 0.200 }
        ],
        "U": [
            { name: "B1", range: [198, 348], centerFreq: 273, expectedEnergy: 0.347 },
            { name: "B2", range: [335, 485], centerFreq: 410, expectedEnergy: 0.127 },
            { name: "B3", range: [741, 891], centerFreq: 816, expectedEnergy: 0.002 },
            { name: "B4", range: [1323, 1473], centerFreq: 1398, expectedEnergy: 0.200 },
            { name: "B5", range: [1925, 2075], centerFreq: 2000, expectedEnergy: 0.200 }
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
        
        // Extract fingerprints and dynamic bands from the latest session
        const vowelFingerprints = {};
        const vowelDynamicBands = {};
        
        for (const [vowel, data] of Object.entries(latestSession.vowels)) {
            // Load fingerprints
            if (data.fingerprint && Array.isArray(data.fingerprint) && data.fingerprint.length === 5) {
                vowelFingerprints[vowel] = data.fingerprint;
            }
            
            // Load dynamic bands (version 2.0+)
            if (data.dynamicBands && Array.isArray(data.dynamicBands) && data.dynamicBands.length === 5) {
                vowelDynamicBands[vowel] = data.dynamicBands.map(band => ({
                    name: band.name || `B${data.dynamicBands.indexOf(band) + 1}`,
                    range: band.range,
                    centerFreq: band.centerFreq || (band.range[0] + band.range[1]) / 2,
                    expectedEnergy: band.expectedEnergy || 0.2
                }));
            }
        }
        
        if (Object.keys(vowelFingerprints).length === 0) {
            console.log('No valid fingerprints found in calibration data');
            return null;
        }
        
        console.log(`Loaded calibration data from localStorage for vowels: ${Object.keys(vowelFingerprints).join(', ')}`);
        
        const result = { vowelFingerprints };
        
        // Only include dynamic bands if we have them
        if (Object.keys(vowelDynamicBands).length > 0) {
            result.vowelDynamicBands = vowelDynamicBands;
            console.log(`Also loaded dynamic bands for vowels: ${Object.keys(vowelDynamicBands).join(', ')}`);
        }
        
        return result;
        
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
    
    // Apply localStorage calibration overrides
    if (localStorageConfig) {
        // Override vowelFingerprints from localStorage
        if (localStorageConfig.vowelFingerprints) {
            mergedConfig.vowelFingerprints = {
                ...mergedConfig.vowelFingerprints,
                ...localStorageConfig.vowelFingerprints
            };
            console.log('Applied vowel fingerprints from localStorage');
        }
        
        // Override vowelDynamicBands from localStorage
        if (localStorageConfig.vowelDynamicBands) {
            if (!mergedConfig.vowelDynamicBands) {
                mergedConfig.vowelDynamicBands = {};
            }
            mergedConfig.vowelDynamicBands = {
                ...mergedConfig.vowelDynamicBands,
                ...localStorageConfig.vowelDynamicBands
            };
            console.log('Applied dynamic bands from localStorage');
        }
    }
    
    // Update global config
    config = mergedConfig;
    console.log('Final configuration loaded:', config);
    
    // Log dynamic bands info if available
    if (config.vowelDynamicBands && Object.keys(config.vowelDynamicBands).length > 0) {
        console.log('Dynamic bands available for vowels:', Object.keys(config.vowelDynamicBands).join(', '));
        Object.entries(config.vowelDynamicBands).forEach(([vowel, bands]) => {
            console.log(`  ${vowel}: ${bands.map(b => `${b.range[0]}-${b.range[1]}Hz`).join(', ')}`);
        });
    }
}