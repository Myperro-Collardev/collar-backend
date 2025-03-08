import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import cors from "cors";
import { calculateVitals, VitalsResult } from "./hr-spo2-algorithm.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
env.config();

const app: Express = express();
app.use(cors());
const port = process.env.PORT || 3001;
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Buffer for storing IR and Red IR values
const BUFFER_SIZE = 100;
let irBuffer: number[] = [];
let redirBuffer: number[] = [];
var responseArr: ResponseData[] = [];

// Process the buffers and calculate vitals
function processBuffers(
  steps: number,
  timestamp: string,
  temperature: number,
): ResponseData | null {
  if (irBuffer.length >= BUFFER_SIZE && redirBuffer.length >= BUFFER_SIZE) {
    try {
      const vitals = calculateVitals(irBuffer, redirBuffer);
      console.log(vitals);

      // remove the first metric
      irBuffer.shift();
      redirBuffer.shift();

      // Only return data if the calculations are valid
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
      // Clear buffers on error
      irBuffer = [];
      redirBuffer = [];
    }
  }
  return null;
}

app.post("/sensor_data", async (req: Request<{}, {}, SensorData>, res: Response) => {
  const sensorData = req.body;
  await prisma.sensorData.create({
    data: {
      steps: sensorData.steps,
      ir: sensorData.ir,
      redir: sensorData.redir,
      timeStamp: sensorData.timeStamp,
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

  if(processedData){
    await prisma.responseData.create({
      data: {
        bpm: processedData.bpm,
        spo2: processedData.spo2,
        stepCount: processedData.stepCount,
        timestamp: processedData.timestamp,
        temperature: processedData.temperature,
      },
    });
  }

  //only keep the lastes metrics !!! remove the next lines for no data loss :)
  if (responseArr.length > 3) {
    responseArr.shift();
  }

  if (processedData) {
    responseArr.push(processedData);
    res.json(processedData);
  } else {
    console.log("form collecting");
    console.log(
      `irBuffer length: ${irBuffer.length}, redirBuffer length: ${redirBuffer.length}`,
    );
    res.json({
      message: "Collecting data",
      progress: `${Math.min(irBuffer.length, BUFFER_SIZE)}/${BUFFER_SIZE} samples`,
    });
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

app.listen(port, () => console.log(`Server running on port ${port}`));
