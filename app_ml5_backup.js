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

// ML5 variables for vowel detection
let soundClassifier;
let isClassifierReady = false;
const vowels = ['A', 'E', 'I', 'O', 'U'];
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

// Initialize ML5 sound classifier for vowel detection
async function initializeSoundClassifier() {
    if (!ml5) {
        console.error('ML5 library not loaded');
        updateStatus(false, 'Error loading ML5 library.');
        return;
    }
    
    // Use local model from techeable folder
    // Note: ml5 may have issues with local files in some browsers
    // If it fails, we'll use frequency-based detection as fallback
    
    // Use relative path as requested
    // IMPORTANT: The ./ prefix is important for correct relative path resolution
    const soundModel = './techeable/model.json';
    
    console.log('Loading sound classifier from:', soundModel);
    console.log('Current page URL:', window.location.href);
    console.log('Expected model URL:', new URL(soundModel, window.location.href).href);
    
    // Pre-check: Test if model files are accessible
    testModelFileAccessibility(soundModel);
    
    // Options for the classifier
    const options = {
        overlapFactor: 0.5,   // más rápido
        probabilityThreshold: 0.5
    };
    
    // Load the model
    try {
        console.log('Creating sound classifier...');
        
        // ml5.soundClassifier returns a Promise in v1.3.1
        // Use await to get the classifier directly
        soundClassifier = await ml5.soundClassifier(soundModel, options);
        
        console.log('Sound classifier loaded:', soundClassifier);
        
        // Check if classifier was created successfully
        if (!soundClassifier) {
            console.error('soundClassifier returned null/undefined');
            updateStatus(false, 'Failed to create sound classifier. Using frequency-based detection.');
            isClassifierReady = false;
            return;
        }
        
        // Check which classification method is available
        const hasClassifyStartMethod = typeof soundClassifier.classifyStart === 'function';
        const hasClassifyMethod = typeof soundClassifier.classify === 'function';
        
        console.log('Classifier methods - classifyStart:', hasClassifyStartMethod, 'classify:', hasClassifyMethod);
        
        if (hasClassifyStartMethod || hasClassifyMethod) {
            console.log('Classifier ready to use');
            isClassifierReady = true;
            
            // Start classifying if microphone is already recording
            if (isRecording) {
                startML5Classification();
            }
        } else {
            console.error('Classifier missing classification methods');
            console.log('Available methods:');
            for (let key in soundClassifier) {
                if (typeof soundClassifier[key] === 'function') {
                    console.log('  -', key);
                }
            }
            
            updateStatus(false, 'Model loaded but classification API not found. Using frequency-based detection.');
            isClassifierReady = false;
        }
        
    } catch (error) {
        console.error('Error creating sound classifier:', error);
        updateStatus(false, 'Error loading vowel detection model. Using frequency-based detection.');
        isClassifierReady = false;
    }
}

// Helper function to diagnose model loading errors
function diagnoseModelLoadingError(error) {
    console.log('=== Model Loading Diagnosis ===');
    
    // Check if it's a network/metadata issue
    if (error.message && error.message.includes('metadata')) {
        console.log('Issue appears to be with metadata loading');
        console.log('Testing metadata accessibility...');
        
        // Test if metadata.json is accessible
        fetch('./techeable/metadata.json')
            .then(response => {
                console.log('Metadata fetch status:', response.status, response.statusText);
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Metadata fetch failed: ' + response.status);
            })
            .then(metadata => {
                console.log('Metadata loaded successfully:', metadata);
            })
            .catch(err => {
                console.error('Metadata test failed:', err);
                console.log('Suggested fix: Ensure server is running and files are accessible');
            });
    }
    
    // Check if it's a TensorFlow.js issue
    if (window.tf) {
        console.log('TensorFlow.js loaded, version:', tf.version.tfjs);
        console.log('Backend:', tf.getBackend());
    } else {
        console.log('TensorFlow.js not detected (may be bundled with ml5)');
    }
    
    console.log('Current page URL:', window.location.href);
    console.log('Model path relative to page:', './techeable/model.json');
    console.log('Expected metadata URL:', new URL('./techeable/metadata.json', window.location.href).href);
    console.log('=== End Diagnosis ===');
}

