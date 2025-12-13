-- CreateEnum
CREATE TYPE "WateringSource" AS ENUM ('manual', 'schedule', 'automation');

-- CreateTable
CREATE TABLE "weather_readings" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "pressure" DOUBLE PRECISION,
    "rain_1h" DOUBLE PRECISION,
    "rain_24h" DOUBLE PRECISION,
    "rain_total" DOUBLE PRECISION,
    "soil_moisture" DOUBLE PRECISION,
    "raw_payload" JSONB NOT NULL,

    CONSTRAINT "weather_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rachio_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rachio_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rachio_zones" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rachio_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watering_events" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zone_id" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "source" "WateringSource" NOT NULL,
    "raw_payload" JSONB,

    CONSTRAINT "watering_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "last_result" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weather_readings_timestamp_idx" ON "weather_readings"("timestamp");

-- CreateIndex
CREATE INDEX "rachio_zones_device_id_idx" ON "rachio_zones"("device_id");

-- CreateIndex
CREATE INDEX "watering_events_timestamp_idx" ON "watering_events"("timestamp");

-- CreateIndex
CREATE INDEX "watering_events_zone_id_idx" ON "watering_events"("zone_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "rachio_zones" ADD CONSTRAINT "rachio_zones_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "rachio_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watering_events" ADD CONSTRAINT "watering_events_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "rachio_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
