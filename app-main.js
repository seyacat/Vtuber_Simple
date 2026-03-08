// Main Application File
// Depends on config.js and fingerprint-core.js

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
    if (!isRecording || !dataArray) return;
    
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
    analyzeFingerprint();
    
    // Draw waveform
    drawWaveform();
    
    // Continue animation
    animationId = requestAnimationFrame(animate);
}

// Start microphone
async function startMicrophone() {
    if (isRecording) return;
    
    try {
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: config.audio.sampleRate
        });
        
        // Get microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: config.audio.sampleRate
            }
        });
        
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
        
    } catch (error) {
        console.error('Error starting microphone:', error);
        updateStatus(false, `Error: ${error.message}. Click "Start Microphone" to try again.`);
        
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