// Test if model files are accessible before loading
function testModelFileAccessibility(modelPath) {
    console.log('=== Testing model file accessibility ===');
    
    // Extract base path from model path
    const basePath = modelPath.replace('/model.json', '');
    
    // Test model.json
    fetch(modelPath)
        .then(response => {
            console.log('model.json status:', response.status, response.statusText);
            if (response.ok) {
                return response.json().then(data => {
                    console.log('model.json loaded, has', data.modelTopology?.config?.layers?.length || 0, 'layers');
                    return true;
                });
            }
            throw new Error('model.json fetch failed: ' + response.status);
        })
        .then(() => {
            // Test metadata.json
            const metadataPath = basePath + '/metadata.json';
            return fetch(metadataPath)
                .then(response => {
                    console.log('metadata.json status:', response.status, response.statusText);
                    if (response.ok) {
                        return response.json().then(data => {
                            console.log('metadata.json loaded, labels:', data.wordLabels);
                            return true;
                        });
                    }
                    throw new Error('metadata.json fetch failed: ' + response.status);
                });
        })
        .then(() => {
            // Test weights.bin (just check if it exists)
            const weightsPath = basePath + '/weights.bin';
            return fetch(weightsPath, { method: 'HEAD' })
                .then(response => {
                    console.log('weights.bin status:', response.status, response.statusText);
                    if (response.ok) {
                        console.log('weights.bin accessible, size:', response.headers.get('content-length'), 'bytes');
                        return true;
                    }
                    throw new Error('weights.bin fetch failed: ' + response.status);
                });
        })
        .then(() => {
            console.log('All model files are accessible');
        })
        .catch(error => {
            console.error('Model file accessibility test failed:', error);
            console.log('Suggested fixes:');
            console.log('1. Ensure server is running (not file:// protocol)');
            console.log('2. Check file paths are correct');
            console.log('3. Verify CORS headers if serving from different origin');
        })
        .finally(() => {
            console.log('=== End accessibility test ===');
        });
}

// Fallback vowel detection based on frequency analysis
function detectVowelFromFrequency(frequency) {
    if (frequency < 85) return { vowel: '--', confidence: 0 };
    
    // Simple frequency-based vowel detection (fallback)
    let vowel = '--';
    let confidence = 0;
    
    if (frequency >= 85 && frequency < 180) {
        vowel = 'U';
        confidence = Math.min(95, 70 + (frequency - 85) / 2);
    } else if (frequency >= 180 && frequency < 350) {
        vowel = 'O';
        confidence = Math.min(95, 75 + (frequency - 180) / 3);
    } else if (frequency >= 350 && frequency < 550) {
        vowel = 'A';
        confidence = Math.min(95, 80 + (frequency - 350) / 4);
    } else if (frequency >= 550 && frequency < 850) {
        vowel = 'E';
        confidence = Math.min(95, 75 + (frequency - 550) / 6);
    } else if (frequency >= 850 && frequency < 1200) {
        vowel = 'I';
        confidence = Math.min(95, 70 + (frequency - 850) / 7);
    }
    
    return { vowel, confidence };
}

// Start ML5 classification
function startML5Classification() {
    if (!soundClassifier || !isClassifierReady) return;
    
    console.log('Starting ML5 classification...');
    
    // Check which method is available
    if (typeof soundClassifier.classifyStart === 'function') {
        console.log('Using classifyStart() method (Teachable Machine model)');
        // classifyStart receives results directly, not (error, results)
        soundClassifier.classifyStart((results) => {
            if (results && results[0]) {
                const label = results[0].label;
                const confidence = results[0].confidence * 100;
                processClassificationResult(label, confidence);
            }
        });
    } else if (typeof soundClassifier.classify === 'function') {
        console.log('Using classify() method (pre-trained model)');
        // classify receives (error, results)
        soundClassifier.classify((error, results) => {
            if (error) {
                console.error('Classification error:', error);
                return;
            }
            
            if (results && results[0]) {
                const label = results[0].label;
                const confidence = results[0].confidence * 100;
                processClassificationResult(label, confidence);
            }
        });
    } else {
        console.error('No classification method available');
    }
}

