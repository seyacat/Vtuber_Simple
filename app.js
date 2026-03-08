// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('waveformCanvas');
const canvasOverlay = document.getElementById('canvasOverlay');
const volumeLevelEl = document.getElementById('volumeLevel');
const frequencyValueEl = document.getElementById('frequencyValue');
const vowelDetectionEl = document.getElementById('vowelDetection');
const vowelConfidenceEl = document.getElementById('vowelConfidence');
const audioInputSelect = document.getElementById('audioInput');

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

// Audio context and variables
let audioContext;
let analyser;
let source;
let dataArray;
let frequencyData;
let animationId;
let isRecording = false;

// Fingerprint detection variables
let currentVowel = '--';
let currentConfidence = 0;
let fingerprintHistory = [];
const MAX_HISTORY = 20;

// Canvas setup
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

function resizeCanvas() {
    canvasWidth = canvas.clientWidth;
    canvasHeight = canvas.clientHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

// Initialize canvas size
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Update status display
function updateStatus(active, message) {
    if (active) {
        statusEl.textContent = message || 'Microphone is active. Speak to see the waveform.';
        statusEl.className = 'status status-active';
        canvasOverlay.style.display = 'none';
    } else {
        statusEl.textContent = message || 'Microphone is not active.';
        statusEl.className = 'status status-inactive';
        canvasOverlay.style.display = 'flex';
    }
}

// Draw waveform on canvas
function drawWaveform() {
    if (!analyser || !dataArray) return;

    // Get time domain data
    analyser.getByteTimeDomainData(dataArray);

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = (canvasHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }

    // Draw waveform
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00dbde';
    ctx.beginPath();

    const sliceWidth = canvasWidth / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvasHeight / 2;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.stroke();

    // Calculate and display volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
    }
    
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms);
    const volumePercent = Math.min(100, Math.max(0, (db + 60) * (100/60)));
    
    // Update volume display
    volumeLevelEl.textContent = db.toFixed(1) + ' dB';
    
    // Draw volume bar
    const barWidth = canvasWidth * (volumePercent / 100);
    ctx.fillStyle = 'rgba(0, 219, 222, 0.3)';
    ctx.fillRect(0, canvasHeight - 10, barWidth, 8);

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.stroke();

    // Perform fingerprint analysis if volume is above threshold
    if (db > config.detection.minVolumeDb) {
        analyzeFingerprint();
    } else {
        // If volume is too low, reset detection
        currentVowel = '--';
        currentConfidence = 0;
        vowelDetectionEl.textContent = currentVowel;
        vowelConfidenceEl.textContent = '--%';
    }

    // Continue animation
    animationId = requestAnimationFrame(drawWaveform);
}

// Calculate energy in a frequency band
function getBandEnergy(frequencyData, minFreq, maxFreq) {
    if (!analyser || !frequencyData) return 0;
    
    const freqPerBin = audioContext.sampleRate / analyser.fftSize;
    const startBin = Math.floor(minFreq / freqPerBin);
    const endBin = Math.floor(maxFreq / freqPerBin);
    
    let energy = 0;
    let count = 0;
    
    for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
        // Convert dB to linear energy (skip -Infinity values)
        if (frequencyData[i] > -100) {
            const linearValue = Math.pow(10, frequencyData[i] / 20);
            energy += linearValue;
            count++;
        }
    }
    
    return count > 0 ? energy / count : 0;
}

