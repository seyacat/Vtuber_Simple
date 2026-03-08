// Fingerprint Core Functions
// Depends on config.js being loaded first

// Global variables for fingerprint detection
let currentVowel = '--';
let currentConfidence = 0;
let fingerprintHistory = [];
const MAX_HISTORY = 20;
let calibrationMode = false;

// Calculate energy in a specific frequency band
function getBandEnergy(frequencyData, minFreq, maxFreq) {
    if (!frequencyData || !config) return 0;
    
    const { fftSize, sampleRate } = config.audio;
    const frequencyResolution = sampleRate / fftSize;
    
    // Convert frequency range to FFT bin indices
    const startBin = Math.floor(minFreq / frequencyResolution);
    const endBin = Math.min(Math.floor(maxFreq / frequencyResolution), frequencyData.length - 1);
    
    if (startBin >= endBin || startBin < 0) return 0;
    
    // Calculate average energy in the band
    let totalEnergy = 0;
    for (let i = startBin; i <= endBin; i++) {
        // Convert from dB to linear scale (0-1)
        const value = frequencyData[i] / 255.0;
        totalEnergy += value * value;
    }
    
    return totalEnergy / (endBin - startBin + 1);
}

// Calculate 5-band fingerprint from current audio data
function calculateFingerprint() {
    if (!frequencyData || !config) return null;
    
    const energies = config.fingerprintBands.map(band => 
        getBandEnergy(frequencyData, band.range[0], band.range[1])
    );
    
    // Normalize to sum to 1 (volume-independent)
    const total = energies.reduce((sum, val) => sum + val, 0);
    if (total < config.detection.noiseFloor) return null;
    
    return energies.map(val => val / total);
}

// Classify vowel based on 5-band fingerprint
function classifyVowelByFingerprint(fingerprint) {
    if (!fingerprint || fingerprint.length !== 5) return { vowel: 'noise', confidence: 0 };
    
    let bestMatch = 'noise';
    let bestDistance = Infinity;
    
    // Compare with each reference fingerprint (5 values each)
    for (const [vowel, refFingerprint] of Object.entries(config.vowelFingerprints)) {
        // Calculate Euclidean distance between 5-dimensional vectors
        let distance = 0;
        for (let i = 0; i < 5; i++) {
            distance += Math.pow(fingerprint[i] - refFingerprint[i], 2);
        }
        distance = Math.sqrt(distance);
        
        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = vowel;
        }
    }
    
    // Convert distance to confidence (0-1)
    // Max possible distance with normalized 5D vectors is ~√2 ≈ 1.414
    const confidence = Math.max(0, 1 - (bestDistance / 1.414));
    
    // Apply confidence threshold
    if (confidence < config.detection.confidenceThreshold) {
        return { vowel: 'noise', confidence: 0 };
    }
    
    return { vowel: bestMatch, confidence: confidence };
}

// Enhanced calibration logging
function logCalibrationData(vowel, fingerprint, confidence) {
    if (!calibrationMode) return;
    
    // Always log band values in calibration mode, even with low confidence
    const bandDetails = fingerprint.map((val, i) => {
        const band = config.fingerprintBands[i];
        const range = band.range;
        const percent = (val * 100).toFixed(1);
        return `${band.name}(${range[0]}-${range[1]}Hz):${percent}%`;
    }).join(' | ');
    
    console.log(`CALIBRATION - ${bandDetails}`);
    
    if (vowel !== 'noise' && confidence > 0.15) {
        console.log(`  Detected "${vowel}" with ${(confidence*100).toFixed(1)}% confidence`);
        console.log(`  Fingerprint: [${fingerprint.map(v => v.toFixed(3)).join(', ')}]`);
        
        // Suggest updated fingerprint
        const currentRef = config.vowelFingerprints[vowel] || [0,0,0,0,0];
        const suggested = fingerprint.map((val, i) => 
            (currentRef[i] * 0.7 + val * 0.3).toFixed(3) // Blend 70% old, 30% new
        );
        
        console.log(`  Suggested update for "${vowel}": [${suggested.join(', ')}]`);
        console.log(`  Current reference: [${currentRef.map(v => v.toFixed(3)).join(', ')}]`);
    } else if (vowel === 'noise') {
        console.log(`  Noise detected (confidence: ${(confidence*100).toFixed(1)}%)`);
    } else {
        console.log(`  Low confidence detection: ${(confidence*100).toFixed(1)}%`);
    }
}