// Process classification result
function processClassificationResult(label, confidence) {
    // Check if it's a vowel (handle Spanish "Ruido de fondo")
    if (vowels.includes(label.toUpperCase())) {
        currentVowel = label.toUpperCase();
        currentConfidence = confidence;
        updateVowelDisplay(currentVowel, currentConfidence);
    } else if (label === 'Ruido de fondo' || label === 'Background Noise') {
        // Reset display for background noise
        currentVowel = '--';
        currentConfidence = 0;
        updateVowelDisplay(currentVowel, currentConfidence);
    }
}

// Stop ML5 classification
function stopML5Classification() {
    if (!soundClassifier) return;
    
    // Check which stop method is available
    if (typeof soundClassifier.classifyStop === 'function') {
        console.log('Stopping classification with classifyStop()');
        soundClassifier.classifyStop();
    } else if (soundClassifier.stop && typeof soundClassifier.stop === 'function') {
        console.log('Stopping classification with stop()');
        soundClassifier.stop();
    }
}

// Update vowel display
function updateVowelDisplay(vowel, confidence) {
    vowelDetectionEl.textContent = vowel;
    vowelConfidenceEl.textContent = confidence.toFixed(0) + '%';
    
    // Update color based on confidence
    if (confidence > 70) {
        vowelDetectionEl.style.color = '#4cffd8';
        vowelConfidenceEl.style.color = '#4cffd8';
    } else if (confidence > 40) {
        vowelDetectionEl.style.color = '#ffd700';
        vowelConfidenceEl.style.color = '#ffd700';
    } else {
        vowelDetectionEl.style.color = '#ff8fa3';
        vowelConfidenceEl.style.color = '#ff8fa3';
    }
}

// Start microphone capture with selected device
async function startMicrophone() {
    try {
        const selectedDeviceId = audioInputSelect.value;
        
        // Build constraints based on selection
        const constraints = {
            audio: {
                echoCancellation: false, // Disable for better vowel detection
                noiseSuppression: false, // Disable for better vowel detection
                autoGainControl: false   // Disable for better vowel detection
            }
        };
        
        // If a specific device is selected (not "default"), add deviceId constraint
        if (selectedDeviceId && selectedDeviceId !== 'default') {
            constraints.audio.deviceId = { exact: selectedDeviceId };
        }
        
        // Request microphone access with constraints
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);

        // Connect nodes
        source.connect(analyser);
        
        // Configure analyser
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Update UI
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(true, 'Microphone active. Speak to see the waveform.');

        // Start visualization
        drawWaveform();

        // Calculate and display dominant frequency
        function updateFrequency() {
            if (!analyser || !dataArray) return;
            
            analyser.getByteFrequencyData(dataArray);
            
            // Find dominant frequency
            let maxIndex = 0;
            let maxValue = 0;
            
            for (let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] > maxValue) {
                    maxValue = dataArray[i];
                    maxIndex = i;
                }
            }
            
            // Calculate frequency
            const nyquist = audioContext.sampleRate / 2;
            const frequency = (maxIndex / dataArray.length) * nyquist;
            
            if (frequency > 20) { // Ignore very low frequencies
                frequencyValueEl.textContent = frequency.toFixed(0) + ' Hz';
                
                // Use frequency-based detection only if ML5 classifier is not ready
                if (!isClassifierReady) {
                    const vowelResult = detectVowelFromFrequency(frequency);
                    if (vowelResult.vowel !== '--') {
                        currentVowel = vowelResult.vowel;
                        currentConfidence = vowelResult.confidence;
                        updateVowelDisplay(currentVowel, currentConfidence);
                    }
                }
            }
            
            if (isRecording) {
                setTimeout(updateFrequency, 200);
            }
        }
        
        updateFrequency();

        // Initialize sound classifier
        await initializeSoundClassifier();

    } catch (error) {
        console.error('Error accessing microphone:', error);
        updateStatus(false, 'Error accessing microphone: ' + error.message + '. Click "Start Microphone" to try again.');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// Stop microphone capture
function stopMicrophone() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (source) {
        source.disconnect();
        source = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Stop ML5 classification if active
    stopML5Classification();
    
    // Reset classifier
    soundClassifier = null;
    isClassifierReady = false;

    // Update UI
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(false, 'Microphone stopped.');

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Reset displays
    volumeLevelEl.textContent = '0 dB';
    frequencyValueEl.textContent = '0 Hz';
    updateVowelDisplay('--', 0);
}

// Save selected device when user changes selection
audioInputSelect.addEventListener('change', () => {
    const selectedDeviceId = audioInputSelect.value;
    if (selectedDeviceId) {
        localStorage.setItem('lastAudioDeviceId', selectedDeviceId);
    }
});

// Update start button to refresh device list on click if no devices are listed
startBtn.addEventListener('click', async () => {
    if (!isRecording) {
        // If no devices are listed, try to refresh the list
        if (audioInputSelect.options.length <= 1) {
            updateStatus(false, 'Refreshing device list...');
            await getAudioDevices();
        }
        
        // Save the selected device before starting
        const selectedDeviceId = audioInputSelect.value;
        if (selectedDeviceId) {
            localStorage.setItem('lastAudioDeviceId', selectedDeviceId);
        }
        
        startMicrophone();
    }
});

stopBtn.addEventListener('click', stopMicrophone);

// Handle page visibility change - just update status but don't stop recording
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
        updateStatus(true, 'Microphone active (tab in background). Speak to see the waveform.');
    } else if (isRecording) {
        updateStatus(true, 'Microphone active. Speak to see the waveform.');
    }
});

