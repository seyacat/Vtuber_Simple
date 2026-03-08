# Calibration Guide for 5-Band Fingerprint System

## How Calibration Works

The system uses **5 frequency bands** to create a spectral fingerprint of your voice:
- **B1**: 200-400Hz (very low frequency)
- **B2**: 400-800Hz (low frequency)  
- **B3**: 800-1200Hz (medium frequency)
- **B4**: 1200-1800Hz (medium-high frequency)
- **B5**: 1800-2500Hz (high frequency)

Each vowel (A, E, I, O, U) has a unique pattern of energy distribution across these 5 bands.

## Step-by-Step Calibration Process

### 1. Start the Application
- Open `index.html` in a modern browser (Chrome, Firefox, Edge)
- Allow microphone permission when prompted
- The microphone should start automatically

### 2. Enter Calibration Mode
- Click the **purple "Calibrar" button** (bottom right of control buttons)
- The button will turn **orange with pulsing animation** and say "Calibrando..."
- Check the browser console (F12 → Console tab)

### 3. Calibration Logs
In calibration mode, the console will show:
```
=== CALIBRATION MODE: ON ===
Speak vowels (A, E, I, O, U) clearly.
The system will log 5-band fingerprint values in real-time.
Check browser console (F12 → Console tab) to see values.
```

### 4. Speak Vowels Clearly
- Speak each vowel **clearly and consistently**: A, E, I, O, U
- The console will show real-time band values:
```
CALIBRATION - B1(200-400Hz):45.2% | B2(400-800Hz):30.1% | B3(800-1200Hz):15.3% | B4(1200-1800Hz):7.2% | B5(1800-2500Hz):2.2%
  Fingerprint: [0.452, 0.301, 0.153, 0.072, 0.022]
  Detected: "A" (68.5% confidence)
  Suggested update for "A": [0.352, 0.361, 0.166, 0.086, 0.007]
  Current reference: [0.300, 0.400, 0.200, 0.100, 0.000]
```

### 5. Update Configuration
1. Copy the **"Suggested update"** values from console
2. Open `config.json`
3. Find the vowel section (e.g., `"A": [0.3, 0.4, 0.2, 0.1, 0.0]`)
4. Replace with the suggested values
5. Save the file and refresh the browser page

### 6. Exit Calibration Mode
- Click the **orange "Calibrando..." button** again
- The button returns to purple "Calibrar"
- System returns to normal detection mode

## Troubleshooting

### No logs appearing?
1. Check browser console is open (F12 → Console)
2. Verify microphone is active (green status indicator)
3. Speak louder - system needs sufficient volume
4. Check if calibration mode is ON (orange pulsing button)

### Low confidence detections?
- Speak vowels more clearly and consistently
- Move closer to microphone
- Reduce background noise
- The system needs confidence >15% to show vowel suggestions

### Microphone not starting?
- Click "Start Microphone" button manually
- Check browser permissions (allow microphone)
- Try a different browser

## Expected Fingerprint Patterns

- **A**: High in B1-B3, low in B4-B5
- **E**: Medium in B2-B3, high in B4-B5  
- **I**: Very high in B5, low in B1-B3
- **O**: High in B2-B3, low in B1, B4-B5
- **U**: Very high in B1, medium in B2-B3

## File Structure

- `config.js` - Configuration and loading
- `fingerprint-core.js` - Fingerprint calculation and calibration
- `app-main.js` - UI, audio, and main initialization
- `config.json` - User-configurable fingerprints
- `index.html` - Main interface
- `style.css` - Styling

## Quick Test
1. Open browser console (F12)
2. Click "Calibrar" button
3. Say "AAAA" clearly
4. Check console for band values
5. If values appear, calibration is working!