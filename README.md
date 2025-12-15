# Weather → Irrigation Control System

A production-ready system that integrates Ecowitt weather stations with Rachio irrigation controllers to automate watering based on weather conditions and soil moisture.

## Overview

This system:
- Fetches weather data from Ecowitt API v3 every 5 minutes
- Syncs Rachio device and zone information every 15 minutes
- Evaluates automation rules every 5 minutes
- Provides a dashboard UI to monitor weather, soil moisture, and irrigation events
- Automatically controls irrigation based on rainfall and soil moisture thresholds

## Architecture

Monorepo structure using npm workspaces:
- `apps/api` - Express backend with TypeScript, Prisma, and cron jobs
- `apps/web` - Next.js dashboard frontend

## Prerequisites

- Node.js v18 or higher
- Docker and Docker Compose (for local Postgres)
- Ecowitt API credentials (Application Key and API Key)
- Rachio API key

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/ethanteng/weather-station.git
cd weather-station
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
# Database
DATABASE_URL="postgresql://weather_station:weather_station_password@localhost:5432/weather_station?schema=public"

# Ecowitt API v3
ECOWITT_APPLICATION_KEY=your_ecowitt_application_key
ECOWITT_API_KEY=your_ecowitt_api_key

# Rachio API
RACHIO_API_KEY=your_rachio_api_key

# Server
PORT=3001

# Authentication (simple password for Phase 1)
ADMIN_PASSWORD=change_me_in_production

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3001

# Forecast (Open-Meteo - no API key required)
FORECAST_LAT=37.8
FORECAST_LON=-122.2
```

### 3. Start Postgres Database

```bash
docker-compose up -d
```

### 4. Run Database Migrations

```bash
npm run db:migrate
```

This will create all necessary tables in the database.

### 5. Start Development Servers

In separate terminals:

**Backend API:**
```bash
npm run dev --workspace=apps/api
```

**Frontend Dashboard:**
```bash
npm run dev --workspace=apps/web
```

The API will be available at `http://localhost:3001` and the dashboard at `http://localhost:3000`.

## Project Structure

```
weather-station/
├── apps/
│   ├── api/                 # Backend API
│   │   ├── prisma/          # Prisma schema
│   │   └── src/
│   │       ├── clients/      # Ecowitt and Rachio API clients
│   │       ├── jobs/         # Cron jobs (weather poll, Rachio poll, automation)
│   │       ├── routes/       # Express routes
│   │       ├── automation/   # Automation engine and rules
│   │       └── middleware/   # Auth middleware
│   └── web/                  # Next.js frontend
│       ├── app/              # Next.js app directory
│       ├── components/       # React components
│       └── lib/              # API client library
├── docker-compose.yml        # Postgres database
└── package.json             # Root workspace config
```

## API Endpoints

All API endpoints require authentication via `Authorization: Bearer <ADMIN_PASSWORD>` header.

### Health Check
- `GET /health` - Server health check (no auth required)

### Weather
- `GET /api/weather/latest` - Get most recent weather reading
- `GET /api/weather/summary?range=24h|7d|30d` - Get aggregated weather statistics

### Forecast
- `GET /api/forecast/7day?lat=<latitude>&lon=<longitude>` - Get 7-day weather forecast from Open-Meteo
  - Query params `lat` and `lon` are optional (defaults to `FORECAST_LAT` and `FORECAST_LON` env vars)
  - Open-Meteo is free and requires no API key
  - Responses are cached in memory for 15 minutes

### Rachio
- `GET /api/rachio/devices` - List all Rachio devices
- `GET /api/rachio/zones?deviceId=<id>` - List zones for a device
- `GET /api/rachio/watering-events?limit=10` - Get recent watering events
- `POST /api/rachio/rain-delay` - Set rain delay
  ```json
  { "deviceId": "string", "hours": 48 }
  ```
- `POST /api/rachio/zone/run` - Run a zone
  ```json
  { "zoneId": "string", "minutes": 10 }
  ```
- `POST /api/rachio/stop` - Stop all watering on a device
  ```json
  { "deviceId": "string" }
  ```

### Automation
- `GET /api/automations` - List automation rules
- `POST /api/automations/run` - Manually trigger automation evaluation

## Automation Rules

The system includes three default automation rules:

1. **Rainy Day Pause**: If rain_24h ≥ 0.5" → set rain delay 48h
2. **Too Wet: Skip**: If soil_moisture ≥ 40% → set rain delay 24h
3. **Too Dry: Boost**: If soil_moisture ≤ 20% AND rain_24h < 0.1" → run lawn zone 10 min

Rules are evaluated every 5 minutes. Safety features:
- Maximum one watering per zone per 24 hours
- All actions are logged to audit log
- All watering events are stored in database

## Weather Underground Export

The system can automatically upload weather data to Weather Underground Personal Weather Station (PWS).

### Configuration

Add these environment variables to your root `.env` file (same directory as `package.json`) to enable WU uploads:

```bash
WU_ENABLED=true
WU_STATION_ID=your_station_id
WU_API_KEY=your_api_key
WU_INTERVAL_SECONDS=300  # Optional, default 300 (5 minutes)
```

