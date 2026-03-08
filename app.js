// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('waveformCanvas');
const canvasOverlay = document.getElementById('canvasOverlay');
const volumeLevelEl = document.getElementById('volumeLevel');
const frequencyValueEl = document.getElementById('frequencyValue');
const vowelDetectionEl = document.getElementById('vowelDetection');
const vowelConfidenceEl = document.getElementById('vowelConfidence');
const audioInputSelect = document.getElementById('audioInput');

// Configuration
let config = {
    audio: { sampleRate: 16000, bufferSize: 2048, fftSize: 2048, minFrequency: 80, maxFrequency: 4000 },
    formants: {
        A: { F1: [700, 900], F2: [1100, 1300] },
        E: { F1: [400, 600], F2: [1700, 2100] },
        I: { F1: [250, 350], F2: [2100, 2500] },
        O: { F1: [400, 600], F2: [800, 1000] },
        U: { F1: [250, 350], F2: [600, 900] }
    },
    detection: {
        confidenceThreshold: 0.7,
        smoothingWindow: 5,
        minVolumeDb: -40,
        peakThreshold: 0.3,
        formantSearchRange: { F1: [200, 1000], F2: [500, 3000] }
    },
    labels: ['A', 'E', 'I', 'O', 'U', 'noise']
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

// Formant detection variables
let currentVowel = '--';
let currentConfidence = 0;
let formantHistory = [];
const MAX_HISTORY = 10;

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

    // Perform formant analysis if volume is above threshold
    if (db > config.detection.minVolumeDb) {
        analyzeFormants();
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

// Find spectral peaks in frequency data
function findSpectralPeaks(frequencyData) {
    const peaks = [];
    const peakThreshold = config.detection.peakThreshold || 0.1; // Lower threshold
    
    // Convert from dB to linear scale for better peak detection
    const linearData = frequencyData.map(value => Math.pow(10, value / 20));
    
    // Normalize frequency data
    const maxValue = Math.max(...linearData);
    if (maxValue === 0) return peaks;
    
    const normalizedData = linearData.map(value => value / maxValue);
    
    // Apply simple smoothing (3-point moving average)
    const smoothedData = [];
    for (let i = 0; i < normalizedData.length; i++) {
        const prev = i > 0 ? normalizedData[i - 1] : normalizedData[i];
        const next = i < normalizedData.length - 1 ? normalizedData[i + 1] : normalizedData[i];
        smoothedData[i] = (prev + normalizedData[i] + next) / 3;
    }
    
    // Find local maxima with wider window for better detection
    for (let i = 2; i < smoothedData.length - 2; i++) {
        if (smoothedData[i] > smoothedData[i - 1] &&
            smoothedData[i] > smoothedData[i + 1] &&
            smoothedData[i] > smoothedData[i - 2] &&
            smoothedData[i] > smoothedData[i + 2] &&
            smoothedData[i] > peakThreshold) {
            
            // Convert bin index to frequency
            const frequency = i * audioContext.sampleRate / analyser.fftSize;
            
            // Only consider frequencies in human speech range
            if (frequency >= config.audio.minFrequency && frequency <= config.audio.maxFrequency) {
                peaks.push({
                    frequency: frequency,
                    amplitude: smoothedData[i],
                    rawAmplitude: frequencyData[i]
                });
            }
        }
    }
    
    // Sort by amplitude (highest first)
    peaks.sort((a, b) => b.amplitude - a.amplitude);
    
    return peaks;
}

// Extract formant frequencies (F1 and F2) from spectral peaks
function extractFormants(peaks) {
    if (peaks.length < 2) return { F1: 0, F2: 0 };
    
    // The first formant (F1) is typically the lowest strong peak
    // The second formant (F2) is the next strong peak above F1
    
    let F1 = 0;
    let F2 = 0;
    
    // Sort peaks by frequency
    const sortedPeaks = [...peaks].sort((a, b) => a.frequency - b.frequency);
    
    // Find F1 in the lower frequency range (200-1000 Hz)
    const F1Range = config.detection.formantSearchRange.F1 || [200, 1000];
    const F1Candidates = sortedPeaks.filter(p => p.frequency >= F1Range[0] && p.frequency <= F1Range[1]);
    
    if (F1Candidates.length > 0) {
        // Take the strongest peak in F1 range
        F1Candidates.sort((a, b) => b.amplitude - a.amplitude);
        F1 = F1Candidates[0].frequency;
    }
    
    // Find F2 in the higher frequency range (500-3000 Hz)
    const F2Range = config.detection.formantSearchRange.F2 || [500, 3000];
    const F2Candidates = sortedPeaks.filter(p => p.frequency >= F2Range[0] && p.frequency <= F2Range[1] && p.frequency > F1 + 100);
    
    if (F2Candidates.length > 0) {
        // Take the strongest peak in F2 range
        F2Candidates.sort((a, b) => b.amplitude - a.amplitude);
        F2 = F2Candidates[0].frequency;
    }
    
    return { F1, F2 };
}

// Classify vowel based on formant frequencies
function classifyVowelByFormants(F1, F2) {
    if (F1 === 0 || F2 === 0) return { vowel: 'noise', confidence: 0 };
    
    let bestMatch = 'noise';
    let bestConfidence = 0;
    
    // Check each vowel's formant ranges
    for (const vowel of ['A', 'E', 'I', 'O', 'U']) {
        const ranges = config.formants[vowel];
        if (!ranges) continue;
        
        const [F1min, F1max] = ranges.F1;
        const [F2min, F2max] = ranges.F2;
        
        // Calculate how close F1 and F2 are to the ideal ranges
        const F1Distance = Math.max(0, Math.abs((F1 - (F1min + F1max) / 2) / ((F1max - F1min) / 2)));
        const F2Distance = Math.max(0, Math.abs((F2 - (F2min + F2max) / 2) / ((F2max - F2min) / 2)));
        
        // Combined distance (lower is better)
        const distance = Math.sqrt(F1Distance * F1Distance + F2Distance * F2Distance);
        
        // Convert distance to confidence (0-1)
        const confidence = Math.max(0, 1 - distance / 2);
        
        if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = vowel;
        }
    }
    
    // Apply confidence threshold
    if (bestConfidence < config.detection.confidenceThreshold) {
        bestMatch = 'noise';
        bestConfidence = 0;
    }
    
    return { vowel: bestMatch, confidence: bestConfidence };
}

// Analyze formants and update vowel detection
function analyzeFormants() {
    if (!analyser || !frequencyData) return;
    
    // Get frequency data
    analyser.getFloatFrequencyData(frequencyData);
    
    // Convert to positive values for peak detection
    const positiveData = frequencyData.map(value => Math.max(0, value + 100));
    
    // Find spectral peaks
    const peaks = findSpectralPeaks(positiveData);
    
    // Extract formants
    const { F1, F2 } = extractFormants(peaks);
    
    // Update frequency display
    if (F1 > 0) {
        frequencyValueEl.textContent = `${F1.toFixed(0)} Hz (F1), ${F2.toFixed(0)} Hz (F2)`;
    }
    
    // Classify vowel
    const { vowel, confidence } = classifyVowelByFormants(F1, F2);
    
    // Add to history for smoothing
    formantHistory.push({ vowel, confidence, F1, F2 });
    if (formantHistory.length > MAX_HISTORY) {
        formantHistory.shift();
    }
    
    // Apply smoothing (average over history)
    const smoothingWindow = Math.min(config.detection.smoothingWindow, formantHistory.length);
    const recentHistory = formantHistory.slice(-smoothingWindow);
    
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
    
    // Debug logging (optional)
    if (F1 > 0 && F2 > 0) {
        console.log(`Formants: F1=${F1.toFixed(0)}Hz, F2=${F2.toFixed(0)}Hz → ${vowel} (${confidence.toFixed(2)})`);
    }
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
        const fftSize = config.audio.fftSize || 2048;
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0.8;
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength); // For visualization
        frequencyData = new Float32Array(bufferLength); // For formant analysis

        // Connect nodes
        source.connect(analyser);

        // Start visualization
        drawWaveform();

        // Update UI
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true, 'Microphone active. Speak vowels (A, E, I, O, U) for detection.');

        console.log('Microphone started successfully');

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
    formantHistory = [];
    
    vowelDetectionEl.textContent = currentVowel;
    vowelConfidenceEl.textContent = '--%';

    console.log('Microphone stopped');
}

// Event listeners
startBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopMicrophone);

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