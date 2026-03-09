import { config } from './config.js';

export let currentVowel = '--';
export let currentConfidence = 0;
export let fingerprintHistory = [];
export let debugMode = false;
export let logFingerprints = false;
export let calibrationMode = false;
export let calibratedVowels = null;

// Dynamic Noise Floor
export let dynamicNoiseFloor = -70;

// ─────────────────────────────────────────────
// VOCAL ATTACK DETECTION STATE
// ─────────────────────────────────────────────
let prevFreqData = null;           // Previous frame spectrum (for spectral flux)
let activeWindows = [];            // Overlapping classification windows [{start, votes, voteCount}]
let lastAttackTime = 0;            // Timestamp of last detected attack (for min gap)
let lastEnergyDb = -90;            // Frame-to-frame energy
let smoothedSpeechEnergy = -90;    // LERP baseline of active-speech energy (volume-adaptive)
let syllableCount = 0;             // Vocal attacks detected in current word

export let guidedCalibration = {
    active: false,
    state: 'idle',
    currentVowelIndex: 0,
    vowels: ['A', 'E', 'I', 'O', 'U'],
    countdownValue: 3,
    capturedSamples: [],
    calibrationData: {},
    sessionId: null,
    samplesPerVowel: 5,
    sampleInterval: 200,
    lastCaptureTime: 0,
    uiElements: null
};

// Default prototype distances (User calibrated)
const DEFAULT_VOWELS = {
    "A": [0.9659723043441772, 1, 0.4510713517665863, 0.7208947539329529, 0.8955518007278442, 0.47053176164627075, 0.42510586977005005, 0.3575659394264221, 0.3338295817375183, 0.6224409937858582, 0.5537418127059937, 0.5714792013168335, 0.5692380666732788, 0.3696885108947754, 0.37473899126052856, 0.4672175943851471, 0.4404880404472351, 0.5530982613563538, 0.5840141177177429, 0.6271981596946716, 0.2432708740234375, 0.2237958163022995, 0.22678740322589874, 0.13506662845611572, 0.19653105735778809, 0.09141435474157333, 0.14720706641674042, 0.1192001923918724, 0.3756933808326721, 0.3079545199871063, 0.03230282664299011, 0.005192529410123825],
    "E": [0.943577766418457, 1, 0.43366995453834534, 0.6397799253463745, 0.9430304765701294, 0.6606689691543579, 0.510572612285614, 0.6760281920433044, 0.36966946721076965, 0.5750716924667358, 0.550457775592804, 0.25066235661506653, 0.15805873274803162, 0.10654256492853165, 0.10452502965927124, 0.04758799821138382, 0.08586328476667404, 0.10803506523370743, 0.05517394468188286, 0.1071736216545105, 0.2202662229537964, 0.28297650814056396, 0.31904134154319763, 0.4672289788722992, 0.6110979318618774, 0.5359951257705688, 0.37970659136772156, 0.3770754933357239, 0.4228692054748535, 0.39785927534103394, 0.08035438507795334, 0.013726036064326763],
    "I": [0.896406352519989, 1, 0.4674939215183258, 0.46092310547828674, 0.9699603915214539, 0.865512490272522, 0.3530031740665436, 0.3677613139152527, 0.32623499631881714, 0.20340974628925323, 0.16164550185203552, 0.1630762368440628, 0.16032205522060394, 0.13626813888549805, 0.06114523485302925, 0.03973754867911339, 0.1407979279756546, 0.13373227417469025, 0.08245283365249634, 0.04156947880983353, 0.004087082110345364, 0.04578974097967148, 0.09081777185201645, 0.14007548987865448, 0.1690593808889389, 0.2523176372051239, 0.46270281076431274, 0.5761769413948059, 0.48699474334716797, 0.3926791548728943, 0.49128979444503784, 0.31626230478286743],
    "O": [0.9266482591629028, 1, 0.43999403715133667, 0.5173195004463196, 0.9374138116836548, 0.7625671625137329, 0.5024504661560059, 0.8255583047866821, 0.5619111061096191, 0.6460407972335815, 0.6628864407539368, 0.3483990430831909, 0.35093849897384644, 0.44078516960144043, 0.6310254335403442, 0.304616779088974, 0.26069480180740356, 0.19222848117351532, 0.17346951365470886, 0.06168140098452568, 0.014217990450561047, 0.03146175295114517, 0.05495205521583557, 0.07966801524162292, 0.1203463077545166, 0.06948743015527725, 0.021635595709085464, 0.026838237419724464, 0.028700584545731544, 0.08498381078243256, 0.09662479162216187, 0.04613679274916649],
    "U": [0.9111712574958801, 1, 0.494159072637558, 0.5147597193717957, 0.996119499206543, 0.878070056438446, 0.4573550820350647, 0.6921578645706177, 0.5348049402236938, 0.4343442916870117, 0.46330133080482483, 0.315676212310791, 0.342404305934906, 0.28349605202674866, 0.4905938506126404, 0.2964491546154022, 0.1832818239927292, 0.1758238524198532, 0.10106201469898224, 0.05515860393643379, 0.04420366883277893, 0.05132274702191353, 0.1283615231513977, 0.1910594254732132, 0.15561914443969727, 0.10514891147613525, 0.06295297294855118, 0.06753771007061005, 0.06977017968893051, 0.055528342723846436, 0.05764179304242134, 0]
};

