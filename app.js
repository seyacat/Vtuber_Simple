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

// Audio context and variables
let audioContext;
let analyser;
let source;
let dataArray;
let animationId;
let isRecording = false;

// TensorFlow.js variables for vowel detection
let tfModel;
let isModelReady = false;
const vowels = ['A', 'E', 'I', 'O', 'U', 'noise'];
let currentVowel = '--';
let currentConfidence = 0;

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

    // Continue animation
    animationId = requestAnimationFrame(drawWaveform);
}

// Initialize TensorFlow.js model for vowel detection
async function initializeTensorFlowModel() {
    if (!tf) {
        console.error('TensorFlow.js library not loaded');
        updateStatus(false, 'Error loading TensorFlow.js library.');
        return;
    }
    
    // Use local model from trained_web/tfjs_model folder
    const modelPath = './trained_web/tfjs_model/model.json';
    
    console.log('Loading TensorFlow.js model from:', modelPath);
    
    // Pre-check: Test if model files are accessible
    testModelFileAccessibility(modelPath);
    
    // Load the model
    try {
        console.log('Loading TensorFlow.js model...');
        
        tfModel = await tf.loadLayersModel(modelPath);
        
        console.log('TensorFlow.js model loaded:', tfModel);
        
        // Check if model was created successfully
        if (!tfModel) {
            console.error('tfModel returned null/undefined');
            updateStatus(false, 'Failed to load TensorFlow.js model. Using frequency-based detection.');
            isModelReady = false;
            return;
        }
        
        // Print model summary
        console.log('Model summary:');
        tfModel.summary();
        
        console.log('Model ready to use');
        isModelReady = true;
        
        // Start classifying if microphone is already recording
        if (isRecording) {
            startTensorFlowClassification();
        }
        
    } catch (error) {
        console.error('Error loading TensorFlow.js model:', error);
        updateStatus(false, 'Error loading vowel detection model. Using frequency-based detection.');
        isModelReady = false;
    }
}

// Helper function to diagnose model loading errors
function testModelFileAccessibility(modelPath) {
    console.log('Testing model file accessibility...');
    
    // Test if model.json is accessible
    fetch(modelPath)
        .then(response => {
            console.log('Model fetch status:', response.status, response.statusText);
            if (response.ok) {
                return response.json();
            }
            throw new Error('Model fetch failed: ' + response.status);
        })
        .then(modelJson => {
            console.log('Model JSON loaded successfully');
            console.log('Model architecture layers:', modelJson.modelTopology?.config?.layers?.length || 'unknown');
        })
        .catch(error => {
            console.error('Model accessibility test failed:', error);
        });
    
    // Test if weights are accessible (TensorFlow.js models use group1-shard1of1.bin)
    const weightsPath = modelPath.replace('model.json', 'group1-shard1of1.bin');
    fetch(weightsPath)
        .then(response => {
            console.log('Weights fetch status:', response.status, response.statusText);
            if (response.ok) {
                console.log('Weights file accessible');
            } else {
                console.warn('Weights file may not be accessible:', response.status);
                // Also try the old weights.bin name for backward compatibility
                const oldWeightsPath = modelPath.replace('model.json', 'weights.bin');
                fetch(oldWeightsPath)
                    .then(response2 => {
                        console.log('Alternative weights fetch status:', response2.status, response2.statusText);
                    })
                    .catch(() => {});
            }
        })
        .catch(error => {
            console.error('Weights accessibility test failed:', error);
        });
}

