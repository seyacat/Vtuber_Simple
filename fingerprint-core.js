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
export let debugMode = false; // Control debug logging

// Function to toggle debug mode (call from browser console: window.toggleDebugMode())
export function toggleDebugMode() {
    debugMode = !debugMode;
    console.log(`Debug mode ${debugMode ? 'ENABLED' : 'DISABLED'}`);
    if (debugMode) {
        console.log('Debug features:');
        console.log('- Frequency distribution analysis');
        console.log('- Detailed band energy logging');
        console.log('- Raw fingerprint values');
    }
}

// Make toggleDebugMode available globally
if (typeof window !== 'undefined') {
    window.toggleDebugMode = toggleDebugMode;
}

// Alternative band configurations for better vowel discrimination
export const alternativeBandConfigs = {
    // Original configuration
    original: [
        { name: "B1", range: [200, 400] },
        { name: "B2", range: [400, 800] },
        { name: "B3", range: [800, 1200] },
        { name: "B4", range: [1200, 1800] },
        { name: "B5", range: [1800, 2500] }
    ],
    // Wider bands for better distribution
    wide: [
        { name: "B1", range: [200, 500] },
        { name: "B2", range: [500, 1000] },
        { name: "B3", range: [1000, 1500] },
        { name: "B4", range: [1500, 2200] },
        { name: "B5", range: [2200, 3000] }
    ],
    // Formant-focused bands (F1 and F2 regions for vowels)
    formant: [
        { name: "F1_Low", range: [200, 500] },    // F1 for open vowels
        { name: "F1_High", range: [500, 900] },   // F1 for close vowels
        { name: "F2_Low", range: [900, 1500] },   // F2 for back vowels
        { name: "F2_Mid", range: [1500, 2200] },  // F2 for central vowels
        { name: "F2_High", range: [2200, 3000] }  // F2 for front vowels
    ],
    // Equal-width bands
    equal: [
        { name: "B1", range: [200, 760] },
        { name: "B2", range: [760, 1320] },
        { name: "B3", range: [1320, 1880] },
        { name: "B4", range: [1880, 2440] },
        { name: "B5", range: [2440, 3000] }
    ]
};

// Function to switch band configuration
export function switchBandConfig(configName) {
    if (!config || !alternativeBandConfigs[configName]) {
        console.error(`Invalid band configuration: ${configName}`);
        console.log('Available configurations:', Object.keys(alternativeBandConfigs));
        return;
    }
    
    config.fingerprintBands = alternativeBandConfigs[configName];
    console.log(`Switched to ${configName} band configuration:`);
    config.fingerprintBands.forEach((band, i) => {
        console.log(`  ${band.name}: ${band.range[0]}-${band.range[1]}Hz`);
    });
    
    // Reset fingerprint history since bands changed
    fingerprintHistory = [];
}

// Make switchBandConfig available globally
if (typeof window !== 'undefined') {
    window.switchBandConfig = switchBandConfig;
}

// Diagnostic function to analyze current frequency distribution
export function diagnoseFrequencyIssue() {
    if (!window.currentFingerprint || !Array.isArray(window.currentFingerprint)) {
        console.log('No current fingerprint available. Make sure microphone is active.');
        return;
    }
    
    console.log('=== DIAGNOSTIC ANALYSIS ===');
    console.log('Current fingerprint:', window.currentFingerprint.map(v => v.toFixed(4)));
    
    const percentages = window.currentFingerprint.map(v => v * 100);
    console.log('Band percentages:');
    config.fingerprintBands.forEach((band, i) => {
        console.log(`  ${band.name} (${band.range[0]}-${band.range[1]}Hz): ${percentages[i].toFixed(1)}%`);
    });
    
    // Check for B1 dominance
    if (percentages[0] > 80) {
        console.log('⚠️  ISSUE DETECTED: B1 dominance (>80%)');
        console.log('Possible causes:');
        console.log('1. Microphone/audio input has low-frequency bias');
        console.log('2. Voice is very low-pitched');
        console.log('3. Audio processing filters out higher frequencies');
        console.log('4. Incorrect band configuration for your voice');
        console.log('');
        console.log('Recommended actions:');
        console.log('1. Try a different microphone');
        console.log('2. Enable debug mode: toggleDebugMode()');
        console.log('3. Try alternative band config: switchBandConfig("wide")');
        console.log('4. Run calibration to capture your voice fingerprints');
    } else if (percentages[0] > 60) {
        console.log('⚠️  WARNING: B1 is dominant (>60%)');
        console.log('Consider trying switchBandConfig("formant") for better vowel discrimination');
    } else {
        console.log('✅ Band distribution looks balanced');
    }
    
    // Check if any band is near zero
    const nearZeroBands = percentages.filter(p => p < 5);
    if (nearZeroBands.length >= 3) {
        console.log('⚠️  WARNING: Multiple bands have very low energy (<5%)');
        console.log('This may reduce vowel discrimination accuracy');
    }
}

