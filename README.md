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

## Dashboard

The dashboard displays:
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

1. Create a systemd service file for the API:

```ini
[Unit]
Description=Weather Station API
After=network.target postgresql.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/weather-station/apps/api
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
EnvironmentFile=/path/to/.env

[Install]
WantedBy=multi-user.target
```

2. Enable and start the service:

```bash
sudo systemctl enable weather-station-api
sudo systemctl start weather-station-api
```

### Using Docker Compose

You can extend `docker-compose.yml` to include the API service for full containerization.

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
