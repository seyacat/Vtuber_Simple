// Fingerprint Core Functions
// Depends on config.js being loaded first
import { config } from './config.js';

// Global variables for fingerprint detection
export let currentVowel = '--';
export let currentConfidence = 0;
export let fingerprintHistory = [];
const MAX_HISTORY = 20;

// Enhanced calibration system
export let calibrationMode = false;
export let guidedCalibration = {
    active: false,
    state: 'idle', // 'idle', 'countdown', 'capturing', 'processing', 'complete'
    currentVowelIndex: 0,
    vowels: ['A', 'E', 'I', 'O', 'U'],
    countdownValue: 3,
    capturedSamples: [],
    calibrationData: {},
    sessionId: null,
    startTime: null,
    
    // Statistics
    samplesPerVowel: 5,
    captureDuration: 1000, // ms
    sampleInterval: 100, // ms
    
    // UI elements cache
    uiElements: {
        overlay: null,
        countdownNumber: null,
        currentVowelDisplay: null,
        calibrationInstructions: null,
        capturedSamples: null,
        currentConfidence: null,
        calibrationState: null,
        calibrationOutput: null,
        copyConfig: null,
        nextVowel: null,
        cancelCalibration: null,
        vowelIndicators: null
    }
};

// Calculate energy in a specific frequency band
export function getBandEnergy(frequencyData, minFreq, maxFreq) {
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
export function calculateFingerprint(frequencyData) {
    // Ensure config is available
    if (!frequencyData || !config) {
        console.debug('calculateFingerprint: config not available or no frequency data');
        return null;
    }
    
    // Ensure required config properties exist
    if (!config.fingerprintBands || !config.detection) {
        console.debug('calculateFingerprint: config structure incomplete');
        return null;
    }
    
    const energies = config.fingerprintBands.map(band =>
        getBandEnergy(frequencyData, band.range[0], band.range[1])
    );
    
    // Normalize to sum to 1 (volume-independent)
    const total = energies.reduce((sum, val) => sum + val, 0);
    if (total < config.detection.noiseFloor) return null;
    
    return energies.map(val => val / total);
}

// Classify vowel based on 5-band fingerprint
export function classifyVowelByFingerprint(fingerprint) {
    if (!fingerprint || fingerprint.length !== 5 || !config) {
        return { vowel: 'noise', confidence: 0 };
    }
    
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
export function logCalibrationData(vowel, fingerprint, confidence) {
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
export function analyzeFingerprint(frequencyData) {
    const fingerprint = calculateFingerprint(frequencyData);
    
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

// Toggle calibration mode - now starts guided calibration
export function toggleCalibration() {
    // If already in guided calibration, cancel it
    if (guidedCalibration.active) {
        cancelGuidedCalibration();
        return;
    }
    
    // Start guided calibration
    startGuidedCalibration();
}

// Initialize guided calibration UI elements
export function initCalibrationUI() {
    guidedCalibration.uiElements = {
        overlay: document.getElementById('calibrationOverlay'),
        countdownNumber: document.getElementById('countdownNumber'),
        currentVowelDisplay: document.getElementById('currentVowelDisplay'),
        calibrationInstructions: document.getElementById('calibrationInstructions'),
        capturedSamples: document.getElementById('capturedSamples'),
        currentConfidence: document.getElementById('currentConfidence'),
        calibrationState: document.getElementById('calibrationState'),
        calibrationOutput: document.getElementById('calibrationOutput'),
        copyConfig: document.getElementById('copyConfig'),
        closeCalibration: document.getElementById('closeCalibration'),
        nextVowel: document.getElementById('nextVowel'),
        cancelCalibration: document.getElementById('cancelCalibration'),
        vowelIndicators: document.querySelectorAll('.vowel-indicator')
    };
    
    // Add event listeners if elements exist
    if (guidedCalibration.uiElements.cancelCalibration) {
        guidedCalibration.uiElements.cancelCalibration.addEventListener('click', cancelGuidedCalibration);
    }
    
    if (guidedCalibration.uiElements.nextVowel) {
        guidedCalibration.uiElements.nextVowel.addEventListener('click', nextVowelInCalibration);
    }
    
    if (guidedCalibration.uiElements.copyConfig) {
        guidedCalibration.uiElements.copyConfig.addEventListener('click', copyCalibrationConfig);
    }
    
    if (guidedCalibration.uiElements.closeCalibration) {
        guidedCalibration.uiElements.closeCalibration.addEventListener('click', closeCalibration);
    }
}

// Start guided calibration
function startGuidedCalibration() {
    if (guidedCalibration.active) {
        console.log('Calibration already in progress');
        return;
    }
    
    // Initialize UI if not already done
    if (!guidedCalibration.uiElements.overlay) {
        initCalibrationUI();
    }
    
    // Reset calibration data
    guidedCalibration.active = true;
    guidedCalibration.state = 'idle';
    guidedCalibration.currentVowelIndex = 0;
    guidedCalibration.countdownValue = 3;
    guidedCalibration.capturedSamples = [];
    guidedCalibration.calibrationData = {};
    guidedCalibration.sessionId = 'session_' + Date.now();
    guidedCalibration.startTime = Date.now();
    
    // Update calibration button
    if (typeof calibrateBtn !== 'undefined') {
        calibrateBtn.classList.add('active');
        calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrando...';
    }
    
    // Show calibration overlay
    if (guidedCalibration.uiElements.overlay) {
        guidedCalibration.uiElements.overlay.classList.remove('hidden');
    }
    
    // Update status
    if (typeof updateStatus !== 'undefined') {
        updateStatus(true, 'Calibración guiada iniciada. Sigue las instrucciones en pantalla.');
    }
    
    console.log('=== GUIDED CALIBRATION STARTED ===');
    console.log('Session ID:', guidedCalibration.sessionId);
    
    // Start with first vowel
    startVowelCalibration();
}

// Start calibration for current vowel
function startVowelCalibration() {
    if (!guidedCalibration.active) return;
    
    const currentVowel = guidedCalibration.vowels[guidedCalibration.currentVowelIndex];
    guidedCalibration.state = 'countdown';
    guidedCalibration.countdownValue = 3;
    guidedCalibration.capturedSamples = [];
    
    // Update UI
    updateCalibrationUI();
    
    // Start countdown
    startCountdown();
}

// Start countdown for current vowel
function startCountdown() {
    if (!guidedCalibration.active || guidedCalibration.state !== 'countdown') return;
    
    const countdownInterval = setInterval(() => {
        if (!guidedCalibration.active || guidedCalibration.state !== 'countdown') {
            clearInterval(countdownInterval);
            return;
        }
        
        guidedCalibration.countdownValue--;
        updateCalibrationUI();
        
        // Add pulse animation to countdown
        if (guidedCalibration.uiElements.countdownNumber) {
            guidedCalibration.uiElements.countdownNumber.classList.add('pulse');
            setTimeout(() => {
                if (guidedCalibration.uiElements.countdownNumber) {
                    guidedCalibration.uiElements.countdownNumber.classList.remove('pulse');
                }
            }, 500);
        }
        
        if (guidedCalibration.countdownValue <= 0) {
            clearInterval(countdownInterval);
            startCapture();
        }
    }, 1000);
}

// Start capturing samples for current vowel
function startCapture() {
    if (!guidedCalibration.active) return;
    
    guidedCalibration.state = 'capturing';
    guidedCalibration.capturedSamples = [];
    updateCalibrationUI();
    
    // Capture samples for specified duration
    const captureStartTime = Date.now();
    const captureInterval = setInterval(() => {
        if (!guidedCalibration.active || guidedCalibration.state !== 'capturing') {
            clearInterval(captureInterval);
            return;
        }
        
        // Capture current fingerprint if available
        if (window.currentFingerprint && Array.isArray(window.currentFingerprint)) {
            guidedCalibration.capturedSamples.push([...window.currentFingerprint]);
            updateCalibrationUI();
        }
        
        // Check if capture duration has elapsed
        const elapsed = Date.now() - captureStartTime;
        if (elapsed >= guidedCalibration.captureDuration) {
            clearInterval(captureInterval);
            processCapturedSamples();
        }
    }, guidedCalibration.sampleInterval);
}

// Process captured samples for current vowel
function processCapturedSamples() {
    if (!guidedCalibration.active || guidedCalibration.capturedSamples.length === 0) return;
    
    guidedCalibration.state = 'processing';
    updateCalibrationUI();
    
    const currentVowel = guidedCalibration.vowels[guidedCalibration.currentVowelIndex];
    
    // Calculate average fingerprint
    const avgFingerprint = calculateAverageFingerprint(guidedCalibration.capturedSamples);
    
    // Store calibration data
    guidedCalibration.calibrationData[currentVowel] = {
        fingerprint: avgFingerprint,
        samples: guidedCalibration.capturedSamples.length,
        timestamp: new Date().toISOString()
    };
    
    // Save to localStorage
    saveCalibrationToLocalStorage(currentVowel, avgFingerprint);
    
    // Update console with calibration data
    console.log(`Calibration for "${currentVowel}": [${avgFingerprint.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`Samples captured: ${guidedCalibration.capturedSamples.length}`);
    
    // Mark current vowel as completed in UI
    markVowelCompleted(guidedCalibration.currentVowelIndex);
    
    // Check if all vowels are done
    if (guidedCalibration.currentVowelIndex >= guidedCalibration.vowels.length - 1) {
        completeCalibration();
    } else {
        // Enable next button
        if (guidedCalibration.uiElements.nextVowel) {
            guidedCalibration.uiElements.nextVowel.disabled = false;
        }
    }
}

// Move to next vowel in calibration
function nextVowelInCalibration() {
    if (!guidedCalibration.active) return;
    
    guidedCalibration.currentVowelIndex++;
    if (guidedCalibration.uiElements.nextVowel) {
        guidedCalibration.uiElements.nextVowel.disabled = true;
    }
    
    startVowelCalibration();
}

// Complete the calibration process
function completeCalibration() {
    if (!guidedCalibration.active) return;
    
    guidedCalibration.state = 'complete';
    updateCalibrationUI();
    
    // Generate configuration output
    generateCalibrationOutput();
    
    console.log('=== CALIBRATION COMPLETE ===');
    console.log('All vowels calibrated successfully.');
    console.log('Copy the configuration from the calibration overlay or console.');
    
    // Update calibration button
    if (typeof calibrateBtn !== 'undefined') {
        calibrateBtn.classList.remove('active');
        calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrar';
    }
    
    // Enable close button
    if (guidedCalibration.uiElements.closeCalibration) {
        guidedCalibration.uiElements.closeCalibration.disabled = false;
    }
    
    // Update status
    if (typeof updateStatus !== 'undefined') {
        updateStatus(true, 'Calibración completada. Los datos están listos para copiar.');
    }
}

// Close calibration overlay after completion
function closeCalibration() {
    if (!guidedCalibration.active) return;
    
    guidedCalibration.active = false;
    guidedCalibration.state = 'idle';
    
    // Hide calibration overlay
    if (guidedCalibration.uiElements.overlay) {
        guidedCalibration.uiElements.overlay.classList.add('hidden');
    }
    
    // Reset UI elements
    if (guidedCalibration.uiElements.closeCalibration) {
        guidedCalibration.uiElements.closeCalibration.disabled = true;
    }
    
    if (guidedCalibration.uiElements.copyConfig) {
        guidedCalibration.uiElements.copyConfig.disabled = true;
    }
    
    console.log('=== CALIBRATION CLOSED ===');
    console.log('Calibration data saved. Remember to update config.json with the copied values.');
    
    // Update status if microphone is recording
    if (typeof isRecording !== 'undefined' && isRecording && typeof updateStatus !== 'undefined') {
        updateStatus(true, 'Calibración finalizada. Micrófono activo.');
    }
}

// Cancel guided calibration
function cancelGuidedCalibration() {
    guidedCalibration.active = false;
    guidedCalibration.state = 'idle';
    
    // Hide calibration overlay
    if (guidedCalibration.uiElements.overlay) {
        guidedCalibration.uiElements.overlay.classList.add('hidden');
    }
    
    // Reset UI elements
    if (guidedCalibration.uiElements.closeCalibration) {
        guidedCalibration.uiElements.closeCalibration.disabled = true;
    }
    
    if (guidedCalibration.uiElements.copyConfig) {
        guidedCalibration.uiElements.copyConfig.disabled = true;
    }
    
    // Update calibration button
    if (typeof calibrateBtn !== 'undefined') {
        calibrateBtn.classList.remove('active');
        calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrar';
    }
    
    // Update status
    if (typeof updateStatus !== 'undefined' && typeof isRecording !== 'undefined' && isRecording) {
        updateStatus(true, 'Microphone active. Speak vowels for detection.');
    }
    
    console.log('=== CALIBRATION CANCELLED ===');
}

// Update calibration UI
function updateCalibrationUI() {
    if (!guidedCalibration.active) return;
    
    const currentVowel = guidedCalibration.vowels[guidedCalibration.currentVowelIndex];
    const elements = guidedCalibration.uiElements;
    
    // Update countdown display
    if (elements.countdownNumber) {
        if (guidedCalibration.state === 'countdown') {
            elements.countdownNumber.textContent = guidedCalibration.countdownValue;
        } else if (guidedCalibration.state === 'capturing') {
            elements.countdownNumber.textContent = '✓';
        } else if (guidedCalibration.state === 'processing') {
            elements.countdownNumber.textContent = '...';
        } else if (guidedCalibration.state === 'complete') {
            elements.countdownNumber.textContent = '✓';
        }
    }
    
    // Update current vowel display
    if (elements.currentVowelDisplay) {
        elements.currentVowelDisplay.textContent = currentVowel;
    }
    
    // Update instructions
    if (elements.calibrationInstructions) {
        let instruction = '';
        switch (guidedCalibration.state) {
            case 'countdown':
                instruction = `Preparándose para capturar vocal "${currentVowel}"`;
                break;
            case 'capturing':
                instruction = `¡Habla "${currentVowel}" ahora!`;
                break;
            case 'processing':
                instruction = `Procesando muestras para "${currentVowel}"`;
                break;
            case 'complete':
                instruction = 'Calibración completada';
                break;
            default:
                instruction = `Vocal actual: ${currentVowel}`;
        }
        elements.calibrationInstructions.textContent = instruction;
    }
    
    // Update statistics
    if (elements.capturedSamples) {
        elements.capturedSamples.textContent = `${guidedCalibration.capturedSamples.length}/${guidedCalibration.samplesPerVowel}`;
    }
    
    if (elements.calibrationState) {
        let stateText = '';
        switch (guidedCalibration.state) {
            case 'idle': stateText = 'Listo'; break;
            case 'countdown': stateText = 'Cuenta regresiva'; break;
            case 'capturing': stateText = 'Capturando'; break;
            case 'processing': stateText = 'Procesando'; break;
            case 'complete': stateText = 'Completado'; break;
        }
        elements.calibrationState.textContent = stateText;
    }
    
    // Update vowel indicators
    updateVowelIndicators();
}

// Update vowel indicators in UI
function updateVowelIndicators() {
    if (!guidedCalibration.uiElements.vowelIndicators) return;
    
    guidedCalibration.uiElements.vowelIndicators.forEach((indicator, index) => {
        indicator.classList.remove('active', 'completed');
        
        if (index < guidedCalibration.currentVowelIndex) {
            indicator.classList.add('completed');
        } else if (index === guidedCalibration.currentVowelIndex) {
            indicator.classList.add('active');
        }
    });
}

// Mark a vowel as completed
function markVowelCompleted(vowelIndex) {
    if (!guidedCalibration.uiElements.vowelIndicators) return;
    
    if (guidedCalibration.uiElements.vowelIndicators[vowelIndex]) {
        guidedCalibration.uiElements.vowelIndicators[vowelIndex].classList.remove('active');
        guidedCalibration.uiElements.vowelIndicators[vowelIndex].classList.add('completed');
    }
}

// Calculate average fingerprint from samples
function calculateAverageFingerprint(samples) {
    if (!samples || samples.length === 0) return [0, 0, 0, 0, 0];
    
    const sum = [0, 0, 0, 0, 0];
    
    samples.forEach(sample => {
        for (let i = 0; i < 5; i++) {
            sum[i] += sample[i] || 0;
        }
    });
    
    return sum.map(val => val / samples.length);
}

// Save calibration data to localStorage
function saveCalibrationToLocalStorage(vowel, fingerprint) {
    try {
        const storageKey = 'vtube_calibration';
        let calibrationData = JSON.parse(localStorage.getItem(storageKey)) || {
            version: '1.0',
            sessions: []
        };
        
        // Find or create current session
        let currentSession = calibrationData.sessions.find(s => s.id === guidedCalibration.sessionId);
        if (!currentSession) {
            currentSession = {
                id: guidedCalibration.sessionId,
                timestamp: new Date().toISOString(),
                vowels: {},
                metadata: {
                    microphone: 'Default',
                    sampleRate: config.audio.sampleRate,
                    fftSize: config.audio.fftSize
                }
            };
            calibrationData.sessions.push(currentSession);
        }
        
        // Add vowel data
        currentSession.vowels[vowel] = {
            fingerprint: fingerprint,
            samples: guidedCalibration.capturedSamples.length,
            confidence: calculateConfidence(fingerprint, config.vowelFingerprints[vowel] || [0,0,0,0,0])
        };
        
        localStorage.setItem(storageKey, JSON.stringify(calibrationData));
        console.log(`Calibration data for "${vowel}" saved to localStorage`);
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

// Calculate confidence between two fingerprints
function calculateConfidence(fingerprint1, fingerprint2) {
    if (!fingerprint1 || !fingerprint2 || fingerprint1.length !== 5 || fingerprint2.length !== 5) {
        return 0;
    }
    
    // Calculate Euclidean distance
    let distance = 0;
    for (let i = 0; i < 5; i++) {
        distance += Math.pow(fingerprint1[i] - fingerprint2[i], 2);
    }
    distance = Math.sqrt(distance);
    
    // Convert to confidence (0-1)
    return Math.max(0, 1 - (distance / 1.414));
}

// Generate calibration output for config.json
function generateCalibrationOutput() {
    if (!guidedCalibration.active || !guidedCalibration.calibrationData) return;
    
    const output = {
        vowelFingerprints: {}
    };
    
    // Extract fingerprints from calibration data
    for (const [vowel, data] of Object.entries(guidedCalibration.calibrationData)) {
        if (data.fingerprint) {
            output.vowelFingerprints[vowel] = data.fingerprint.map(v => parseFloat(v.toFixed(3)));
        }
    }
    
    // Format as JSON string
    const jsonOutput = JSON.stringify(output, null, 2);
    
    // Update UI
    if (guidedCalibration.uiElements.calibrationOutput) {
        guidedCalibration.uiElements.calibrationOutput.textContent = jsonOutput;
    }
    
    if (guidedCalibration.uiElements.copyConfig) {
        guidedCalibration.uiElements.copyConfig.disabled = false;
    }
    
    // Also log to console
    console.log('=== CALIBRATION CONFIGURATION ===');
    console.log('Copy this to your config.json file:');
    console.log(jsonOutput);
}

// Copy calibration configuration to clipboard
function copyCalibrationConfig() {
    if (!guidedCalibration.uiElements.calibrationOutput) return;
    
    const text = guidedCalibration.uiElements.calibrationOutput.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        console.log('Configuration copied to clipboard');
        
        // Show feedback
        if (guidedCalibration.uiElements.copyConfig) {
            const originalText = guidedCalibration.uiElements.copyConfig.innerHTML;
            guidedCalibration.uiElements.copyConfig.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            guidedCalibration.uiElements.copyConfig.disabled = true;
            
            setTimeout(() => {
                if (guidedCalibration.uiElements.copyConfig) {
                    guidedCalibration.uiElements.copyConfig.innerHTML = '<i class="fas fa-copy"></i> Copiar Configuración';
                    guidedCalibration.uiElements.copyConfig.disabled = false;
                }
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy configuration:', err);
    });
}
