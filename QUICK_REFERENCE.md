# Weather Station Quick Reference Guide

Quick reference for managing systemd services and Docker database.

## Systemd Services

### Restart Services

```bash
# Restart API service
sudo systemctl restart weather-station-api

# Restart Web service
sudo systemctl restart weather-station-web

# Restart both services at once
sudo systemctl restart weather-station-api weather-station-web
```

### Check Status

```bash
# Check status of API service
sudo systemctl status weather-station-api

# Check status of Web service
sudo systemctl status weather-station-web

# Check status of both services
sudo systemctl status weather-station-api weather-station-web
```

### Start/Stop Services

```bash
# Stop services
sudo systemctl stop weather-station-api weather-station-web

# Start services
sudo systemctl start weather-station-api weather-station-web
```

### View Logs (journalctl)

```bash
# View last 50 lines (default) for API service
sudo journalctl -u weather-station-api -n 50

# View last 100 lines
sudo journalctl -u weather-station-api -n 100

# View last 200 lines
sudo journalctl -u weather-station-api -n 200

# Follow logs in real-time (most useful for debugging)
sudo journalctl -u weather-station-api -f
sudo journalctl -u weather-station-web -f

# Follow both services
sudo journalctl -u weather-station-api -u weather-station-web -f

# View logs since today
sudo journalctl -u weather-station-api --since today

# View logs since 1 hour ago
sudo journalctl -u weather-station-api --since "1 hour ago"

# View logs since yesterday
sudo journalctl -u weather-station-api --since yesterday

# Custom time range
sudo journalctl -u weather-station-api --since "2024-01-15 10:00:00" --until "2024-01-15 12:00:00"

# Combine options: last 100 lines and follow
sudo journalctl -u weather-station-api -n 100 -f
```

### Reload Systemd Configuration

```bash
# Reload systemd after modifying service files
sudo systemctl daemon-reload
```

## Docker Database

### Restart Database

```bash
# Restart the database container
docker compose restart postgres

# Stop and start database
docker compose stop postgres
docker compose start postgres

# Full restart (down and up, preserves data volumes)
docker compose down
docker compose up -d
```

### Check Database Status

```bash
# Check if container is running
docker compose ps

# Check specific container
docker ps | grep weather-station-db
```

### View Database Logs

```bash
# View database logs
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f postgres

# View last 100 lines
docker compose logs postgres --tail 100
```

## Restart Everything

### Option 1: Manual Restart

```bash
# Restart database
docker compose restart postgres

# Restart API and Web services
sudo systemctl restart weather-station-api weather-station-web
```

### Option 2: Using Startup Script

```bash
# Restart the startup service (runs startup.sh)
sudo systemctl restart weather-station-startup
```

**Note:** The startup script will:
1. Start the database
2. Build and restart the API service
3. Build and restart the Web service

## Quick Debugging Commands

```bash
# Check all services status at once
sudo systemctl status weather-station-api weather-station-web
docker compose ps

# View recent logs for all services
sudo journalctl -u weather-station-api -n 50
sudo journalctl -u weather-station-web -n 50
docker compose logs postgres --tail 50

# Follow all logs in real-time (use separate terminals)
sudo journalctl -u weather-station-api -f
sudo journalctl -u weather-station-web -f
docker compose logs -f postgres

# Check Weather Underground upload job status
sudo journalctl -u weather-station-api -n 100 | grep -i "weather underground"
```

## Service Files Location

- API service: `/etc/systemd/system/weather-station-api.service`
- Web service: `/etc/systemd/system/weather-station-web.service`
- Startup service: `/etc/systemd/system/weather-station-startup.service`

## Weather Underground Upload Job

The Weather Underground upload job is a **cron job** that runs inside the API service (not a separate systemd service). It automatically uploads weather data to Weather Underground at configurable intervals.

### Configuration

The job is controlled by environment variables in `.env`:
- `WU_ENABLED=true` - Enable/disable the job
- `WU_STATION_ID` - Your Weather Underground station ID
- `WU_API_KEY` - Your Weather Underground API key
- `WU_INTERVAL_SECONDS=300` - Upload interval (default: 300 seconds = 5 minutes)

### Restart the Job

Since it runs inside the API service, restart the API service:

```bash
sudo systemctl restart weather-station-api
```

### Check if Job is Running

The job logs appear in the API service logs. Check for "Weather Underground" messages:

```bash
# View recent API logs
sudo journalctl -u weather-station-api -n 100 | grep -i "weather underground"

# Follow API logs to see job execution
sudo journalctl -u weather-station-api -f
```

Look for messages like:
- `Running Weather Underground upload job...`
- `Weather Underground: Upload successful`
- `Weather Underground: Upload failed`
- `Weather Underground: No material change since last upload, skipping`

### Manual Test Upload

Test the upload manually via API endpoint:

```bash
curl -X POST http://localhost:3001/api/integrations/wunderground/test \
  -H "Authorization: Bearer <ADMIN_PASSWORD>"
```

### View Upload History

Upload attempts are logged in the audit log and visible in the dashboard:
- Dashboard: `http://your-server:3000/history`
- Look for entries with source "wunderground" and actions: `wu_upload`, `wu_upload_failed`, `wu_upload_skipped`

### Job Schedule

The job runs automatically at intervals based on `WU_INTERVAL_SECONDS`:
- Default: Every 5 minutes (`*/5 * * * *`)
- Configurable: Set `WU_INTERVAL_SECONDS` to any value (recommended: divisors of 60 for exact timing: 60, 120, 180, 300, 600, etc.)

**Note:** The job only uploads if there's been a material change in weather data since the last upload (prevents duplicate uploads).

## Docker Compose File

- Location: `/home/ethan/weather-station/docker-compose.yml`
- Container name: `weather-station-db`
- Service name: `postgres`
- Data volume: `postgres_data` (persists data across restarts)

