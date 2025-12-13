# Deploying the Web Frontend on Ubuntu Server

This guide will help you set up the Next.js frontend to run as a systemd service on your Ubuntu server.

## Prerequisites

- The API service should already be running
- Node.js v18+ installed
- The project cloned and dependencies installed

## Step 1: Build the Frontend

First, build the Next.js app for production:

```bash
cd /home/ethan/weather-station
npm run build --workspace=apps/web
```

This creates an optimized production build in `apps/web/.next/`.

## Step 2: Update Environment Variables

Make sure your `.env` file has the correct API URL:

```bash
# In .env file
NEXT_PUBLIC_API_URL=http://localhost:3001
# Or if accessing from another machine on your network:
NEXT_PUBLIC_API_URL=http://192.168.6.15:3001
```

The `NEXT_PUBLIC_API_URL` is used by the frontend to make API calls. If you're accessing the dashboard from another machine, use the server's IP address instead of `localhost`.

## Step 3: Create Systemd Service

Copy the service file to systemd:

```bash
sudo cp weather-station-web.service /etc/systemd/system/
```

Or create it manually:

```bash
sudo nano /etc/systemd/system/weather-station-web.service
```

Paste the following (adjust paths and user as needed):

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

**Important:** Update the paths:
- `User=ethan` → your username
- `WorkingDirectory=/home/ethan/weather-station/apps/web` → your project path
- `EnvironmentFile=/home/ethan/weather-station/.env` → your .env file path

## Step 4: Enable and Start the Service

```bash
# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable weather-station-web

# Start the service
sudo systemctl start weather-station-web

# Check the status
sudo systemctl status weather-station-web

# View logs
sudo journalctl -u weather-station-web -f
```

## Step 5: Access the Dashboard

The frontend will be available at:
- `http://your-server-ip:3000`
- Or `http://localhost:3000` if accessing from the server itself

## Quick Deploy Script

After the initial setup, you can use the npm script to rebuild and restart:

```bash
npm run deploy:web
```

This will:
1. Build the frontend
2. Restart the systemd service
3. Follow the logs

## Troubleshooting

### Service won't start

1. Check the logs:
   ```bash
   sudo journalctl -u weather-station-web -n 50
   ```

2. Verify the build exists:
   ```bash
   ls -la apps/web/.next
   ```

3. Check file permissions:
   ```bash
   sudo chown -R ethan:ethan /home/ethan/weather-station
   ```

### Port already in use

If port 3000 is already in use, you can change it:

1. Update `.env`:
   ```bash
   PORT=3002
   ```

2. Restart the service:
   ```bash
   sudo systemctl restart weather-station-web
   ```

### API connection errors

Make sure `NEXT_PUBLIC_API_URL` in your `.env` file points to the correct API address:
- Use `localhost:3001` if both services are on the same machine
- Use the server's IP (e.g., `192.168.6.15:3001`) if accessing from another machine

## Firewall Configuration

If accessing from another machine, make sure port 3000 is open:

```bash
sudo ufw allow 3000/tcp
```

## Stopping the Service

```bash
sudo systemctl stop weather-station-web
sudo systemctl disable weather-station-web  # Prevent auto-start on boot
```

