# Vtuber_Simple
Vtuber simple for browser with audio control

## Overview
A real-time vowel detection system using formant frequency analysis (F1, F2) instead of machine learning. The application captures microphone input, visualizes the waveform, and detects vowels A, E, I, O, U based on their characteristic formant frequencies.

## Features
- Real-time audio waveform visualization
- Formant frequency analysis (F1, F2 detection)
- Vowel classification (A, E, I, O, U)
- Configurable formant thresholds
- Volume level monitoring
- Responsive UI with visual feedback

## How It Works
The system uses Web Audio API to capture microphone input and perform Fast Fourier Transform (FFT) analysis. It detects spectral peaks to identify the first two formants (F1 and F2), which are characteristic frequency bands for each vowel:

- **A**: F1: 600-900Hz, F2: 900-1500Hz
- **E**: F1: 300-600Hz, F2: 1500-2300Hz  
- **I**: F1: 200-450Hz, F2: 1900-2700Hz
- **O**: F1: 300-600Hz, F2: 600-1200Hz
- **U**: F1: 200-450Hz, F2: 400-1100Hz

## Configuration
Edit `config.json` to adjust:
- Audio parameters (sample rate, FFT size)
- Formant frequency ranges for each vowel
- Detection thresholds and sensitivity

## Usage
1. Open `index.html` in a modern browser
2. Allow microphone access when prompted
3. Speak vowels A, E, I, O, U clearly
4. Observe real-time vowel detection and formant frequencies

## Technical Details
- Pure JavaScript implementation
- No external ML libraries (TensorFlow removed)
- Web Audio API for real-time processing
- Canvas API for waveform visualization
- Configurable formant-based classification

## Files
- `index.html` - Main interface
- `app.js` - Core application logic
- `config.json` - Configuration settings
- `style.css` - Styling
- `README.md` - This documentation