// Make diagnoseFrequencyIssue available globally
if (typeof window !== 'undefined') {
    window.diagnoseFrequencyIssue = diagnoseFrequencyIssue;
}

// Function to check current configuration and debug B1 issue
export function debugConfiguration() {
    console.log('=== CONFIGURATION DEBUG ===');
    console.log('Current config:', config);
    
    if (!config) {
        console.log('ERROR: Config not loaded');
        return;
    }
    
    console.log('Fingerprint bands:', config.fingerprintBands);
    console.log('Vowel fingerprints available:', Object.keys(config.vowelFingerprints || {}));
    
    if (config.vowelDynamicBands) {
        console.log('Dynamic bands available for:', Object.keys(config.vowelDynamicBands));
        Object.entries(config.vowelDynamicBands).forEach(([vowel, bands]) => {
            console.log(`  ${vowel}:`);
            bands.forEach((band, i) => {
                console.log(`    ${band.name}: ${band.range[0]}-${band.range[1]}Hz`);
            });
        });
    } else {
        console.log('No dynamic bands configured');
    }
    
    // Check if using dynamic bands
    if (window.currentFingerprint) {
        console.log('Current fingerprint:', window.currentFingerprint.map(v => v.toFixed(3)));
        const percentages = window.currentFingerprint.map(v => v * 100);
        console.log('Band percentages:');
        config.fingerprintBands.forEach((band, i) => {
            console.log(`  ${band.name}: ${percentages[i].toFixed(1)}%`);
        });
    }
    
    // Check localStorage
    try {
        const calibrationData = localStorage.getItem('vtube_calibration');
        if (calibrationData) {
            const parsed = JSON.parse(calibrationData);
            console.log(`LocalStorage version: ${parsed.version || '1.0'}`);
            console.log(`Sessions: ${parsed.sessions?.length || 0}`);
        } else {
            console.log('No calibration data in localStorage');
        }
    } catch (e) {
        console.log('Error reading localStorage:', e.message);
    }
}

// Make debugConfiguration available globally
if (typeof window !== 'undefined') {
    window.debugConfiguration = debugConfiguration;
}

// Function to clear calibration data and start fresh
export function clearCalibrationData() {
    try {
        localStorage.removeItem('vtube_calibration');
        console.log('Calibration data cleared from localStorage');
        
        // Also clear from config
        if (config) {
            // Reset to default fingerprints from config.json
            console.log('Resetting to default configuration...');
            
            // Reload page to apply changes
            setTimeout(() => {
                console.log('Page will reload in 2 seconds to apply changes...');
                setTimeout(() => location.reload(), 2000);
            }, 1000);
        }
    } catch (error) {
        console.error('Error clearing calibration data:', error);
    }
}

// Make clearCalibrationData available globally
if (typeof window !== 'undefined') {
    window.clearCalibrationData = clearCalibrationData;
}

