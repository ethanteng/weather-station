-- AlterTable
ALTER TABLE "weather_readings" ADD COLUMN "soil_moisture_values" JSONB;

-- CreateTable
CREATE TABLE "soil_moisture_sensors" (
    "id" TEXT NOT NULL,
    "channel" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soil_moisture_sensors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "soil_moisture_sensors_channel_key" ON "soil_moisture_sensors"("channel");

-- CreateIndex
CREATE INDEX "soil_moisture_sensors_channel_idx" ON "soil_moisture_sensors"("channel");

-- CreateIndex
CREATE INDEX "soil_moisture_sensors_enabled_idx" ON "soil_moisture_sensors"("enabled");

-- Migrate existing soil_moisture values to soil_moisture_values JSON format
-- This creates soil_ch1 entries for existing readings
UPDATE "weather_readings"
SET "soil_moisture_values" = jsonb_build_object('soil_ch1', "soil_moisture")
WHERE "soil_moisture" IS NOT NULL AND "soil_moisture_values" IS NULL;