export function loadCalibrationFromLocalStorage() {
    try {
        const data = localStorage.getItem('vtube_mel_calibration');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.vowels && Object.keys(parsed.vowels).length >= 5) {
                // Remove Silencio data if it existed
                if (parsed.vowels['Silencio']) delete parsed.vowels['Silencio'];
                calibratedVowels = parsed.vowels;
                console.log("Loaded custom MEL calibration from localStorage");
            }
        }
    } catch (e) {
        console.error("Error loading calibration:", e);
    }
    
    // Load saved noise floor
    const savedNoiseFloor = localStorage.getItem('vtube_noise_floor');
    if (savedNoiseFloor !== null && !isNaN(parseFloat(savedNoiseFloor))) {
        dynamicNoiseFloor = parseFloat(savedNoiseFloor);
        console.log("Loaded dynamic noise floor from localStorage:", dynamicNoiseFloor.toFixed(2), "dB");
    }
}
loadCalibrationFromLocalStorage();

let lastNoiseFloorSaveTime = 0;

export function toggleDebugMode() {
    debugMode = !debugMode;
    console.log(`Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
}

export function toggleCalibrationLog() {
    logFingerprints = !logFingerprints;
    console.log(`=============================`);
    console.log(`Calibration Logging: ${logFingerprints ? 'ON' : 'OFF'}`);
    if (logFingerprints) {
        console.log(`Speak vowels clearly. We will log the Mel Fingerprints.`);
    } else {
        console.log(`=============================`);
    }
}

if (typeof window !== 'undefined') {
    window.toggleDebugMode = toggleDebugMode;
}

// MEL FILTERBANK IMPLEMENTATION
const NUM_MEL_FILTERS = 32;
let melFilterbank = null; // initialized on first frame
const MIN_VOICE_HZ = 85; 
const MAX_VOICE_HZ = 255;

let holdVowelTimer = null; // Temporizador para mantener la vocal viva y compensar el delay

function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

function initMelFilters(sampleRate, fftSize) {
    const numBins = Math.floor(fftSize / 2);
    melFilterbank = [];
    
    // Config limits or sensible defaults for human voice
    const minFreq = config.audio?.minFrequency || 80;
    const maxFreq = config.audio?.maxFrequency || 8000;
    
    const minMel = hzToMel(minFreq);
    const maxMel = hzToMel(maxFreq);
    const melStep = (maxMel - minMel) / (NUM_MEL_FILTERS + 1);
    
    const melPoints = [];
    for (let i = 0; i < NUM_MEL_FILTERS + 2; i++) {
        melPoints.push(melToHz(minMel + i * melStep));
    }
    
    const binFreqs = [];
    for (let i = 0; i < numBins; i++) {
        binFreqs.push((i * sampleRate) / fftSize);
    }
    
    for (let i = 0; i < NUM_MEL_FILTERS; i++) {
        const filter = new Float32Array(numBins);
        const left = melPoints[i];
        const center = melPoints[i + 1];
        const right = melPoints[i + 2];
        
        for (let j = 0; j < numBins; j++) {
            const freq = binFreqs[j];
            if (freq > left && freq <= center) {
                filter[j] = (freq - left) / (center - left);
            } else if (freq > center && freq < right) {
                filter[j] = (right - freq) / (right - center);
            }
        }
        melFilterbank.push(filter);
    }
}

function computeMelFingerprint(freqData, sampleRate, fftSize) {
    if (!melFilterbank) {
        initMelFilters(sampleRate, fftSize);
    }
    
    const fingerprint = new Float32Array(NUM_MEL_FILTERS);
    const linearPower = new Float32Array(freqData.length);
    
    for (let i = 0; i < freqData.length; i++) {
        let db = freqData[i];
        if (db < -100) db = -100; // clamp
        linearPower[i] = Math.pow(10, db / 10);
    }
    
    for (let i = 0; i < NUM_MEL_FILTERS; i++) {
        let sum = 0;
        for (let j = 0; j < freqData.length; j++) {
            sum += linearPower[j] * melFilterbank[i][j];
        }
        
        const logEnergy = sum > 0 ? Math.log10(sum) : -10;
        fingerprint[i] = logEnergy;
    }
    
    let minE = fingerprint[0];
    let maxE = fingerprint[0];
    for (let i = 1; i < NUM_MEL_FILTERS; i++) {
        if (fingerprint[i] < minE) minE = fingerprint[i];
        if (fingerprint[i] > maxE) maxE = fingerprint[i];
    }
    
    const range = maxE - minE;
    if (range > 0) {
        for (let i = 0; i < NUM_MEL_FILTERS; i++) {
            fingerprint[i] = (fingerprint[i] - minE) / range;
        }
    } else {
        for (let i = 0; i < NUM_MEL_FILTERS; i++) {
            fingerprint[i] = 0;
        }
    }
    
    return fingerprint;
}

export function classifyVowelMel(fingerprint) {
    let vowel = '--';
    let confidence = 0;
    
    let targetDict = calibratedVowels || DEFAULT_VOWELS;
    
    let minDistance = Infinity;
    
    for (const [v, rawData] of Object.entries(targetDict)) {
        
        // Safety wrap: Si es la data por defecto (1D) o no tiene estructura KNN, la forzamos a 1 muestra (2D).
        // Si ya es un arreglo de muestras (KNN), lo usamos tal cual.
        const samplesArray = (typeof rawData[0] === 'number') ? [rawData] : rawData;
        
        // Probamos el frame actual contra TODAS las sub-muestras de esta vocal
        for (const refFp of samplesArray) {
            let dist = 0;
            for (let i = 0; i < NUM_MEL_FILTERS; i++) {
                const diff = fingerprint[i] - refFp[i];
                dist += diff * diff;
            }
            dist = Math.sqrt(dist);
            
            // Si esta forma específica de decir la vocal está más cerca, ganamos
            if (dist < minDistance) {
                minDistance = dist;
                vowel = v;
            }
        }
    }
    
    
    const maxDist = config.detection?.maxEuclideanDistance || 2.0; 
    
    // Si la distancia es mayor al umbral o la vocal es un respiro (consonantes descartadas)
    if (minDistance > maxDist || vowel === '--') {
        vowel = '--';
        confidence = 0;
    } else {
        confidence = Math.max(0, 1 - (minDistance / maxDist));
    }
    
    return { vowel, confidence, minDistance };
}

function commitWindow(w) {
    if (w.voteCount === 0) return;
    
    // Encontrar la vocal más votada en esa ventana temporal
    let bestVowel = '--';
    let maxVotes = 0;
    for (const [v, count] of Object.entries(w.votes)) {
        // En caso de empate de frames, gana la vocal que haya acumulado mayor confianza combinada
        const currentConfSum = w.confidences[v];
        const bestConfSum = w.confidences[bestVowel] || 0;
        
        if (count > maxVotes || (count === maxVotes && currentConfSum > bestConfSum)) {
            maxVotes = count;
            bestVowel = v;
        }
    }
    
    const ratio = maxVotes / w.voteCount;
    const minRatio = config.detection?.attackMinVoteRatio ?? 0.35;
    
    if (ratio >= minRatio && bestVowel !== '--') {
        currentVowel = bestVowel;
        // Asignamos una confianza artificial basada en el ratio de votos de esa ventana
        currentConfidence = Math.min(100, Math.round(ratio * 100));
        
        // --- HOLD TIMER LOGIC ---
        // Para compensar el delay introducido por el tamaño de la ventana (ej. 200ms), 
        // le regalaremos a la UI esos mismos 200ms de vida extra AL FINAL de la palabra.
        const isCalibrating = guidedCalibration.active && guidedCalibration.state === 'capturing';
        const holdDuration = isCalibrating 
            ? (config.detection?.calibrationWindowMs ?? 300) 
            : (config.detection?.attackWindowMs ?? 200);

        if (holdVowelTimer) clearTimeout(holdVowelTimer);
        
        // Configuramos la muerte programada de la vocal.
        holdVowelTimer = setTimeout(() => {
            // Solo borramos si el motor principal está en silencio actualmente (currentConfidence en 0)
            if (currentConfidence === 0 && typeof vowelDetectionEl !== 'undefined') {
                vowelDetectionEl.textContent = '--';
                vowelConfidenceEl.textContent = '0%';
            }
        }, holdDuration);

        // Actualizamos UI Inmediatamente
        if (typeof vowelDetectionEl !== 'undefined') {
            vowelDetectionEl.textContent = currentVowel;
            vowelConfidenceEl.textContent = currentConfidence + '%';
        }

        // Increment syllable count ONLY for normal words (not silences, not calibrating)
        if (!isCalibrating && currentVowel !== '--') {
            syllableCount++;
            const syllableEl = document.getElementById('syllableCount');
            if (syllableEl) syllableEl.textContent = `${syllableCount} síl.`;
        }

        // --- CALIBRATION FINGERPRINT PROCESSING ---
        if (isCalibrating && w.fingerprints.length > 0) {
            const avgFp = new Float32Array(NUM_MEL_FILTERS);
            for (let i = 0; i < NUM_MEL_FILTERS; i++) {
                let sum = 0;
                for (let j = 0; j < w.fingerprints.length; j++) {
                    sum += w.fingerprints[j][i];
                }
                avgFp[i] = sum / w.fingerprints.length;
            }
            // Trigger the UI callback to store this single attack sample
            processCalibrationSample(avgFp);
        }

        if (debugMode) console.log(`[COMMIT] Vowel: ${bestVowel} (${(ratio*100).toFixed(0)}% agreement) - Syllables: ${syllableCount}`);
    } else {
        if (debugMode) console.log(`[DISCARD] No consensus (best: ${bestVowel} at ${(ratio*100).toFixed(0)}%)`);
    }
}

function calculateVolumeDb(timeData) {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
        sum += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sum / timeData.length);
    return 20 * Math.log10(rms + 1e-10);
}

/**
 * Spectral Flux: measures how fast the spectrum is changing.
 * Returns a value in [0, 1] where 1 = maximum spectral change.
 */
function computeSpectralFlux(freqData) {
    if (!prevFreqData || prevFreqData.length !== freqData.length) {
        prevFreqData = new Float32Array(freqData);
        return 0;
    }
    let flux = 0;
    const len = freqData.length;
    for (let i = 0; i < len; i++) {
        // Half-wave rectification: only count increases (positive onset energy)
        const diff = freqData[i] - prevFreqData[i];
        if (diff > 0) flux += diff;
    }
    // Copy current frame as previous for next call
    prevFreqData.set(freqData);
    // Normalize: flux is in dB-units; divide by len to get per-bin average
    return flux / len;
}

/**
 * Decides whether a new vocal onset (attack) is happening.
 * Uses a combination of:
 *   - energyDb rising above the active threshold
 *   - spectral flux above a minimum threshold
 */
function detectVocalAttack(energyDb, spectralFlux, activeThreshold, isStartOfWord) {
    // Rise relative to the adaptive speech baseline — volume-independent
    const energyRise = energyDb - smoothedSpeechEnergy;
    const fluxThreshold      = config.detection?.attackFluxThreshold ?? 0.5;
    const energyRiseThreshold = config.detection?.attackEnergyRise  ?? 2.5;
    const phoneticFluxThreshold = config.detection?.attackPhoneticFluxThreshold ?? 0.7;
    const pureEnergyRiseThreshold = config.detection?.attackPureEnergyRiseThreshold ?? 5.0;

    // Camino 1: Subida de volumen + mutación de frecuencia (Estricto)
    const isVolumeAttack = (energyRise > energyRiseThreshold && spectralFlux > fluxThreshold);
    
    // Camino 2: Habla continua sin salto de volumen. Gran mutación de frecuencia fonética ("HO-LA")
    // Note: It ONLY requires the raw energy to be above the noise floor (activeThreshold) and a high flux mutation.
    const isPhoneticAttack = (energyDb > activeThreshold && spectralFlux > phoneticFluxThreshold);

    // Camino 3: Subida pura de Fuerza/Gravedad. Pasa de un sonido débil a uno fuerte.
    const isPureEnergyAttack = (energyRise > pureEnergyRiseThreshold);

    let isAttack = false;
    if (energyDb > activeThreshold) {
        if (isStartOfWord) {
            // Al inicio de la palabra exigimos volumen Y flujo fonético 
            // para evitar disparar falsas vocales por ruidos iniciales.
            isAttack = isVolumeAttack;
        } else {
            // A mitad de la palabra somos flexibles.
            isAttack = (isVolumeAttack || isPhoneticAttack || isPureEnergyAttack);
        }
    }

    let attackType = '';
    if (isAttack) {
        if (isStartOfWord) attackType = 'NEW WORD';
        else if (isVolumeAttack) attackType = 'VOLUME';
        else if (isPhoneticAttack) attackType = 'PHONETIC';
        else if (isPureEnergyAttack) attackType = 'ENERGY';
    }

    // Actualiza la UI de diagnóstico en tiempo real
    const elEnergy = document.getElementById('debugEnergyRise');
    const elFlux = document.getElementById('debugFlux');
    if (elEnergy && elFlux) {
        elEnergy.textContent = Math.max(0, energyRise).toFixed(2);
        elFlux.textContent = spectralFlux.toFixed(2);
        
        // Colores de Energy Rise
        if (isAttack && attackType === 'ENERGY') {
            elEnergy.style.color = '#f0f'; // Magenta brillante si fue de Pura Energía
        } else if (energyRise > energyRiseThreshold) {
            elEnergy.style.color = '#0f0'; // Verde clásico
        } else {
            elEnergy.style.color = '#fff';
        }
        
        // Colores de Flux
        if (isAttack && attackType === 'PHONETIC') {
            elFlux.style.color = '#0ff'; // Cyan brillante si fue ataque Fonético
        } else if (spectralFlux > phoneticFluxThreshold) {
            elFlux.style.color = '#ff0'; // Amarillo: Supera el umbral fonético pero no atacó por alguna razón matemática
        } else if (spectralFlux > fluxThreshold) {
            elFlux.style.color = '#0f0'; // Verde: Superó base pero no fonética (Sirve para Camino 1)
        } else {
            elFlux.style.color = '#fff';
        }
        
        document.getElementById('debugThrEnergyRise').textContent = `${energyRiseThreshold.toFixed(1)} ó ${pureEnergyRiseThreshold.toFixed(1)} (puro)`;
        document.getElementById('debugThrFlux').textContent = `${fluxThreshold.toFixed(1)} ó ${phoneticFluxThreshold.toFixed(1)} (fonético)`;
    }

    // LOGGING DETALLADO PARA DEPURAR FALSOS POSITIVOS
    if (isAttack) {
        const timeStr = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
        console.log(`%c[ATTACK TRIGGERED ${timeStr}]%c [${attackType}] energyRise: ${energyRise.toFixed(2)} (umbral: ${energyRiseThreshold}), flux: ${spectralFlux.toFixed(2)} (umbral: ${fluxThreshold})`, 'color: #00ff00; font-weight: bold;', 'color: inherit;');
    } else if (energyDb > activeThreshold && (energyRise > energyRiseThreshold || spectralFlux > fluxThreshold)) {
        // Solo para ver si casi pasa (uno de los dos umbrales se cumplió)
        // console.log(`[ATTACK NEAR MISS] energyRise: ${energyRise.toFixed(2)}/${energyRiseThreshold}, flux: ${spectralFlux.toFixed(2)}/${fluxThreshold}`);
    }

    return isAttack;
}

export function analyzeFrame(timeData, freqData, sampleRate, fftSize) {
    const volumeDb = calculateVolumeDb(timeData);

    // DYNAMIC NOISE FLOOR ALGORITHM
    if (volumeDb < dynamicNoiseFloor) {
        dynamicNoiseFloor += (volumeDb - dynamicNoiseFloor) * (config.detection?.lerpAttackDown || 0.5);
    } else {
        dynamicNoiseFloor += (volumeDb - dynamicNoiseFloor) * (config.detection?.lerpDecayUp || 0.001);
    }
    if (dynamicNoiseFloor > -30) dynamicNoiseFloor = -30;
    if (dynamicNoiseFloor < -90) dynamicNoiseFloor = -90;

    const activeThreshold = dynamicNoiseFloor + (config.detection?.noiseFloorMargin || 8.0);

    // Save the noise floor every 2 seconds
    const now = Date.now();
    if (now - lastNoiseFloorSaveTime > 2000) {
        localStorage.setItem('vtube_noise_floor', dynamicNoiseFloor.toString());
        lastNoiseFloorSaveTime = now;
    }

    // ── SILENCE CHECK ─────────────────────────────────────────────────────────
    if (volumeDb < activeThreshold) {
        currentConfidence = 0;
        // Flush any open windows when we go silent
        for (const w of activeWindows) commitWindow(w);
        activeWindows = [];
        lastEnergyDb = volumeDb;
        
        // Cancelar el timer para que no sobreescriba tardíamente
        if (holdVowelTimer) {
            clearTimeout(holdVowelTimer);
            holdVowelTimer = null;
        }

        // El usuario solicitó volver a borrar la UI inmediatamente en el silencio
        if (typeof vowelDetectionEl !== 'undefined') {
            vowelDetectionEl.textContent = '--';
            vowelConfidenceEl.textContent = '0%';
        }
        
        if (typeof frequencyValueEl !== 'undefined') {
            frequencyValueEl.textContent = 'Silence';
        }
        return;
    }

    // ── SPECTRAL FLUX ─────────────────────────────────────────────────────────
    const spectralFlux = computeSpectralFlux(freqData);

    // ── VOCAL ATTACK DETECTION — overlapping windows ──────────────────────────
    // En calibración queremos capturas limpias y aisladas, sin solapamiento
    const isCalibrating = guidedCalibration.active && guidedCalibration.state === 'capturing';
    
    const windowDuration  = isCalibrating 
        ? (config.detection?.calibrationWindowMs ?? 300) 
        : (config.detection?.attackWindowMs ?? 200);
        
    const minGapMs        = isCalibrating
        ? (config.detection?.calibrationCooldownMs ?? 500)
        : (config.detection?.attackCooldownMs ?? 80);
        
    const wordBoundaryMs  = config.detection?.wordBoundaryMs ?? 500;
    const isStartOfWord   = (now - lastAttackTime > wordBoundaryMs);

    if (now - lastAttackTime > minGapMs) {
        if (detectVocalAttack(volumeDb, spectralFlux, activeThreshold, isStartOfWord)) {
            // Flush any currently open windows BEFORE starting the new one
            for (const w of activeWindows) {
                const duration = now - w.start;
                if (debugMode) console.log(`[ATTACK OVERRIDE] Closing window early at ${duration}ms`);
                commitWindow(w);
            }
            activeWindows = [];

            // If too much time passed since last attack — this is a new word
            if (now - lastAttackTime > wordBoundaryMs) {
                syllableCount = 0;
                const syllableEl = document.getElementById('syllableCount');
                if (syllableEl) syllableEl.textContent = '0 síl.';
                if (debugMode) console.log('[WORD] New word boundary detected');
            }
            
            activeWindows.push({
                start: now,
                votes: {},
                confidences: {},   // Sumatoria de confianza matemática para desempates
                voteCount: 0,
                fingerprints: []   // always allocated; used by calibration
            });
            lastAttackTime = now;
            // Snap baseline to current volume so we don't re-trigger continuously on the same rising edge
            smoothedSpeechEnergy = volumeDb; 
            
            if (debugMode) console.log(`[ATTACK] flux:${spectralFlux.toFixed(2)} energy:${volumeDb.toFixed(1)}dB`);
        }
    }

    // Expire windows that have run their full duration
    const stillActive = [];
    for (const w of activeWindows) {
        if (now - w.start > windowDuration) {
            commitWindow(w);
        } else {
            stillActive.push(w);
        }
    }
    activeWindows = stillActive;

    // Update energy trackers AFTER attack detection
    lastEnergyDb = volumeDb;
    const lerpSpeech = config.detection?.lerpSpeechEnergy ?? 0.05;
    smoothedSpeechEnergy += (volumeDb - smoothedSpeechEnergy) * lerpSpeech;

    // ── MEL FINGERPRINT ───────────────────────────────────────────────────────
    const fingerprint = computeMelFingerprint(freqData, sampleRate, fftSize);

    // ── CLASSIFICATION (fed into all open windows) ────────────────────────────
    if (activeWindows.length === 0) {
        if (typeof frequencyValueEl !== 'undefined') {
            frequencyValueEl.textContent = `Flux:${spectralFlux.toFixed(2)}`;
        }
        return;
    }

    const { vowel, confidence, minDistance } = classifyVowelMel(fingerprint);

    // Feed this frame's vote and fingerprints into every active window
    for (const w of activeWindows) {
        // Only count votes if it's a valid recognized vowel
        if (vowel !== '--') {
            w.votes[vowel] = (w.votes[vowel] || 0) + 1;
            w.confidences[vowel] = (w.confidences[vowel] || 0) + confidence;
            w.voteCount++;
        }
        
        // Calibration mode: store the raw fingerprint unconditionally 
        // We need ALL frames inside the attack window to learn new bounds
        if (guidedCalibration.active && guidedCalibration.state === 'capturing') {
            w.fingerprints.push(new Float32Array(fingerprint));
        }
    }

    if (debugMode) {
        console.log(`[WINDOW×${activeWindows.length}] ${vowel} flux:${spectralFlux.toFixed(2)}`);
    }
    if (logFingerprints) {
        console.log(`[CALIBRATION] Fingerprint: [${Array.from(fingerprint).map(v => v.toFixed(2)).join(',')}] -> Logic: ${vowel}`);
    }
    if (typeof frequencyValueEl !== 'undefined') {
        frequencyValueEl.textContent = `Flux:${spectralFlux.toFixed(2)} Dist:${minDistance.toFixed(2)}`;
    }
}


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
    
    console.log('MEL Calibration UI initialized');
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
    if (calibrationInstructions)
        calibrationInstructions.textContent = `Prepárate para decir "${currentVowel}" varias veces`;

    updateVowelIndicator(currentVowel, 'active');

    runCountdown(() => {
        guidedCalibration.state = 'capturing';
        if (calibrationInstructions) {
            calibrationInstructions.textContent =
                `Di "${currentVowel}" ${guidedCalibration.samplesPerVowel} veces seguidas`;
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

function processCalibrationSample(fingerprint) {
    if (guidedCalibration.state !== 'capturing') return;
    
    guidedCalibration.capturedSamples.push(new Float32Array(fingerprint));
    
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
    // Convert float32 arrays to regular arrays for easy JSON storage
    const samples = guidedCalibration.capturedSamples.map(sample => Array.from(sample));
    
    // Guardamos el arreglo bidimensional con TODAS las muestras (ej. 5 muestras de 32 coeficientes)
    guidedCalibration.calibrationData[currentVowel] = samples;
    
    updateVowelIndicator(currentVowel, 'complete');
    
    const { calibrationState, calibrationInstructions, nextVowel } = guidedCalibration.uiElements;
    if (calibrationState) calibrationState.textContent = "Completado";
    if (calibrationInstructions) {
        calibrationInstructions.textContent = `¡Bien! Huella capturada para ${currentVowel}.`;
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
        version: "3.0",
        type: "MEL",
        timestamp: Date.now(),
        vowels: guidedCalibration.calibrationData
    };
    
    if (calibrationOutput) {
        calibrationOutput.textContent = JSON.stringify(finalData, null, 2);
    }
    
    localStorage.setItem('vtube_mel_calibration', JSON.stringify(finalData));
    loadCalibrationFromLocalStorage();
}

function closeCalibration() {
    guidedCalibration.active = false;
    calibrationMode = false;
    
    const { overlay } = guidedCalibration.uiElements;
    if (overlay) overlay.classList.add('hidden');
    
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
