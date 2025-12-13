#!/bin/bash

# Script to create .env file for the weather station project
# Run this on your Ubuntu server

echo "Creating .env file..."

# Check if .env already exists
if [ -f .env ]; then
    echo "Warning: .env file already exists. Backing up to .env.backup"
    cp .env .env.backup
fi

# Create .env file with default values
cat > .env << 'EOF'
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

# Next.js (optional, defaults to http://localhost:3001)
NEXT_PUBLIC_API_URL=http://localhost:3001
EOF

echo ".env file created!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your actual API keys:"
echo "   nano .env"
echo ""
echo "2. Make sure Postgres is running:"
echo "   docker compose up -d"
echo ""
echo "3. Run migrations:"
echo "   npm run db:migrate --workspace=apps/api"
echo ""