// Analyze 5-band fingerprint and update vowel detection
function analyzeFingerprint() {
    const fingerprint = calculateFingerprint();
    
    if (!fingerprint) {
        // No audio or too quiet
        currentVowel = '--';
        currentConfidence = 0;
        if (typeof vowelDetectionEl !== 'undefined') {
            vowelDetectionEl.textContent = currentVowel;
            vowelConfidenceEl.textContent = '--%';
        }
        return;
    }
    
    // Classify vowel using 5-band fingerprint
    const { vowel, confidence } = classifyVowelByFingerprint(fingerprint);
    
    // Add to history for smoothing
    fingerprintHistory.push({ vowel, confidence, fingerprint });
    if (fingerprintHistory.length > MAX_HISTORY) {
        fingerprintHistory.shift();
    }
    
    // Apply smoothing (majority vote over recent history)
    const smoothingWindow = Math.min(config.detection.smoothingWindow, fingerprintHistory.length);
    const recentHistory = fingerprintHistory.slice(-smoothingWindow);
    
    // Count vowel occurrences in recent history
    const vowelCounts = {};
    let totalConfidence = 0;
    
    for (const entry of recentHistory) {
        vowelCounts[entry.vowel] = (vowelCounts[entry.vowel] || 0) + 1;
        totalConfidence += entry.confidence;
    }
    
    // Find most frequent vowel
    let mostFrequentVowel = 'noise';
    let maxCount = 0;
    
    for (const [vowel, count] of Object.entries(vowelCounts)) {
        if (count > maxCount) {
            maxCount = count;
            mostFrequentVowel = vowel;
        }
    }
    
    // Calculate average confidence for the most frequent vowel
    const relevantEntries = recentHistory.filter(entry => entry.vowel === mostFrequentVowel);
    const avgConfidence = relevantEntries.length > 0 
        ? relevantEntries.reduce((sum, entry) => sum + entry.confidence, 0) / relevantEntries.length
        : 0;
    
    // Update global variables
    currentVowel = mostFrequentVowel;
    currentConfidence = avgConfidence * 100;
    
    // Update UI if elements are available
    if (typeof vowelDetectionEl !== 'undefined') {
        vowelDetectionEl.textContent = currentVowel;
        vowelConfidenceEl.textContent = currentConfidence.toFixed(1) + '%';
    }
    
    // Update frequency display with fingerprint values
    if (typeof frequencyValueEl !== 'undefined') {
        const bandValues = fingerprint.map((val, i) => {
            const band = config.fingerprintBands[i];
            return `${band.name}:${(val*100).toFixed(0)}%`;
        }).join(' ');
        
        frequencyValueEl.textContent = bandValues;
    }
    
    // Debug logging for significant detections
    if (confidence > 0.25) {
        const fingerprintStr = fingerprint.map(v => v.toFixed(2)).join(', ');
        console.log(`5-Band Fingerprint: [${fingerprintStr}] → ${vowel} (${confidence.toFixed(2)})`);
    }
    
    // Log calibration data when calibration mode is active
    if (calibrationMode) {
        logCalibrationData(vowel, fingerprint, confidence);
    }
    
    // Normal mode: log occasionally (10% of frames) to avoid console spam
    if (!calibrationMode && fingerprint && fingerprint.some(val => val > 0.1)) {
        // Create detailed band information
        const bandDetails = fingerprint.map((val, i) => {
            const band = config.fingerprintBands[i];
            const range = band.range;
            const percent = (val * 100).toFixed(1);
            return `${band.name}(${range[0]}-${range[1]}Hz):${percent}%`;
        }).join(' | ');
        
        if (Math.random() < 0.1) { // 10% chance each frame
            console.log(`Bandas: ${bandDetails}`);
            
            // If a vowel is detected with reasonable confidence, suggest calibration
            if (vowel !== 'noise' && confidence > 0.3) {
                console.log(`  Para calibrar "${vowel}": [${fingerprint.map(v => v.toFixed(3)).join(', ')}]`);
                console.log(`  Actual en config: [${config.vowelFingerprints[vowel].map(v => v.toFixed(3)).join(', ')}]`);
            }
        }
    }
}

// Toggle calibration mode
function toggleCalibration() {
    calibrationMode = !calibrationMode;
    
    // Update button appearance if calibrateBtn is available
    if (typeof calibrateBtn !== 'undefined') {
        if (calibrationMode) {
            calibrateBtn.classList.add('active');
            calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrando...';
            console.log('=== CALIBRATION MODE: ON ===');
            console.log('Speak vowels (A, E, I, O, U) clearly.');
            console.log('The system will log 5-band fingerprint values in real-time.');
            console.log('Check browser console (F12 → Console tab) to see values.');
            console.log('Current reference fingerprints:', config.vowelFingerprints);
            
            if (typeof updateStatus !== 'undefined') {
                updateStatus(true, 'Modo calibración: Habla vocales claramente (A, E, I, O, U)');
            }
            
            // Force immediate test log
            console.log('Calibration test: Button clicked successfully. Waiting for audio...');
        } else {
            calibrateBtn.classList.remove('active');
            calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrar';
            console.log('=== CALIBRATION MODE: OFF ===');
            
            if (typeof isRecording !== 'undefined' && isRecording && typeof updateStatus !== 'undefined') {
                updateStatus(true, 'Microphone active. Speak vowels for detection.');
            }
        }
    }
}

// Export functions and variables for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        currentVowel,
        currentConfidence,
        fingerprintHistory,
        calibrationMode,
        getBandEnergy,
        calculateFingerprint,
        classifyVowelByFingerprint,
        logCalibrationData,
        analyzeFingerprint,
        toggleCalibration
    };
}