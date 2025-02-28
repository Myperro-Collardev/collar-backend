// Types definition
interface VitalsResult {
    heartRate: number;
    heartRateValid: boolean;
    spO2: number;
    spO2Valid: boolean;
}

// Constants
const BUFFER_SIZE = 100;
const MA4_SIZE = 4;
const FreqS = 25; // Sampling frequency

// SPO2 lookup table approximation
const SPO2_TABLE: number[] = new Array(184).fill(0).map((_, i) => {
    return Math.round(-45.060 * (i * i) / 10000 + 30.354 * i / 100 + 94.845);
});

/**
 * Find peaks in the data array
 * @param data - Array of sensor readings
 * @param minHeight - Minimum peak height
 * @param minDistance - Minimum distance between peaks
 * @param maxPeaks - Maximum number of peaks to find
 * @returns Array of peak indices
 */
function findPeaks(
    data: number[], 
    minHeight: number, 
    minDistance: number, 
    maxPeaks: number
): number[] {
    const peaks: number[] = [];
    
    // Find peaks above minimum height
    for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > minHeight && data[i] > data[i-1]) {
            let width = 1;
            while (i + width < data.length && data[i] === data[i + width]) {
                width++;
            }
            if (data[i] > data[i + width] && peaks.length < maxPeaks) {
                peaks.push(i);
                i += width;
            } else {
                i += width - 1;
            }
        }
    }
    
    // Remove peaks that are too close
    return peaks.filter((peak, index) => {
        if (index === 0) return true;
        return Math.abs(peak - peaks[index - 1]) >= minDistance;
    });
}

/**
 * Calculate heart rate and SpO2 from IR and Red LED readings
 * @param irBuffer - Array of IR LED readings
 * @param redBuffer - Array of Red LED readings
 * @returns Object containing heart rate, SpO2, and their validity flags
 * @throws Error if buffer sizes don't match or are insufficient
 */
function calculateVitals(irBuffer: number[], redBuffer: number[]): VitalsResult {
    if (irBuffer.length !== redBuffer.length || irBuffer.length < BUFFER_SIZE) {
        throw new Error('Buffer size mismatch or insufficient data');
    }

    // Calculate mean of IR signal
    const irMean = irBuffer.reduce((a, b) => a + b, 0) / irBuffer.length;
    
    // Remove DC and invert for valley detection
    const processedIr = irBuffer.map(x => -(x - irMean));
    
    // Apply moving average
    const smoothedIr: number[] = [];
    for (let i = 0; i < processedIr.length - MA4_SIZE; i++) {
        smoothedIr[i] = (processedIr[i] + processedIr[i+1] + 
                        processedIr[i+2] + processedIr[i+3]) / 4;
    }
    
    // Calculate threshold
    let threshold = smoothedIr.reduce((a, b) => a + b, 0) / smoothedIr.length;
    threshold = Math.min(Math.max(threshold, 30), 60);
    
    // Find peaks (valleys in original signal)
    const peaks = findPeaks(smoothedIr, threshold, 4, 15);
    
    // Calculate heart rate
    let heartRate = 0;
    let hrValid = false;
    
    if (peaks.length >= 2) {
        const peakIntervals: number[] = [];
        for (let i = 1; i < peaks.length; i++) {
            peakIntervals.push(peaks[i] - peaks[i-1]);
        }
        const averageInterval = peakIntervals.reduce((a, b) => a + b, 0) / peakIntervals.length;
        heartRate = Math.round((FreqS * 60) / averageInterval);
        hrValid = true;
    } else {
        heartRate = 86;
        hrValid = false;
    }
    
    // Calculate SpO2
    let spO2 = 0;
    let spO2Valid = false;
    
    if (peaks.length >= 2) {
        const ratios: number[] = [];
        
        for (let i = 0; i < peaks.length - 1; i++) {
            const leftIdx = peaks[i];
            const rightIdx = peaks[i + 1];
            
            if (rightIdx - leftIdx > 3) {
                // Find AC and DC components for both red and IR
                const irAC = Math.max(...irBuffer.slice(leftIdx, rightIdx)) - 
                            Math.min(...irBuffer.slice(leftIdx, rightIdx));
                const redAC = Math.max(...redBuffer.slice(leftIdx, rightIdx)) - 
                             Math.min(...redBuffer.slice(leftIdx, rightIdx));
                const irDC = Math.max(...irBuffer.slice(leftIdx, rightIdx));
                const redDC = Math.max(...redBuffer.slice(leftIdx, rightIdx));
                
                const ratio = ((redAC * irDC) / (irAC * redDC)) * 100;
                if (ratio > 2 && ratio < 184) {
                    ratios.push(ratio);
                }
            }
        }
        
        if (ratios.length > 0) {
            // Use median ratio
            ratios.sort((a, b) => a - b);
            const medianRatio = ratios[Math.floor(ratios.length / 2)];
            spO2 = SPO2_TABLE[Math.round(medianRatio)];
            spO2Valid = true;
        }
    }
    
    if (!spO2Valid) {
        spO2 = 99;
    }
    
    return {
        heartRate,
        heartRateValid: hrValid,
        spO2,
        spO2Valid
    };
}

export { calculateVitals, VitalsResult };