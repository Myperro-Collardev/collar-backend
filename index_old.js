import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;
app.use(bodyParser.json());

class Dog {
    constructor(species, weight, age, sex, speed) {
        this.species = species;
        this.weight = weight;
        this.age = age;
        this.sex = sex;
        this.speed = speed;
    }

    calculateCaloriesBurnt() {
        // Define BMR rates for different dog species
        const bmr = {
            'Labrador': 70,
            'German Shepherd': 75,
            'Golden Retriever': 72,
            'French Bulldog': 60,
            'Poodle': 65,
            'Other': 70
        };

        // Define age factors
        const ageFactor = {
            'puppy (0-1 year)': 1.3,
            'adult (1-7 years)': 1.2,
            'senior (7+ years)': 1.1
        };

        // Define sex factors
        const sexFactor = {
            'male': 1.2,
            'female': 1.1
        };

        // Calculate base BMR calories
        const bmrCalories = bmr[this.species] * Math.pow(this.weight, 0.75);

        // Determine activity factor based on speed
        let activityFactor;
        if (this.speed < 2) {
            activityFactor = 1.2;
        } else if (this.speed < 4) {
            activityFactor = 1.5;
        } else {
            activityFactor = 1.8;
        }

        // Calculate total calories burnt
        const caloriesBurnt = bmrCalories * ageFactor[this.age] * sexFactor[this.sex] * activityFactor;
        
        return caloriesBurnt;
    }
}

class HeartRateCalculator {
    constructor() {
        this.SAMPLE_RATE = 25; // Sampling rate in Hz
        this.BUFFER_SIZE = 100; // Buffer size for moving average
        this.PEAK_THRESHOLD = 50; // Minimum threshold for peak detection
        this.lastBeatTime = 0;
        this.lastIRValue = 0;
        this.beats = [];
        this.bpm = 0;
    }

    // Moving average filter to smooth the signal
    movingAverage(irValue) {
        const alpha = 0.2; // Smoothing factor
        const smoothedValue = this.lastIRValue + alpha * (irValue - this.lastIRValue);
        this.lastIRValue = smoothedValue;
        return smoothedValue;
    }

    // Check if current value is a peak
    isPeak(currentValue, previousValue, nextValue) {
        return (currentValue > previousValue &&
                currentValue > nextValue &&
                currentValue > this.PEAK_THRESHOLD);
    }

    // Calculate BPM from IR value
    calculateBPM(irValue) {
        const currentTime = Date.now();
        const smoothedIR = this.movingAverage(irValue);

        // Detect peaks
        if (this.isPeak(smoothedIR, this.lastIRValue, irValue)) {
            const timeSinceLastBeat = currentTime - this.lastBeatTime;
            
            if (timeSinceLastBeat > 0) {
                const instantBPM = 60000 / timeSinceLastBeat; // Convert to BPM (60000 ms = 1 minute)
                
                // Only accept reasonable BPM values (between 40 and 220)
                if (instantBPM >= 40 && instantBPM <= 220) {
                    this.beats.push(instantBPM);
                    
                    // Keep only last BUFFER_SIZE beats
                    if (this.beats.length > this.BUFFER_SIZE) {
                        this.beats.shift();
                    }
                    
                    // Calculate average BPM
                    if (this.beats.length > 0) {
                        this.bpm = this.beats.reduce((a, b) => a + b) / this.beats.length;
                    }
                }
            }
            this.lastBeatTime = currentTime;
        }

        return Math.round(this.bpm);
    }
}

class StepCounter {
    constructor() {
        // Configuration parameters
        this.THRESHOLD = 1.2;          // Acceleration threshold for step detection
        this.MIN_STEP_TIME = 250;      // Minimum time between steps (ms)
        this.WINDOW_SIZE = 10;         // Size of moving average window
        
        // State variables
        this.stepCount = 0;
        this.lastStepTime = 0;
        this.accelerationWindow = [];
        this.lastMagnitude = 0;
        this.isPeak = false;
    }

    // Calculate acceleration magnitude from x, y, z components
    calculateMagnitude(x, y, z) {
        return Math.sqrt(x * x + y * y + z * z);
    }

    // Apply moving average filter
    movingAverage(magnitude) {
        this.accelerationWindow.push(magnitude);
        
        if (this.accelerationWindow.length > this.WINDOW_SIZE) {
            this.accelerationWindow.shift();
        }

        const sum = this.accelerationWindow.reduce((a, b) => a + b, 0);
        return sum / this.accelerationWindow.length;
    }

    // Detect if current value is a peak
    detectPeak(currentMagnitude, threshold) {
        const isPeak = currentMagnitude > threshold && 
                      currentMagnitude > this.lastMagnitude;
        this.lastMagnitude = currentMagnitude;
        return isPeak;
    }

    // Process accelerometer data to count steps
    processAccelerometerData(x, y, z) {
        const currentTime = Date.now();
        
        // Calculate magnitude of acceleration
        const magnitude = this.calculateMagnitude(x, y, z);
        
        // Apply moving average filter
        const smoothedMagnitude = this.movingAverage(magnitude);
        
        // Check if this is a peak
        const currentIsPeak = this.detectPeak(smoothedMagnitude, this.THRESHOLD);
        
        // Detect steps using peak detection
        if (currentIsPeak && !this.isPeak) {
            const timeSinceLastStep = currentTime - this.lastStepTime;
            
            // Verify minimum time between steps to avoid counting bounces
            if (timeSinceLastStep > this.MIN_STEP_TIME) {
                this.stepCount++;
                this.lastStepTime = currentTime;
            }
        }
        
        this.isPeak = currentIsPeak;
        return this.stepCount;
    }

    // Get current step count
    getStepCount() {
        return this.stepCount;
    }

    // Reset step counter
    resetStepCount() {
        this.stepCount = 0;
        this.lastStepTime = 0;
        this.accelerationWindow = [];
        this.lastMagnitude = 0;
        this.isPeak = false;
    }
}


app.post('/sensor_data', (req, res) => {

    const sensorData = req.body;

    //objects for sensor data
    const myDog = new Dog(sensorData.dog_breed, sensorData.weight, sensorData.age, sensorData.sex, sensorData.speed);
    const heartRateCalculator = new HeartRateCalculator();
    const stepCounter = new StepCounter();

    //object methods
    const caloriesBurnt = myDog.calculateCaloriesBurnt();
    const bpm = heartRateCalculator.calculateBPM(sensorData.ir_value);
    const steps = stepCounter.processAccelerometerData(sensorData.x, sensorData.y, sensorData.z);

    console.log(`Current BPM: ${bpm}`);
    console.log(`The calories burnt by my ${myDog.species} is ${caloriesBurnt.toFixed(2)} calories.`);    
    console.log(`Current step count: ${steps}`);
    res.json({
        bpm: bpm,
        caloriesBurnt: caloriesBurnt,
        steps: steps
    });
});

app.listen(port, () => console.log(`Server running on port ${port}`));