// Function to calculate dynamic bands from calibration samples by finding power peaks in 5 distinct zones
function calculateDynamicBandsFromSamples(samples) {
    if (!samples || samples.length === 0) return null;
    
    const firstData = samples[0].frequencyData;
    if (!firstData) return null;
    
    if (!config || !config.audio) return null;
    
    const numBins = firstData.length;
    const avgFrequencyData = new Float32Array(numBins);
    
    // 1. Average the frequency data across all samples to find the true stable peaks for this vowel
    let validSamples = 0;
    for (const sample of samples) {
        if (sample.frequencyData && sample.frequencyData.length === numBins) {
            for (let i = 0; i < numBins; i++) {
                avgFrequencyData[i] += sample.frequencyData[i];
            }
            validSamples++;
        }
    }
    
    if (validSamples === 0) return null;
    
    for (let i = 0; i < numBins; i++) {
        avgFrequencyData[i] /= validSamples;
    }
    
    // 2. Find the highest energy peak in 5 distinct frequency zones
    const { fftSize, sampleRate } = config.audio;
    const frequencyResolution = sampleRate / fftSize;
    
    // 5 search zones that cover the typical vocal spectrum (F0 + Formants F1-F4)
    // By enforcing these zones, we guarantee 5 distributed bands that perfectly adjust
    // to the maximum power (peak) inside each zone.
    const searchZones = [
        [150, 400],   // Zone 1: Fundamental & Low F1
        [400, 800],   // Zone 2: High F1 / Low F2
        [800, 1400],  // Zone 3: Mid F2
        [1400, 2000], // Zone 4: High F2 / F3
        [2000, 3000]  // Zone 5: High F3 / F4
    ];
    
    const bands = [];
    
    for (let i = 0; i < 5; i++) {
        const [minHz, maxHz] = searchZones[i];
        const startBin = Math.max(0, Math.floor(minHz / frequencyResolution));
        const endBin = Math.min(Math.floor(maxHz / frequencyResolution), numBins - 1);
        
        let maxEnergy = -1;
        let peakBin = startBin;
        
        // Find the absolute highest peak in this zone
        for (let j = startBin; j <= endBin; j++) {
            const energy = avgFrequencyData[j]; 
            if (energy > maxEnergy) {
                maxEnergy = energy;
                peakBin = j;
            }
        }
        
        const peakFreq = peakBin * frequencyResolution;
        
        // Define a dynamic band centered perfectly on this vowel's power peak
        // A wider band captures the power more stably (e.g., peak +/- 75Hz = 150Hz width)
        const halfWidth = 75;
        let bandMin = Math.round(Math.max(80, peakFreq - halfWidth));
        let bandMax = Math.round(peakFreq + halfWidth);
        
        bands.push({
            name: `B${i + 1}`,
            range: [bandMin, bandMax],
            centerFreq: Math.round(peakFreq),
            expectedEnergy: (maxEnergy / 255.0) * (maxEnergy / 255.0) // Store approximate relative energy
        });
    }
    
    return bands;
}

export let guidedCalibration = {
    active: false,
    state: 'idle', // 'idle', 'countdown', 'capturing', 'processing', 'complete'
    currentVowelIndex: 0,
    vowels: ['A', 'E', 'I', 'O', 'U'],
    countdownValue: 3,
    capturedSamples: [],
    capturedFrequencyData: [], // Store raw frequency data for dynamic band calculation
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
    
    // Instead of average energy, find the peak energy in this band.
    // Human voice formants are narrow peaks; averaging dilutes them,
    // especially for wider bands.
    let maxEnergy = 0;
    for (let i = startBin; i <= endBin; i++) {
        const value = frequencyData[i] / 255.0; // 0.0 to 1.0
        const energy = value * value;
        if (energy > maxEnergy) {
            maxEnergy = energy;
        }
    }
    
    return maxEnergy;
}

// Calculate 5-band fingerprint from current audio data using specific bands
export function calculateFingerprint(frequencyData, bands = null) {
    // Ensure config is available
    if (!frequencyData || !config) {
        console.debug('calculateFingerprint: config not available or no frequency data');
        return null;
    }
    
    // Use provided bands or default to config.fingerprintBands
    const targetBands = bands || config.fingerprintBands;
    
    if (!targetBands || targetBands.length !== 5) {
        console.debug('calculateFingerprint: invalid bands configuration');
        return null;
    }
    
    // 1. Get the raw peak energy for each band
    const rawEnergies = targetBands.map(band =>
        getBandEnergy(frequencyData, band.range[0], band.range[1])
    );
    
    // Calculate total raw energy to check if we're just hearing noise
    const totalRaw = rawEnergies.reduce((sum, val) => sum + val, 0);
    if (totalRaw < config.detection.noiseFloor) return null;
    
    // 2. Normalize and balance the energies.
    // Low frequencies (B1/B2) will always physically contain more power than high frequencies (B4/B5).
    // If calibration 'expectedEnergy' is available, we use it to boost inherently weak bands
    // so that all 5 bands can meaningfully contribute to the fingerprint (e.g. 20% each ideally).
    const balancedEnergies = rawEnergies.map((energy, index) => {
        const band = targetBands[index];
        let balanced = energy;
        
        if (band.expectedEnergy && band.expectedEnergy > 0.0001) {
            // Relativize against what was expected during calibration for this specific band
            // The square root heavily flattens extreme variations
            balanced = Math.sqrt(energy / band.expectedEnergy); 
        } else {
            // Logarithmic fallback if no calibration data is present
            balanced = Math.log1p(energy * 100);
        }
        return Math.max(0, balanced);
    });

    // 3. Normalize the final balanced values so they strictly sum up to 1.0
    const balancedTotal = balancedEnergies.reduce((sum, val) => sum + val, 0);
    if (balancedTotal < 0.001) return null;
    
    const normalized = balancedEnergies.map(val => val / balancedTotal);
    
    // Debug logging for extreme distributions
    if (debugMode && normalized[0] > 0.8) {
        console.log('WARNING: Band dominance detected:', {
            rawEnergies: rawEnergies.map(e => e.toFixed(4)),
            balancedEnergies: balancedEnergies.map(e => e.toFixed(4)),
            normalized: normalized.map(n => n.toFixed(4)),
            dominantPercentage: (normalized[0] * 100).toFixed(1) + '%'
        });
    }
    
    return normalized;
}