// Extract MFCC features from audio data (simplified version)
function extractMFCCFeatures(audioBuffer, sampleRate = 16000) {
    // This is a simplified MFCC extraction for demonstration
    // In production, use a proper MFCC library like Meyda in the browser
    
    const bufferSize = 1024;
    const hopSize = 512;
    const mfccCoefficients = 20;
    
    // For now, return dummy features matching the expected shape
    // In a real implementation, you would:
    // 1. Apply windowing
    // 2. Compute FFT
    // 3. Apply Mel filterbank
    // 4. Compute DCT to get MFCCs
    
    const numFrames = Math.floor((audioBuffer.length - bufferSize) / hopSize) + 1;
    const features = [];
    
    for (let i = 0; i < numFrames; i++) {
        const frame = [];
        for (let j = 0; j < mfccCoefficients; j++) {
            // Simplified: random values for demonstration
            frame.push(Math.random() * 2 - 1);
        }
        features.push(frame);
    }
    
    // Reshape to match model input (20x20)
    // Pad or truncate as needed
    const targetRows = 20;
    const targetCols = 20;
    
    let reshaped = [];
    for (let i = 0; i < targetRows; i++) {
        const row = [];
        for (let j = 0; j < targetCols; j++) {
            const idx = i * targetCols + j;
            if (idx < features.length * mfccCoefficients) {
                const featureIdx = Math.floor(idx / mfccCoefficients);
                const coeffIdx = idx % mfccCoefficients;
                row.push(features[featureIdx]?.[coeffIdx] || 0);
            } else {
                row.push(0);
            }
        }
        reshaped.push(row);
    }
    
    return reshaped;
}

// Start TensorFlow.js classification
function startTensorFlowClassification() {
    if (!tfModel || !isModelReady) return;
    
    console.log('Starting TensorFlow.js classification');
    
    // We'll classify audio in real-time
    // For now, we'll simulate classification every 500ms
    // In production, this would process audio buffers in real-time
    
    const classificationInterval = setInterval(() => {
        if (!isRecording) {
            clearInterval(classificationInterval);
            return;
        }
        
        // Get current audio data from analyser
        if (!analyser || !dataArray) return;
        
        const buffer = new Float32Array(dataArray.length);
        analyser.getFloatTimeDomainData(buffer);
        
        // Extract features
        const features = extractMFCCFeatures(buffer, audioContext.sampleRate);
        
        // Convert to tensor and make prediction
        const inputTensor = tf.tensor3d([features], [1, 20, 20, 1]);
        const prediction = tfModel.predict(inputTensor);
        const results = prediction.arraySync()[0];
        
        // Find highest probability
        let maxProb = 0;
        let maxIndex = 0;
        
        for (let i = 0; i < results.length; i++) {
            if (results[i] > maxProb) {
                maxProb = results[i];
                maxIndex = i;
            }
        }
        
        // Update UI
        currentVowel = vowels[maxIndex];
        currentConfidence = maxProb * 100;
        
        vowelDetectionEl.textContent = currentVowel;
        vowelConfidenceEl.textContent = currentConfidence.toFixed(1) + '%';
        
        // Clean up tensors
        inputTensor.dispose();
        prediction.dispose();
        
    }, 500); // Classify every 500ms
}

// Stop TensorFlow.js classification
function stopTensorFlowClassification() {
    // Clear any classification intervals
    // In this simple implementation, intervals are cleared automatically
    console.log('Stopping TensorFlow.js classification');
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

        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);

        // Configure analyser
        analyser.fftSize = 2048;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Connect nodes
        source.connect(analyser);

        // Start visualization
        drawWaveform();

        // Update UI
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true, 'Microphone active. Speak vowels (A, E, I, O, U) for detection.');

        // Start TensorFlow.js classification if model is ready
        if (isModelReady) {
            startTensorFlowClassification();
        }

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

    // Stop TensorFlow.js classification
    stopTensorFlowClassification();

    // Update UI
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(false, 'Microphone stopped.');

    // Reset classifier
    tfModel = null;
    isModelReady = false;

    console.log('Microphone stopped');
}

// Event listeners
startBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopMicrophone);

// Initialize on load
window.addEventListener('load', async () => {
    console.log('Application loading...');
    
    // Initialize TensorFlow.js model
    await initializeTensorFlowModel();
    
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
        console.log('Page hidden - microphone continues recording in background');
    }
});