// Get and list available audio devices
async function getAudioDevices() {
    try {
        // First get permission to access devices
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Stop the temporary stream
        tempStream.getTracks().forEach(track => track.stop());
        
        // Get all devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter audio input devices
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        // Clear existing options
        audioInputSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.textContent = 'Default Microphone';
        audioInputSelect.appendChild(defaultOption);
        
        // Add each audio input device
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${audioInputSelect.options.length}`;
            audioInputSelect.appendChild(option);
        });
        
        // Try to restore last selected device
        const lastDeviceId = localStorage.getItem('lastAudioDeviceId');
        if (lastDeviceId) {
            // Check if the device still exists
            const deviceExists = audioInputs.some(device => device.deviceId === lastDeviceId);
            if (deviceExists) {
                audioInputSelect.value = lastDeviceId;
            }
        }
        
        return audioInputs;
    } catch (error) {
        console.error('Error getting audio devices:', error);
        return [];
    }
}

// Initial canvas draw
ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
ctx.fillRect(0, 0, canvasWidth, canvasHeight);
ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
ctx.font = '18px Arial';
ctx.textAlign = 'center';
ctx.fillText('Starting microphone...', canvasWidth / 2, canvasHeight / 2);

// Browser compatibility check and initialization
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateStatus(false, 'Your browser does not support microphone access. Please use Chrome, Firefox, Edge, or Safari.');
    startBtn.disabled = true;
    audioInputSelect.disabled = true;
} else {
    // Update status
    updateStatus(false, 'Loading audio devices...');
    
    // Get and list audio devices
    getAudioDevices().then(devices => {
        if (devices.length > 0) {
            updateStatus(false, 'Starting microphone automatically...');
            startBtn.disabled = false;
            
            // Start microphone automatically after a short delay
            setTimeout(() => {
                if (!isRecording) {
                    startMicrophone();
                }
            }, 1000);
        } else {
            updateStatus(false, 'No audio input devices found. Please connect a microphone.');
            startBtn.disabled = true;
        }
    }).catch(error => {
        console.error('Error initializing audio devices:', error);
        updateStatus(false, 'Error loading audio devices. Click "Start Microphone" to try again.');
        startBtn.disabled = false;
    });
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', async () => {
        await getAudioDevices();
    });
}