// Calculate fingerprint for a specific vowel using its dynamic bands
function calculateFingerprintForVowel(frequencyData, vowel) {
    // Check if this vowel has dynamic bands
    if (config.vowelDynamicBands && config.vowelDynamicBands[vowel]) {
        const dynamicBands = config.vowelDynamicBands[vowel];
        return calculateFingerprint(frequencyData, dynamicBands);
    }
    
    // Fall back to default bands
    return calculateFingerprint(frequencyData);
}

// Classify vowel based on 5-band fingerprint
export function classifyVowelByFingerprint(fingerprint, frequencyData = null) {
    if (!fingerprint || fingerprint.length !== 5 || !config) {
        return { vowel: 'noise', confidence: 0 };
    }
    
    let bestMatch = 'noise';
    let bestDistance = Infinity;
    let bestFingerprint = fingerprint;
    
    // If we have frequency data and dynamic bands are available, use vowel-specific calculation
    if (frequencyData && config.vowelDynamicBands) {
        // Calculate fingerprint for each vowel using its specific bands
        for (const vowel of ['A', 'E', 'I', 'O', 'U']) {
            if (config.vowelDynamicBands[vowel]) {
                const vowelFingerprint = calculateFingerprintForVowel(frequencyData, vowel);
                if (!vowelFingerprint) continue;
                
                const refFingerprint = config.vowelFingerprints[vowel] || [0,0,0,0,0];
                
                // Calculate Euclidean distance
                let distance = 0;
                for (let i = 0; i < 5; i++) {
                    distance += Math.pow(vowelFingerprint[i] - refFingerprint[i], 2);
                }
                distance = Math.sqrt(distance);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = vowel;
                    bestFingerprint = vowelFingerprint;
                }
            }
        }
    }
    
    // If no dynamic bands or no frequency data, use the provided fingerprint
    if (bestMatch === 'noise') {
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
                bestFingerprint = fingerprint;
            }
        }
    }
    
    // Convert distance to confidence (0-1)
    // Max possible distance with normalized 5D vectors is ~√2 ≈ 1.414
    const confidence = Math.max(0, 1 - (bestDistance / 1.414));
    
    // Apply confidence threshold
    if (confidence < config.detection.confidenceThreshold) {
        return { vowel: 'noise', confidence: 0, fingerprint: bestFingerprint };
    }
    
    return { vowel: bestMatch, confidence: confidence, fingerprint: bestFingerprint };
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

