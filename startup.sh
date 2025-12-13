#!/bin/bash
# Weather Station Startup Script
# This script starts the database and deploys the API and web services

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "$(date): Starting Weather Station services..."

# Step 1: Start database
echo "$(date): Starting database..."
docker compose up -d

# Wait for database to be ready
echo "$(date): Waiting for database to be ready..."
timeout=30
counter=0
while ! docker compose exec -T postgres pg_isready -U weather_station > /dev/null 2>&1; do
    if [ $counter -ge $timeout ]; then
        echo "$(date): ERROR: Database failed to start within $timeout seconds"
        exit 1
    fi
    sleep 1
    counter=$((counter + 1))
done
echo "$(date): Database is ready"

# Step 2: Deploy API (build and restart service)
echo "$(date): Building and deploying API..."
npm run build --workspace=apps/api
sudo systemctl restart weather-station-api
echo "$(date): API deployed"

# Step 3: Deploy Web (build and restart service)
echo "$(date): Building and deploying Web..."
npm run build --workspace=apps/web
sudo systemctl restart weather-station-web
echo "$(date): Web deployed"

echo "$(date): All services started successfully"
