// lpc-core.js
// Linear Predictive Coding (LPC) and Formant Detection
import { config } from './config.js';

// Global variables for fingerprint detection
export let currentVowel = '--';
export let currentConfidence = 0;
export let formantsHistory = [];
const MAX_HISTORY = 20;

export let debugMode = false;
export let logFormants = false;
export let calibrationMode = false;

// Configuración cargada desde localStorage
export let calibratedVowels = null;

// Guided calibration state
export let guidedCalibration = {
    active: false,
    state: 'idle', // 'idle', 'countdown', 'capturing', 'processing', 'complete'
    currentVowelIndex: 0,
    vowels: ['A', 'E', 'I', 'O', 'U'],
    countdownValue: 3,
    capturedSamples: [],
    calibrationData: {},
    sessionId: null,
    
    // Statistics
    samplesPerVowel: 5,
    sampleInterval: 200, // ms entre capturas
    lastCaptureTime: 0,
    
    // UI elements cache
    uiElements: null
};

// Cargar calibración al inicio
export function loadCalibrationFromLocalStorage() {
    try {
        const data = localStorage.getItem('vtube_lpc_calibration');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.vowels && Object.keys(parsed.vowels).length === 5) {
                calibratedVowels = parsed.vowels;
                console.log("Loaded custom LPC calibration from localStorage:", calibratedVowels);
            }
        }
    } catch (e) {
        console.error("Error loading calibration:", e);
    }
}
// Ejecutar inmediatamente al importar
loadCalibrationFromLocalStorage();