// Debug function to show raw frequency distribution
export function debugFrequencyDistribution(frequencyData) {
    if (!debugMode || !frequencyData || !config) return;
    
    const { fftSize, sampleRate } = config.audio;
    const frequencyResolution = sampleRate / fftSize;
    const totalBins = frequencyData.length;
    
    // Calculate energy in each band for debugging
    const bandEnergies = config.fingerprintBands.map(band => {
        const minFreq = band.range[0];
        const maxFreq = band.range[1];
        const startBin = Math.floor(minFreq / frequencyResolution);
        const endBin = Math.min(Math.floor(maxFreq / frequencyResolution), totalBins - 1);
        
        let rawEnergy = 0;
        let maxValue = 0;
        let peakBin = startBin;
        
        for (let i = startBin; i <= endBin; i++) {
            const value = frequencyData[i] / 255.0;
            rawEnergy += value * value;
            if (value > maxValue) {
                maxValue = value;
                peakBin = i;
            }
        }
        
        const avgEnergy = rawEnergy / (endBin - startBin + 1);
        const peakFreq = peakBin * frequencyResolution;
        
        return {
            band: band.name,
            range: band.range,
            rawEnergy: rawEnergy,
            avgEnergy: avgEnergy,
            peakFreq: peakFreq,
            bins: endBin - startBin + 1
        };
    });
    
    // Log detailed frequency analysis (only occasionally to avoid console spam)
    if (Math.random() < 0.05) { // 5% chance each frame
        console.log('=== DEBUG FREQUENCY DISTRIBUTION ===');
        console.log(`FFT Size: ${fftSize}, Sample Rate: ${sampleRate}Hz, Resolution: ${frequencyResolution.toFixed(2)}Hz/bin`);
        console.log(`Total frequency bins: ${totalBins} (0-${(totalBins * frequencyResolution).toFixed(0)}Hz)`);
        
        bandEnergies.forEach(band => {
            console.log(`${band.band} (${band.range[0]}-${band.range[1]}Hz):`);
            console.log(`  Raw Energy: ${band.rawEnergy.toFixed(4)}, Avg: ${band.avgEnergy.toFixed(4)}`);
            console.log(`  Peak Frequency: ${band.peakFreq.toFixed(0)}Hz, Bins: ${band.bins}`);
        });
        
        // Show overall frequency profile
        const totalEnergy = bandEnergies.reduce((sum, band) => sum + band.rawEnergy, 0);
        console.log(`Total Energy: ${totalEnergy.toFixed(4)}`);
        
        if (totalEnergy > 0) {
            bandEnergies.forEach(band => {
                const percent = (band.rawEnergy / totalEnergy * 100).toFixed(1);
                console.log(`${band.band}: ${percent}%`);
            });
        }
    }
}

