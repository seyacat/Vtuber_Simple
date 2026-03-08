// Main Application File
// Depends on config.js and fingerprint-core.js
import { config, loadConfig } from './config.js';
import { analyzeFingerprint, calculateFingerprint, toggleCalibration, initCalibrationUI } from './fingerprint-core.js';

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

// Make DOM elements and functions available globally for fingerprint-core.js
window.vowelDetectionEl = vowelDetectionEl;
window.vowelConfidenceEl = vowelConfidenceEl;
window.frequencyValueEl = frequencyValueEl;
window.calibrateBtn = calibrateBtn;
window.updateStatus = updateStatus;
window.isRecording = isRecording;

// Audio context and variables
let audioContext;
let analyser;
let source;
let dataArray;
let frequencyData;
let animationId;
let isRecording = false;

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
        statusEl.textContent = message || 'Microphone is inactive. Click "Start Microphone" to begin.';
        statusEl.className = 'status status-inactive';
        canvasOverlay.style.display = 'flex';
    }
}

// Draw waveform visualization
function drawWaveform() {
    if (!isRecording || !dataArray) {
        // If not recording, schedule next frame but don't draw
        animationId = requestAnimationFrame(drawWaveform);
        return;
    }
    
    try {
        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Calculate volume for visualization
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128;
            sum += value * value;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const volumeDb = 20 * Math.log10(rms + 1e-10);
        
        // Update volume display
        if (volumeLevelEl) {
            const volumePercent = Math.min(100, Math.max(0, (volumeDb + 70) * 2));
            volumeLevelEl.textContent = volumePercent.toFixed(0) + '%';
        }
        
        // Draw waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00dbde';
        ctx.beginPath();
        
        const sliceWidth = canvasWidth / dataArray.length;
        let x = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvasHeight) / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(canvasWidth, canvasHeight / 2);
        ctx.stroke();
        
        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvasHeight / 2);
        ctx.lineTo(canvasWidth, canvasHeight / 2);
        ctx.stroke();
        
    } catch (error) {
        console.error('Error in drawWaveform:', error);
    }
    
    // Continue animation
    animationId = requestAnimationFrame(drawWaveform);
}

// Animation loop for audio processing
function animate() {
    if (!isRecording || !analyser) {
        animationId = requestAnimationFrame(animate);
        return;
    }
    
    // Get time domain data for waveform
    analyser.getByteTimeDomainData(dataArray);
    
    // Get frequency data for fingerprint analysis
    analyser.getByteFrequencyData(frequencyData);
    
    // Analyze fingerprint for vowel detection
    analyzeFingerprint(frequencyData);
    
    // Store current fingerprint globally for calibration capture
    // Check if calculateFingerprint function is available (from fingerprint-core.js)
    try {
        if (typeof calculateFingerprint === 'function') {
            const currentFingerprint = calculateFingerprint(frequencyData);
            if (currentFingerprint && Array.isArray(currentFingerprint)) {
                window.currentFingerprint = currentFingerprint;
            }
        }
    } catch (error) {
        // Silently fail - calibration will work when function is available
        console.debug('calculateFingerprint not available yet:', error.message);
    }
    
    // Draw waveform
    drawWaveform();
    
    // Continue animation
    animationId = requestAnimationFrame(animate);
}

// Start microphone
async function startMicrophone() {
    if (isRecording) {
        console.log('Microphone already recording');
        return;
    }
    
    console.log('Starting microphone...');
    console.log('Config:', config);
    
    try {
        // Check if config is available
        if (!config || !config.audio) {
            console.error('Configuration not loaded properly');
            updateStatus(false, 'Configuration error. Please refresh the page.');
            return;
        }
        
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: config.audio.sampleRate
        });
        
        console.log('Audio context created, sample rate:', config.audio.sampleRate);
        
        // Get microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: config.audio.sampleRate
            }
        });
        
        console.log('Microphone stream obtained');
        
        // Create audio source
        source = audioContext.createMediaStreamSource(stream);
        
        // Create analyser
        analyser = audioContext.createAnalyser();
        analyser.fftSize = config.audio.fftSize;
        analyser.smoothingTimeConstant = 0.8;
        
        // Connect nodes
        source.connect(analyser);
        
        // Create data arrays
        dataArray = new Uint8Array(analyser.fftSize);
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        
        // Update UI
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true, 'Microphone active. Speak vowels (A, E, I, O, U) for detection.');
        
        // Start animation loop
        animate();
        
        console.log('Microphone started successfully');
        console.log('FFT Size:', config.audio.fftSize);
        console.log('Frequency bins:', analyser.frequencyBinCount);
        
    } catch (error) {
        console.error('Error starting microphone:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        let errorMessage = `Error: ${error.message}. Click "Start Microphone" to try again.`;
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage = 'Microphone is in use by another application. Please close other applications using the microphone.';
        }
        
        updateStatus(false, errorMessage);
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
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
    
    if (vowelDetectionEl) vowelDetectionEl.textContent = currentVowel;
    if (vowelConfidenceEl) vowelConfidenceEl.textContent = '--%';
    
    console.log('Microphone stopped');
}

// Event listeners
startBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopMicrophone);
calibrateBtn.addEventListener('click', toggleCalibration);

// Enumerate audio devices and populate dropdown
async function enumerateAudioDevices() {
    try {
        // Get all audio input devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const audioInputSelect = document.getElementById('audioInput');
        if (!audioInputSelect) return;
        
        // Clear existing options except the default
        while (audioInputSelect.options.length > 1) {
            audioInputSelect.remove(1);
        }
        
        // Add each audio device as an option
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioInputSelect.options.length}`;
            audioInputSelect.appendChild(option);
        });
        
        console.log(`Found ${audioInputs.length} audio input devices`);
        
    } catch (error) {
        console.error('Error enumerating audio devices:', error);
    }
}

// Initialize on load
window.addEventListener('load', async () => {
    console.log('Application loading...');
    
    // Load configuration
    await loadConfig();
    
    // Enumerate audio devices
    await enumerateAudioDevices();
    
    // Initialize calibration UI if function exists
    // Use setTimeout to ensure DOM is fully ready
    setTimeout(() => {
        if (typeof initCalibrationUI === 'function') {
            initCalibrationUI();
            console.log('Calibration UI initialized');
        }
    }, 100);
    
    // Delay de 1 segundo para asegurar que todo esté listo antes de activar el micrófono
    setTimeout(async () => {
        console.log('Starting microphone after 1 second delay...');
        
        // Try to start microphone automatically
        try {
            await startMicrophone();
        } catch (error) {
            console.log('Automatic microphone start failed (user may need to click start):', error.message);
            updateStatus(false, 'Click "Start Microphone" to begin.');
        }
    }, 1000);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
        console.log('Page hidden - pausing visualization');
        // Visualization will pause automatically when animation frame stops
    }
});