// Function to toggle debug mode
export function toggleDebugMode() {
    debugMode = !debugMode;
    console.log(`Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
}

export function toggleCalibrationLog() {
    logFormants = !logFormants;
    console.log(`=============================`);
    console.log(`Calibration Logging: ${logFormants ? 'ON' : 'OFF'}`);
    if (logFormants) {
        console.log(`Speak vowels clearly. We will log the highest energy Formants (F1, F2).`);
    } else {
        console.log(`=============================`);
    }
}

if (typeof window !== 'undefined') {
    window.toggleDebugMode = toggleDebugMode;
}

// 1. Calculate LPC coefficients using Levinson-Durbin recursion
export function computeLPC(timeData, order) {
    const n = timeData.length;
    
    // Filtro Pre-emphasis (alpha = 0.90 para acentuar formantes sobre el murmullo de fondo)
    const preEmphasized = new Float32Array(n);
    const alpha = 0.90; 
    preEmphasized[0] = timeData[0];
    for (let i = 1; i < n; i++) {
        preEmphasized[i] = timeData[i] - alpha * timeData[i - 1];
    }
    
    // Ventana de Hamming para suavizar bordes del frame y eliminar ruido de los cortes
    for (let i = 0; i < n; i++) {
        preEmphasized[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    }

    // Autocorrelación
    const r = new Float32Array(order + 1);
    for (let i = 0; i <= order; i++) {
        let sum = 0;
        for (let j = 0; j < n - i; j++) {
            sum += preEmphasized[j] * preEmphasized[j + i];
        }
        r[i] = sum;
    }

    // Algoritmo de Levinson-Durbin
    const a = new Float32Array(order + 1);
    a[0] = 1;
    if (r[0] === 0) return a;
    
    let e = r[0];
    const k = new Float32Array(order + 1);

    for (let i = 1; i <= order; i++) {
        let sum = 0;
        for (let j = 1; j < i; j++) {
            sum += a[j] * r[i - j];
        }
        k[i] = (r[i] - sum) / e;
        
        const a_prev = new Float32Array(a);
        a[i] = k[i];
        for (let j = 1; j < i; j++) {
            a[j] = a_prev[j] - k[i] * a_prev[i - j];
        }
        
        e *= (1 - k[i] * k[i]);
    }
    
    return a;
}

// 2. Extraer Formantes desde los coeficientes LPC
export function detectFormantsLPC(timeData, sampleRate, order = 12) {
    const lpc = computeLPC(timeData, order);
    
    const formants = [];
    const numBins = 256; 
    const spectrum = new Float32Array(numBins);
    
    for (let w = 0; w < numBins; w++) {
        const omega = (Math.PI * w) / numBins;
        let re = 0;
        let im = 0;
        
        // Evaluar polinomio A(z) filter = 1 - a1*z^-1 - a2*z^-2 ...
        for (let k = 0; k <= order; k++) {
            const coeff = (k === 0) ? 1 : -lpc[k];
            re += coeff * Math.cos(k * omega);
            im -= coeff * Math.sin(k * omega);
        }
        
        // Espectro de amplitud H(z) = 1 / A(z)
        spectrum[w] = 1.0 / Math.sqrt(re * re + im * im);
    }
    
    // Buscar picos locales en el espectro
    for (let w = 1; w < numBins - 1; w++) {
        if (spectrum[w] > spectrum[w - 1] && spectrum[w] > spectrum[w + 1]) {
            const freq = (w / numBins) * (sampleRate / 2);
            // Formantes típicos de la voz humana están entre 200Hz y 4000Hz
            if (freq > 200 && freq < 4000) {
                formants.push({ freq: freq, amplitude: spectrum[w] });
            }
        }
    }
    
    // Ordenar SOLO por frecuencia. Los formantes reales son simplemente 
    // las resonancias a medida que subimos en el espectro (F1 es la 1ra acústica, F2 la 2da).
    formants.sort((a, b) => a.freq - b.freq);

    return {
        F1: formants.length > 0 ? formants[0].freq : 0,
        F2: formants.length > 1 ? formants[1].freq : 0,
        F3: formants.length > 2 ? formants[2].freq : 0
    };
}

// 3. Simple árbol de decisión basado en tus reglas
export function classifyVowelLPC(F1, F2) {
    if (F1 === 0 || F2 === 0) return { vowel: '--', confidence: 0 };
    
    let vowel = '--';
    let confidence = 1.0; 

    // Uso de calibración cargada (Clasificación basada en Distancia Euclidiana más corta al centroide)
    if (calibratedVowels) {
        let bestMatch = '--';
        let minDistance = Infinity;

        for (const [v, data] of Object.entries(calibratedVowels)) {
            const refF1 = data.F1;
            const refF2 = data.F2;
            
            // Ponderamos F1 y F2 de forma más equilibrada (1.0 y 0.8)
            const dF1 = F1 - refF1;
            const dF2 = F2 - refF2;
            const distance = Math.sqrt((dF1 * dF1 * 1.0) + (dF2 * dF2 * 0.8));

            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = v;
            }
        }
        
        // Si la distancia es muy grande, asumimos que no es vocal pura (o es ruido)
        // Aumentado a 1500Hz para no cortar vocales habladas fuera de tono
        if (minDistance > 1500) { 
            vowel = '--';
            confidence = 0;
        } else {
            vowel = bestMatch;
            confidence = Math.max(0, 1 - (minDistance / 1500));
        }

    } else {
        // Reglas de fallback originales basadas en umbrales duros
        if (F1 > 600) {
            vowel = "A";
        } else if (F1 < 450 && F2 > 1800) {
            vowel = "I";
        } else if (F1 < 450 && F2 < 1200) {
            vowel = "U";
        } else if (F2 > 1600) {
            vowel = "E"; 
        } else {
            vowel = "O"; 
        }
    }

    return { vowel, confidence };
}

// Check if audio has enough volume to process
function calculateVolumeDb(timeData) {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
        sum += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sum / timeData.length);
    return 20 * Math.log10(rms + 1e-10);
}

// 4. Main analysis loop called from app-main.js
export function analyzeFrame(timeData, sampleRate) {
    const volumeDb = calculateVolumeDb(timeData);

    // Skip processing if below noise floor
    if (volumeDb < config.detection.minVolumeDb) {
        currentVowel = '--';
        currentConfidence = 0;

        if (typeof vowelDetectionEl !== 'undefined') {
            vowelDetectionEl.textContent = currentVowel;
            vowelConfidenceEl.textContent = '--%';
        }
        if (typeof frequencyValueEl !== 'undefined') {
            frequencyValueEl.textContent = '0 Hz';
        }
        return;
    }

    // Normalizar el sample entero al 1.0 máx
    let maxAmp = 0;
    const n = timeData.length;
    for (let i = 0; i < n; i++) {
        const absVal = Math.abs(timeData[i]);
        if (absVal > maxAmp) maxAmp = absVal;
    }
    
    const normalizedData = new Float32Array(n);
    if (maxAmp > 0) {
        for (let i = 0; i < n; i++) {
            normalizedData[i] = timeData[i] / maxAmp;
        }
    } else {
        return; // silencio total
    }

    // Usar Order 24 para micrófonos 16kHz analizando TODO el buffer (4096 frames = ~256ms)
    // para estar 100% seguros de que capturamos las super bajas frecuencias de la O y la U
    const formants = detectFormantsLPC(normalizedData, sampleRate, 24);
    
    // Si estamos en proceso de capturar calibración, guardamos y salimos aquí.
    if (guidedCalibration.active && guidedCalibration.state === 'capturing') {
        const now = Date.now();
        if (now - guidedCalibration.lastCaptureTime > guidedCalibration.sampleInterval) {
             processCalibrationSample(formants);
             guidedCalibration.lastCaptureTime = now;
        }
        return;
    }

    // Classify
    const { vowel, confidence } = classifyVowelLPC(formants.F1, formants.F2);

    // Track history for smoothing
    formantsHistory.push({ vowel, confidence, formants });
    if (formantsHistory.length > MAX_HISTORY) {
        formantsHistory.shift();
    }

    // Apply smoothing (majority vote over recent history)
    const smoothingWindow = Math.min(config.detection.smoothingWindow, formantsHistory.length);
    const recentHistory = formantsHistory.slice(-smoothingWindow);
    
    // Count vowel occurrences in recent history
    const vowelCounts = {};
    let maxCount = 0;
    let mostFrequentVowel = '--';

    for (const entry of recentHistory) {
        if (entry.vowel === '--') continue;
        vowelCounts[entry.vowel] = (vowelCounts[entry.vowel] || 0) + 1;
        if (vowelCounts[entry.vowel] > maxCount) {
            maxCount = vowelCounts[entry.vowel];
            mostFrequentVowel = entry.vowel;
        }
    }

    // Calculate average confidence for the most frequent vowel
    let avgConfidence = 0;
    if (mostFrequentVowel !== '--') {
        const relevantEntries = recentHistory.filter(entry => entry.vowel === mostFrequentVowel);
        avgConfidence = relevantEntries.reduce((sum, entry) => sum + entry.confidence, 0) / relevantEntries.length;
    }

    // Update global variables
    currentVowel = mostFrequentVowel;
    currentConfidence = avgConfidence * 100;

    // Update UI if elements are available
    if (typeof vowelDetectionEl !== 'undefined') {
        vowelDetectionEl.textContent = currentVowel;
        vowelConfidenceEl.textContent = currentConfidence.toFixed(1) + '%';
    }
    
    // Output F1, F2 to the frequency value element
    if (typeof frequencyValueEl !== 'undefined') {
        if (currentVowel !== '--') {
             frequencyValueEl.textContent = `F1: ${Math.round(formants.F1)}Hz | F2: ${Math.round(formants.F2)}Hz`;
        } else {
             frequencyValueEl.textContent = '--';
        }
    }

    // Optional debug output
    if (debugMode && currentVowel !== '--') {
        console.log(`LPC - F1: ${Math.round(formants.F1)}Hz, F2: ${Math.round(formants.F2)}Hz, Vowel: ${currentVowel}`);
    }

    // Direct Formant Logging for Calibration (no rules applied)
    if (logFormants) {
        if (formants.F1 > 0 && formants.F2 > 0) {
            console.log(`[CALIBRATION] F1: ${Math.round(formants.F1).toString().padStart(4, ' ')} Hz | F2: ${Math.round(formants.F2).toString().padStart(4, ' ')} Hz -> Current Logic: ${vowel}`);
        }
    }
}

// ==========================================
// GUIDED CALIBRATION UI FUNCTIONS
// ==========================================

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
    
    if (guidedCalibration.uiElements.cancelCalibration) {
        guidedCalibration.uiElements.cancelCalibration.addEventListener('click', cancelGuidedCalibration);
    }
    if (guidedCalibration.uiElements.nextVowel) {
        guidedCalibration.uiElements.nextVowel.addEventListener('click', nextVowelInCalibration);
    }
    if (guidedCalibration.uiElements.closeCalibration) {
        guidedCalibration.uiElements.closeCalibration.addEventListener('click', closeCalibration);
    }
    
    console.log('LPC Calibration UI initialized');
}

export function toggleCalibration() {
    if (guidedCalibration.active) {
        cancelGuidedCalibration();
    } else {
        startGuidedCalibration();
    }
}

function startGuidedCalibration() {
    if (!guidedCalibration.uiElements || !guidedCalibration.uiElements.overlay) {
        initCalibrationUI();
    }
    
    guidedCalibration.active = true;
    guidedCalibration.state = 'idle';
    guidedCalibration.currentVowelIndex = 0;
    guidedCalibration.calibrationData = {};
    guidedCalibration.sessionId = 'session_' + Date.now();
    calibrationMode = true;
    
    const { overlay } = guidedCalibration.uiElements;
    if (overlay) overlay.classList.remove('hidden');
    
    resetVowelIndicators();
    prepareNextVowel();
}

function prepareNextVowel() {
    guidedCalibration.state = 'countdown';
    guidedCalibration.countdownValue = 3;
    guidedCalibration.capturedSamples = [];
    
    const currentVowel = guidedCalibration.vowels[guidedCalibration.currentVowelIndex];
    updateUIState(currentVowel);
    
    const { nextVowel, calibrationInstructions } = guidedCalibration.uiElements;
    if (nextVowel) nextVowel.disabled = true;
    if (calibrationInstructions) calibrationInstructions.textContent = `Preparándose para capturar la vocal "${currentVowel}"`;
    
    updateVowelIndicator(currentVowel, 'active');
    
    runCountdown(() => {
        guidedCalibration.state = 'capturing';
        guidedCalibration.lastCaptureTime = Date.now();
        if (calibrationInstructions) {
             calibrationInstructions.textContent = `¡Mantén pronunciada la vocal "${currentVowel}"!`;
        }
    });
}

function runCountdown(callback) {
    const { countdownNumber } = guidedCalibration.uiElements;
    
    if (guidedCalibration.countdownValue > 0) {
        if (countdownNumber) countdownNumber.textContent = guidedCalibration.countdownValue;
        guidedCalibration.countdownValue--;
        setTimeout(() => runCountdown(callback), 1000);
    } else {
        if (countdownNumber) countdownNumber.textContent = "GO!";
        setTimeout(callback, 500);
    }
}

function processCalibrationSample(formants) {
    if (guidedCalibration.state !== 'capturing') return;
    
    // Omit invalid samples (silence/noise)
    if (formants.F1 < 100 || formants.F2 < 200) return;
    
    guidedCalibration.capturedSamples.push({ F1: formants.F1, F2: formants.F2 });
    
    const totalNeeded = guidedCalibration.samplesPerVowel;
    const current = guidedCalibration.capturedSamples.length;
    const percent = Math.round((current / totalNeeded) * 100);
    
    const { capturedSamples, currentConfidence, calibrationState } = guidedCalibration.uiElements;
    
    if (capturedSamples) capturedSamples.textContent = `${current}/${totalNeeded}`;
    if (currentConfidence) currentConfidence.textContent = `${percent}%`;
    if (calibrationState) calibrationState.textContent = "Capturando...";
    
    if (current >= totalNeeded) {
        guidedCalibration.state = 'processing';
        processVowelData();
    }
}

function processVowelData() {
    const currentVowel = guidedCalibration.vowels[guidedCalibration.currentVowelIndex];
    const samples = guidedCalibration.capturedSamples;
    
    // Average F1 and F2
    let sumF1 = 0, sumF2 = 0;
    for (let s of samples) {
        sumF1 += s.F1;
        sumF2 += s.F2;
    }
    
    const avgF1 = sumF1 / samples.length;
    const avgF2 = sumF2 / samples.length;
    
    guidedCalibration.calibrationData[currentVowel] = {
        F1: avgF1,
        F2: avgF2
    };
    
    updateVowelIndicator(currentVowel, 'complete');
    
    const { calibrationState, calibrationInstructions, nextVowel } = guidedCalibration.uiElements;
    if (calibrationState) calibrationState.textContent = "Completado";
    if (calibrationInstructions) {
        calibrationInstructions.textContent = `¡Bien! F1: ${Math.round(avgF1)}Hz, F2: ${Math.round(avgF2)}Hz.`;
    }
    
    if (nextVowel) {
        if (guidedCalibration.currentVowelIndex < guidedCalibration.vowels.length - 1) {
            nextVowel.disabled = false;
            nextVowel.focus();
        } else {
            finishCalibration();
        }
    }
}

function nextVowelInCalibration() {
    if (guidedCalibration.currentVowelIndex < guidedCalibration.vowels.length - 1) {
        guidedCalibration.currentVowelIndex++;
        prepareNextVowel();
    }
}

function finishCalibration() {
    guidedCalibration.state = 'complete';
    calibrationMode = false;
    
    const { nextVowel, calibrationInstructions, calibrationOutput, closeCalibration, cancelCalibration } = guidedCalibration.uiElements;
    
    if (nextVowel) nextVowel.style.display = 'none';
    if (cancelCalibration) cancelCalibration.style.display = 'none';
    if (closeCalibration) {
        closeCalibration.style.display = 'inline-block';
        closeCalibration.disabled = false;
    }
    
    if (calibrationInstructions) calibrationInstructions.textContent = "¡Calibración Completada!";
    
    const finalData = {
        version: "2.0",
        type: "LPC",
        timestamp: Date.now(),
        vowels: guidedCalibration.calibrationData
    };
    
    if (calibrationOutput) {
        calibrationOutput.textContent = JSON.stringify(finalData, null, 2);
    }
    
    // Guardar dinamicamente en localStorage
    localStorage.setItem('vtube_lpc_calibration', JSON.stringify(finalData));
    
    // Recargar la variable de memoria instantaneamente
    loadCalibrationFromLocalStorage();
}

function closeCalibration() {
    guidedCalibration.active = false;
    calibrationMode = false;
    
    const { overlay } = guidedCalibration.uiElements;
    if (overlay) overlay.classList.add('hidden');
    
    // Reset buttons for next time
    const { nextVowel, cancelCalibration, closeCalibration } = guidedCalibration.uiElements;
    if (nextVowel) {
        nextVowel.style.display = 'inline-block';
        nextVowel.disabled = true;
    }
    if (cancelCalibration) cancelCalibration.style.display = 'inline-block';
    if (closeCalibration) closeCalibration.style.display = 'none';
}

function cancelGuidedCalibration() {
    guidedCalibration.active = false;
    calibrationMode = false;
    
    const { overlay } = guidedCalibration.uiElements;
    if (overlay) overlay.classList.add('hidden');
}

function updateUIState(vowel) {
    const { currentVowelDisplay, capturedSamples, currentConfidence, calibrationState } = guidedCalibration.uiElements;
    
    if (currentVowelDisplay) currentVowelDisplay.textContent = vowel;
    if (capturedSamples) capturedSamples.textContent = `0/${guidedCalibration.samplesPerVowel}`;
    if (currentConfidence) currentConfidence.textContent = "0%";
    if (calibrationState) calibrationState.textContent = "Preparando...";
}

function updateVowelIndicator(vowel, status) {
    if (!guidedCalibration.uiElements.vowelIndicators) return;
    
    guidedCalibration.uiElements.vowelIndicators.forEach(indicator => {
        if (indicator.dataset.vowel === vowel) {
            indicator.className = `vowel-indicator ${status}`;
        }
    });
}

function resetVowelIndicators() {
    if (!guidedCalibration.uiElements.vowelIndicators) return;
    
    guidedCalibration.uiElements.vowelIndicators.forEach(indicator => {
        indicator.className = 'vowel-indicator';
    });
}
