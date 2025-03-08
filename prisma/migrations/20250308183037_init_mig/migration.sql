-- CreateTable
CREATE TABLE "SensorData" (
    "id" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "ir" INTEGER NOT NULL,
    "redir" INTEGER NOT NULL,
    "timeStamp" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SensorData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseData" (
    "id" TEXT NOT NULL,
    "bpm" INTEGER NOT NULL,
    "spo2" DOUBLE PRECISION NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ResponseData_pkey" PRIMARY KEY ("id")
);
