# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A weather station automation system integrating Ecowitt weather sensors with Rachio irrigation controllers. It automatically adjusts watering schedules based on real-time weather and soil moisture data.

**Stack:** Express.js + TypeScript API, Next.js 14 frontend, PostgreSQL via Prisma ORM, node-cron scheduler.

## Commands

### Development
```bash
npm run dev          # Start both API (port 3001) and web (port 3000) concurrently
npm run dev:web      # Start web frontend only
```

### Build & Deploy
```bash
npm run build        # Build both API and web
npm run deploy:api   # Build API, restart systemd service, show logs
npm run deploy:web   # Build web, restart systemd service, show logs
npm run status       # Check systemd service status
```

### Database
```bash
npm run db:migrate   # Run Prisma migrations (dev)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:studio    # Open Prisma Studio UI
npm run db:seed      # Run seed scripts
```

### Linting
```bash
cd apps/web && npm run lint   # ESLint on frontend (no lint configured for API)
```

### Utility Scripts (in apps/api)
```bash
npm run db:clear-last-run           # Clear automation lastRun timestamps
npm run db:remove-incorrect-schedule # Cleanup helper
```

## Architecture

### Monorepo Structure
- `apps/api/` — Express API backend
- `apps/web/` — Next.js frontend dashboard
- `docker-compose.yml` — PostgreSQL database (run with `docker-compose up -d`)

### Backend (`apps/api/src/`)
- `server.ts` — Express app setup, middleware, route registration, scheduler startup
- `jobs/scheduler.ts` — Orchestrates all cron jobs
- `automation/engine.ts` — Rule evaluation engine (~1,080 lines); evaluates conditions and executes actions
- `clients/` — External API clients: `ecowitt.ts`, `rachio.ts`, `openMeteo.ts`
- `routes/` — Express route handlers organized by domain
- `middleware/auth.ts` — Simple Bearer token authentication
- `integrations/` — Weather Underground upload integration
- `prisma/schema.prisma` — Database schema

### Frontend (`apps/web/`)
- Uses Next.js App Router (`app/` directory)
- Pages: `/` (dashboard), `/sensors`, `/history`, `/automations`
- `lib/api.ts` — Typed API client for all backend endpoints
- Components use Recharts for data visualization

### Cron Jobs (America/Los_Angeles timezone)
| Job | Schedule | Purpose |
|-----|----------|---------|
| Weather Poll | Every 5 min | Fetch Ecowitt sensor data → store in DB |
| Rachio Poll | Every 6 hours | Sync devices & zones from Rachio API |
| Automation | 8 AM & 8 PM | Evaluate rules, execute zone runs or rain delays |
| WU Upload | Configurable (default: 5 min) | Upload to Weather Underground if enabled |

### Database Schema (key tables)
- `WeatherReading` — Ecowitt sensor snapshots every 5 minutes
- `AutomationRule` — Rules stored as JSON (conditions array + actions array)
- `WateringEvent` — Log of all irrigation events
- `AuditLog` — Full audit trail for all automation actions
- `RachioDevice` / `RachioZone` — Synced irrigation hardware metadata
- `SoilMoistureSensor` — Soil sensor channel definitions (1–16 channels, auto-detected)

### Automation Engine
- Conditions support operators: `>=`, `<=`, `>`, `<`, `==`, `trend`
- Condition fields: `rain24h`, `rain1h`, `temperature`, `humidity`, `pressure`, `soil_moisture`
- Trend conditions use linear regression over 7-day historical data
- Actions: `set_rain_delay` (on Rachio device), `run_zone` (run irrigation zone)
- Per-zone cooldown periods prevent redundant watering
- Falls back from batch zone run (`start_multiple`) to individual runs on API error

### API Auth
All endpoints require `Authorization: Bearer <ADMIN_PASSWORD>` except `GET /health`.

## Environment Variables
```bash
DATABASE_URL=postgresql://...
ECOWITT_APPLICATION_KEY=
ECOWITT_API_KEY=
RACHIO_API_KEY=
PORT=3001
ADMIN_PASSWORD=
NEXT_PUBLIC_API_URL=http://localhost:3001
FORECAST_LAT=          # Decimal latitude for Open-Meteo forecast
FORECAST_LON=          # Decimal longitude for Open-Meteo forecast
WU_ENABLED=true|false  # Weather Underground upload
WU_STATION_ID=
WU_API_KEY=
WU_INTERVAL_SECONDS=300
```

## Key Documentation
- `README.md` — Full project overview, API docs, automation rule format, deployment guide
- `QUICK_REFERENCE.md` — Systemd commands, Docker, migration troubleshooting
- `DEPLOY_WEB.md` — Frontend deployment on Ubuntu server
- `FIX_MIGRATION.md` — Database migration troubleshooting