// Analyze 5-band fingerprint and update vowel detection
export function analyzeFingerprint(frequencyData) {
    // Debug frequency distribution
    debugFrequencyDistribution(frequencyData);
    
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
    
    // Classify vowel using 5-band fingerprint (pass frequency data for dynamic bands)
    const { vowel, confidence } = classifyVowelByFingerprint(fingerprint, frequencyData);
    
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
    
    // Debug logging for significant detections (only in debug mode)
    if (debugMode && confidence > 0.25) {
        const fingerprintStr = fingerprint.map(v => v.toFixed(2)).join(', ');
        console.log(`5-Band Fingerprint: [${fingerprintStr}] → ${vowel} (${confidence.toFixed(2)})`);
    }
    
    // Log calibration data when calibration mode is active
    if (calibrationMode) {
        logCalibrationData(vowel, fingerprint, confidence);
    }
    
    // Normal mode: minimal logging (only in debug mode and very rarely)
    if (!calibrationMode && debugMode && fingerprint && fingerprint.some(val => val > 0.1)) {
        // Create detailed band information
        const bandDetails = fingerprint.map((val, i) => {
            const band = config.fingerprintBands[i];
            const range = band.range;
            const percent = (val * 100).toFixed(1);
            return `${band.name}(${range[0]}-${range[1]}Hz):${percent}%`;
        }).join(' | ');
        
        // Reduced to 2% chance each frame (from 10%) to avoid console spam
        if (Math.random() < 0.02) {
            console.log(`Bandas: ${bandDetails}`);
            
            // Only suggest calibration in debug mode and with higher confidence
            if (vowel !== 'noise' && confidence > 0.5) {
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
    guidedCalibration.capturedFrequencyData = []; // Store raw frequency data
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
        }
        
        // Also capture raw frequency data for dynamic band calculation
        if (window.currentFrequencyData && window.currentFrequencyData.length > 0) {
            // Clone the frequency data array
            const freqDataCopy = new Uint8Array(window.currentFrequencyData.length);
            freqDataCopy.set(window.currentFrequencyData);
            guidedCalibration.capturedFrequencyData.push(freqDataCopy);
        }
        
        updateCalibrationUI();
        
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
    
    // Calculate dynamic bands for this vowel
    let dynamicBands = null;
    if (guidedCalibration.capturedFrequencyData && guidedCalibration.capturedFrequencyData.length > 0) {
        // Prepare samples for band calculation
        const bandSamples = guidedCalibration.capturedFrequencyData.map(freqData => ({
            frequencyData: freqData
        }));
        
        dynamicBands = calculateDynamicBandsFromSamples(bandSamples);
        
        if (dynamicBands) {
            console.log(`Dynamic bands for "${currentVowel}":`);
            dynamicBands.forEach(band => {
                console.log(`  ${band.name}: ${band.range[0]}-${band.range[1]}Hz (center: ${band.centerFreq}Hz)`);
            });
        }
    }
    
    // Store calibration data
    guidedCalibration.calibrationData[currentVowel] = {
        fingerprint: avgFingerprint,
        dynamicBands: dynamicBands,
        samples: guidedCalibration.capturedSamples.length,
        frequencySamples: guidedCalibration.capturedFrequencyData?.length || 0,
        timestamp: new Date().toISOString()
    };
    
    // Save to localStorage
    saveCalibrationToLocalStorage(currentVowel, avgFingerprint, dynamicBands);
    
    // Update config immediately so calibration takes effect without page reload
    if (config && config.vowelFingerprints) {
        config.vowelFingerprints[currentVowel] = avgFingerprint;
        
        // Store dynamic bands in config if available
        if (dynamicBands && !config.vowelDynamicBands) {
            config.vowelDynamicBands = {};
        }
        if (dynamicBands) {
            config.vowelDynamicBands[currentVowel] = dynamicBands;
        }
        
        console.log(`Config updated immediately for vowel "${currentVowel}"`);
    }
    
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
function saveCalibrationToLocalStorage(vowel, fingerprint, dynamicBands) {
    try {
        const storageKey = 'vtube_calibration';
        let calibrationData = JSON.parse(localStorage.getItem(storageKey)) || {
            version: '2.0', // Version 2.0 includes dynamic bands
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
                    fftSize: config.audio.fftSize,
                    hasDynamicBands: dynamicBands !== null
                }
            };
            calibrationData.sessions.push(currentSession);
        }
        
        // Add vowel data
        const vowelData = {
            fingerprint: fingerprint,
            samples: guidedCalibration.capturedSamples.length,
            frequencySamples: guidedCalibration.capturedFrequencyData?.length || 0,
            confidence: calculateConfidence(fingerprint, config.vowelFingerprints[vowel] || [0,0,0,0,0])
        };
        
        // Add dynamic bands if available
        if (dynamicBands) {
            vowelData.dynamicBands = dynamicBands.map(band => ({
                name: band.name,
                range: band.range,
                centerFreq: band.centerFreq,
                expectedEnergy: band.expectedEnergy
            }));
        }
        
        currentSession.vowels[vowel] = vowelData;
        
        localStorage.setItem(storageKey, JSON.stringify(calibrationData));
        console.log(`Calibration data for "${vowel}" saved to localStorage`);
        if (dynamicBands) {
            console.log(`  Includes ${dynamicBands.length} dynamic bands`);
        }
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
        vowelFingerprints: {},
        vowelDynamicBands: {}
    };
    
    // Extract fingerprints and dynamic bands from calibration data
    for (const [vowel, data] of Object.entries(guidedCalibration.calibrationData)) {
        if (data.fingerprint) {
            output.vowelFingerprints[vowel] = data.fingerprint.map(v => parseFloat(v.toFixed(3)));
        }
        
        if (data.dynamicBands) {
            output.vowelDynamicBands[vowel] = data.dynamicBands.map(band => ({
                name: band.name,
                range: band.range,
                centerFreq: band.centerFreq || (band.range[0] + band.range[1]) / 2,
                expectedEnergy: band.expectedEnergy || 0.2
            }));
        }
    }
    
    // Remove vowelDynamicBands if empty
    if (Object.keys(output.vowelDynamicBands).length === 0) {
        delete output.vowelDynamicBands;
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
    
    // Log dynamic bands info
    if (output.vowelDynamicBands) {
        console.log('Dynamic bands generated for:');
        Object.entries(output.vowelDynamicBands).forEach(([vowel, bands]) => {
            console.log(`  ${vowel}:`);
            bands.forEach(band => {
                console.log(`    ${band.name}: ${band.range[0]}-${band.range[1]}Hz`);
            });
        });
    }
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
