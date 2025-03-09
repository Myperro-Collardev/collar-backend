import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import cors from "cors";
import { calculateVitals } from "./hr-spo2-algorithm.js";
import { PrismaClient } from "@prisma/client";

// Initialize environment variables
env.config();

// Initialize Prisma client with logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Setup Express app
const app: Express = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
const port = process.env.PORT || 3001;

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

// Type definitions
interface SensorData {
  steps: number;
  ir: number;
  redir: number;
  timeStamp: string;
  temperature: number;
}

interface ResponseData {
  bpm: number;
  spo2: number;
  stepCount: number;
  timestamp: string;
  temperature: number;
}

const BUFFER_SIZE = 100;
let irBuffer: number[] = [];
let redirBuffer: number[] = [];
var responseArr: ResponseData[] = [];

async function connectWithRetry(retries = MAX_RETRIES, delay = RETRY_DELAY) {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database');
  } catch (error) {
    console.error(`Failed to connect to database, retries left: ${retries}`, error);
    
    if (retries > 0) {
      console.log(`Retrying in ${delay/1000} seconds...`);
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
    } else {
      console.error('Max retries reached. Unable to connect to database.');
      process.exit(1);
    }
  }
}

function processBuffers(
  steps: number,
  timestamp: string,
  temperature: number,
): ResponseData | null {
  if (irBuffer.length >= BUFFER_SIZE && redirBuffer.length >= BUFFER_SIZE) {
    try {
      const vitals = calculateVitals(irBuffer, redirBuffer);
      console.log("Calculated vitals:", vitals);
      
      irBuffer.shift();
      redirBuffer.shift();
      
      if (vitals.heartRate && vitals.spO2) {
        return {
          bpm: vitals.heartRate,
          spo2: vitals.spO2,
          stepCount: steps,
          timestamp: timestamp,
          temperature: temperature,
        };
      }
    } catch (error) {
      console.error("Error processing vitals:", error);
      irBuffer = [];
      redirBuffer = [];
    }
  }
  return null;
}

// Health check endpoint to verify database connection
app.get("/health", async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ 
      status: 'ok', 
      database: 'connected',
      bufferStatus: {
        irBufferSize: irBuffer.length,
        redirBufferSize: redirBuffer.length,
        processedDataCount: responseArr.length,
        bufferCapacity: BUFFER_SIZE,
      }
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.post("/sensor_data", async (req: Request<{}, {}, SensorData>, res: Response) => {
  console.log("Received sensor data:", req.body);
  const sensorData = req.body;
  if(sensorData.timeStamp === undefined || sensorData.timeStamp === ""){
    sensorData.timeStamp = new Date().toISOString();
  }
  
  try {
    await prisma.sensorData.create({
      data: {
        steps: sensorData.steps,
        ir: sensorData.ir,
        redir: sensorData.redir,
        timeStamp: new Date(sensorData.timeStamp),
        temperature: sensorData.temperature,
      },
    });
    
    irBuffer.push(sensorData.ir);
    redirBuffer.push(sensorData.redir);
    
    const processedData = processBuffers(
      sensorData.steps,
      sensorData.timeStamp,
      sensorData.temperature,
    );
    
    if (processedData) {
      await prisma.responseData.create({
        data: {
          bpm: processedData.bpm,
          spo2: processedData.spo2,
          stepCount: processedData.stepCount,
          timestamp: new Date(processedData.timestamp),
          temperature: processedData.temperature,
        },
      });
      
      console.log("Saved processed data to database:", processedData);
      
      if (responseArr.length > 3) {
        responseArr.shift();
      }
      
      responseArr.push(processedData);
      res.json(processedData);
    } else {
      console.log("Still collecting data");
      console.log(
        `irBuffer length: ${irBuffer.length}, redirBuffer length: ${redirBuffer.length}`,
      );
      res.json({
        message: "Collecting data",
        progress: `${Math.min(irBuffer.length, BUFFER_SIZE)}/${BUFFER_SIZE} samples`,
      });
    }
  } catch (error) {
    console.error("Database operation error:", error);
    res.status(500).json({ error: "Failed to process sensor data" });
  }
});

app.get("/sensor_data", (req: Request, res: Response) => {
  if (responseArr.length > 0) {
    const data = responseArr.shift();
    res.json(data);
  } else {
    res.status(404).json({ message: "No processed data available" });
  }
});

app.get("/flush", (req: Request, res: Response) => {
  responseArr.length = 0;
  irBuffer.length = 0;
  redirBuffer.length = 0;
  res.status(200).json({ message: "Data flushed" });
});

app.get("/buffer_status", (req: Request, res: Response) => {
  res.json({
    irBufferSize: irBuffer.length,
    redirBufferSize: redirBuffer.length,
    processedDataCount: responseArr.length,
    bufferCapacity: BUFFER_SIZE,
  });
});

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down');
  await prisma.$disconnect();
  process.exit(0);
});

connectWithRetry().then(() => {
  app.listen(port, () => console.log(`Server running on port ${port}`));
});