// Calculate fingerprint (normalized energy in each of 5 bands)
function calculateFingerprint() {
    if (!analyser || !frequencyData) return null;
    
    // Get frequency data
    analyser.getFloatFrequencyData(frequencyData);
    
    // Calculate energy in each of the 5 bands
    const bandEnergies = [];
    let totalEnergy = 0;
    
    for (const band of config.fingerprintBands) {
        const [minFreq, maxFreq] = band.range;
        const energy = getBandEnergy(frequencyData, minFreq, maxFreq);
        bandEnergies.push(energy);
        totalEnergy += energy;
    }
    
    // Normalize to get fingerprint (sum = 1)
    if (totalEnergy > config.detection.noiseFloor) {
        const fingerprint = bandEnergies.map(energy => energy / totalEnergy);
        return fingerprint;
    }
    
    return null; // Too quiet
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

// Analyze 5-band fingerprint and update vowel detection
function analyzeFingerprint() {
    const fingerprint = calculateFingerprint();
    
    if (!fingerprint) {
        // No audio or too quiet
        currentVowel = '--';
        currentConfidence = 0;
        vowelDetectionEl.textContent = currentVowel;
        vowelConfidenceEl.textContent = '--%';
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
    
    // Update UI
    currentVowel = mostFrequentVowel;
    currentConfidence = avgConfidence * 100;
    
    vowelDetectionEl.textContent = currentVowel;
    vowelConfidenceEl.textContent = currentConfidence.toFixed(1) + '%';
    
    // Update frequency display with fingerprint values (show top 3 bands)
    const bandValues = fingerprint.map((val, i) => {
        const band = config.fingerprintBands[i];
        return `${band.name}:${(val*100).toFixed(0)}%`;
    }).join(' ');
    
    frequencyValueEl.textContent = bandValues;
    
    // Debug logging for significant detections
    if (confidence > 0.25) {
        const fingerprintStr = fingerprint.map(v => v.toFixed(2)).join(', ');
        console.log(`5-Band Fingerprint: [${fingerprintStr}] → ${vowel} (${confidence.toFixed(2)})`);
    }
    
    // Log calibration data when calibration mode is active
    if (calibrationMode && vowel !== 'noise' && confidence > 0.3) {
        logCalibrationData(vowel, fingerprint, confidence);
    }
    
    // Always log band values when there's audio (not silence) for calibration
    // This helps calibrate the bands even without calibration mode
    if (fingerprint && fingerprint.some(val => val > 0.1)) {
        // Create detailed band information
        const bandDetails = fingerprint.map((val, i) => {
            const band = config.fingerprintBands[i];
            const range = band.range;
            const percent = (val * 100).toFixed(1);
            return `${band.name}(${range[0]}-${range[1]}Hz):${percent}%`;
        }).join(' | ');
        
        // Log more frequently in calibration mode, otherwise occasionally
        const logProbability = calibrationMode ? 0.5 : 0.1; // 50% in calibration mode, 10% normally
        if (Math.random() < logProbability) {
            console.log(`Bandas: ${bandDetails}`);
            
            // If a vowel is detected with reasonable confidence, suggest calibration
            if (vowel !== 'noise' && confidence > 0.3) {
                console.log(`  Para calibrar "${vowel}": [${fingerprint.map(v => v.toFixed(3)).join(', ')}]`);
                console.log(`  Actual en config: [${config.vowelFingerprints[vowel].map(v => v.toFixed(3)).join(', ')}]`);
            }
        }
    }
}

// Calibration mode - log fingerprint values for tuning
let calibrationMode = false;
function toggleCalibration() {
    calibrationMode = !calibrationMode;
    
    // Update button appearance
    if (calibrationMode) {
        calibrateBtn.classList.add('active');
        calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrando...';
        console.log('Calibration mode: ON');
        console.log('Speak vowels clearly. The system will log 5-band fingerprint values for tuning.');
        console.log('Current 5-band reference fingerprints:', config.vowelFingerprints);
        updateStatus(true, 'Modo calibración: Habla vocales claramente (A, E, I, O, U)');
    } else {
        calibrateBtn.classList.remove('active');
        calibrateBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Calibrar';
        console.log('Calibration mode: OFF');
        if (isRecording) {
            updateStatus(true, 'Microphone active. Speak vowels for detection.');
        }
    }
}

// Enhanced calibration logging
function logCalibrationData(vowel, fingerprint, confidence) {
    if (!calibrationMode || confidence < 0.3) return;
    
    console.log(`CALIBRATION for "${vowel}":`);
    console.log(`  Fingerprint: [${fingerprint.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Confidence: ${(confidence*100).toFixed(1)}%`);
    
    // Suggest updated fingerprint
    const currentRef = config.vowelFingerprints[vowel] || [0,0,0,0,0];
    const suggested = fingerprint.map((val, i) => 
        (currentRef[i] * 0.7 + val * 0.3).toFixed(3) // Blend 70% old, 30% new
    );
    
    console.log(`  Suggested update for "${vowel}": [${suggested.join(', ')}]`);
}

// Start microphone
async function startMicrophone() {
    if (isRecording) {
        console.log('Microphone already recording');
        return;
    }

    try {
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create audio context with configured sample rate
        const sampleRate = config.audio.sampleRate || 16000;
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: sampleRate
        });
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);

        // Configure analyser
        const fftSize = config.audio.fftSize || 4096;
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0.2; // Very little smoothing for fast response
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength); // For visualization
        frequencyData = new Float32Array(bufferLength); // For fingerprint analysis

        // Connect nodes
        source.connect(analyser);

        // Start visualization
        drawWaveform();

        // Update UI
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true, 'Microphone active. Speak vowels (A, E, I, O, U) for 5-band detection.');

        console.log('Microphone started with 5-band fingerprint system');
        console.log(`Audio configured: sampleRate=${sampleRate}, fftSize=${fftSize}`);
        console.log(`5 frequency bands: ${config.fingerprintBands.map(b => `${b.range[0]}-${b.range[1]}Hz`).join(', ')}`);

    } catch (error) {
        console.error('Error accessing microphone:', error);
        updateStatus(false, 'Error accessing microphone. Please check permissions.');
        
        // Provide helpful error message
        if (error.name === 'NotAllowedError') {
            alert('Microphone access was denied. Please allow microphone access to use this application.');
        } else if (error.name === 'NotFoundError') {
            alert('No microphone found. Please connect a microphone and try again.');
        } else {
            alert('Error accessing microphone: ' + error.message);
        }
    }
}

// Stop microphone
function stopMicrophone() {
    if (!isRecording) return;

    // Stop audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Stop visualization
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Update UI
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(false, 'Microphone stopped.');

    // Reset detection
    currentVowel = '--';
    currentConfidence = 0;
    fingerprintHistory = [];
    
    vowelDetectionEl.textContent = currentVowel;
    vowelConfidenceEl.textContent = '--%';

    console.log('Microphone stopped');
}

// Event listeners
startBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopMicrophone);
calibrateBtn.addEventListener('click', toggleCalibration);

// Initialize on load
window.addEventListener('load', async () => {
    console.log('Application loading...');
    
    // Load configuration
    await loadConfig();
    
    // Try to start microphone automatically
    try {
        await startMicrophone();
    } catch (error) {
        console.log('Automatic microphone start failed (user may need to click start):', error.message);
        updateStatus(false, 'Click "Start Microphone" to begin.');
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
        console.log('Page hidden - pausing visualization');
        // Visualization will pause automatically when animation frame stops
    }
});