**Note:** The `.env` file should be in the project root directory, alongside your other environment variables like `ECOWITT_APPLICATION_KEY`, `RACHIO_API_KEY`, etc.

### Verification

Once enabled, check your station dashboard:
- https://www.wunderground.com/dashboard/pws/<STATION_ID>

### Test Endpoint

Test the integration manually:
```bash
curl -X POST http://localhost:3001/api/integrations/wunderground/test \
  -H "Authorization: Bearer <ADMIN_PASSWORD>"
```

### Data Uploaded

Only public weather data is uploaded (already in Imperial units):
- Temperature (°F)
- Humidity (%)
- Pressure (inHg, absolute)
- Rainfall (inches)

Soil moisture and irrigation data are NOT uploaded.

### History

WU upload attempts are logged and visible in the `/history` page:
- Successful uploads show as "Weather Underground Upload" with green status
- Failed uploads show error details
- Skipped uploads (no material change) are also logged

## Dashboard

The dashboard displays:
- 7-day weather forecast with temperature trends (powered by Open-Meteo, no API key required)
- Current temperature, humidity, and pressure
- Rainfall statistics (last hour, 24h, 7d) with charts
- Soil moisture current value and 24h trend
- Recent watering events
- Automation rules status
- Rachio device and zone information

Access the dashboard at `http://localhost:3000` and enter the admin password when prompted.

## Database Schema

### WeatherReading
Stores weather data from Ecowitt with fields for temperature, humidity, pressure, rainfall (1h/24h/total), and soil moisture.

### RachioDevice
Stores Rachio controller information.

### RachioZone
Stores zone information linked to devices.

### WateringEvent
Logs all watering events (manual, schedule, or automation) with duration and source.

### AutomationRule
Stores automation rules (currently hardcoded, but schema supports future UI editing).

### AuditLog
Audit trail of all system actions for debugging and compliance.

## Cron Jobs

- **Weather Poll**: Every 5 minutes - Fetches latest weather data from Ecowitt
- **Rachio Poll**: Every 15 minutes - Syncs devices and zones from Rachio
- **Automation Evaluation**: Every 5 minutes - Evaluates rules and takes actions

## Development

### Running Migrations

```bash
npm run db:migrate
```

### Prisma Studio

View and edit database records:

```bash
npm run db:studio
```

### Building for Production

```bash
npm run build
```

This builds both the API and web applications.

## Local Deployment (Ubuntu Server)

### Using systemd

#### 1. API Service

1. Create a systemd service file for the API:

```bash
sudo nano /etc/systemd/system/weather-station-api.service
```

Add the following (adjust paths and user as needed):

```ini
[Unit]
Description=Weather Station API
After=network.target postgresql.service

[Service]
Type=simple
User=ethan
WorkingDirectory=/home/ethan/weather-station/apps/api
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/ethan/weather-station/.env

[Install]
WantedBy=multi-user.target
```

2. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable weather-station-api
sudo systemctl start weather-station-api
sudo systemctl status weather-station-api
```

#### 2. Web Frontend Service

1. Build the frontend for production:

```bash
cd /home/ethan/weather-station
npm run build --workspace=apps/web
```

2. Create a systemd service file for the web frontend:

```bash
sudo nano /etc/systemd/system/weather-station-web.service
```

Add the following (adjust paths and user as needed):

```ini
[Unit]
Description=Weather Station Web Dashboard
After=network.target weather-station-api.service

[Service]
Type=simple
User=ethan
WorkingDirectory=/home/ethan/weather-station/apps/web
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/ethan/weather-station/.env

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable weather-station-web
sudo systemctl start weather-station-web
sudo systemctl status weather-station-web
```

4. Update your `.env` file to set the correct API URL:

```bash
# In .env file, set:
NEXT_PUBLIC_API_URL=http://localhost:3001
# Or if accessing from another machine:
NEXT_PUBLIC_API_URL=http://192.168.6.15:3001
```

#### 3. Quick Deploy Scripts

From the project root, you can use these npm scripts:

```bash
# Deploy API (build + restart + follow logs)
npm run deploy:api

# Deploy Web (build + restart + follow logs)
npm run deploy:web
```

#### 4. Access the Dashboard

- API: `http://your-server-ip:3001`
- Dashboard: `http://your-server-ip:3000`

### Using Docker Compose

You can extend `docker-compose.yml` to include the API and web services for full containerization.

## Phase 2: Cloud Deployment

The system is structured to support deployment:
- Backend API on Render or any Node.js host
- Frontend on Vercel
- Database on managed Postgres service

Update environment variables accordingly for cloud deployment.

## Troubleshooting

### Ecowitt API Issues

- Verify your API keys are correct
- Check the console logs for raw API responses
- Use the discovery endpoint to map sensor channels correctly
- Update field mappings in `apps/api/src/clients/ecowitt.ts` based on your device's sensor structure

### Rachio API Issues

- Verify your API key has proper permissions
- Check that devices are online in the Rachio app
- Review audit logs for API errors

### Database Connection

- Ensure Postgres is running: `docker-compose ps`
- Verify DATABASE_URL matches docker-compose.yml settings
- Check database logs: `docker-compose logs postgres`

## License

MIT
