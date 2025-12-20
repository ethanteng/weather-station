# Fix Migration History

The database has the old migration name `20250101000000_add_soil_moisture_sensors` recorded, but the filesystem has been renamed to `20251214000000_add_soil_moisture_sensors`. Since the changes are already applied to the database, we need to update the migration history directly.

## Steps to Fix

Since the migration was successfully applied (not failed), we need to manually update the database's `_prisma_migrations` table.

**Method 1: Direct SQL Update (Recommended)**

Run these commands on your server:

```bash
cd ~/weather-station/apps/api

# Export DATABASE_URL from .env file
export $(grep -v '^#' ../../.env | xargs)

# Update the migration name in the database
psql $DATABASE_URL -c "UPDATE _prisma_migrations SET migration_name = '20251214000000_add_soil_moisture_sensors' WHERE migration_name = '20250101000000_add_soil_moisture_sensors';"

# Verify the update worked
psql $DATABASE_URL -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"

# Now deploy any pending migrations (like rain_rate)
npx prisma migrate deploy

# Regenerate Prisma Client
npx prisma generate
```

**Method 2: Using psql interactively**

If Method 1 doesn't work, connect to the database directly:

```bash
cd ~/weather-station/apps/api
export $(grep -v '^#' ../../.env | xargs)

# Connect to PostgreSQL (extract connection details from DATABASE_URL if needed)
# Or connect directly:
psql -h localhost -U weather_station -d weather_station

# Then run:
UPDATE _prisma_migrations 
SET migration_name = '20251214000000_add_soil_moisture_sensors' 
WHERE migration_name = '20250101000000_add_soil_moisture_sensors';

# Verify
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;

# Exit psql
\q

# Continue with migrations
npx prisma migrate deploy
npx prisma generate
```

**Method 3: Using Docker exec (if database is in Docker) - RECOMMENDED**

Since your database is running in Docker, use this method:

```bash
cd ~/weather-station

# Connect to the database container and run the update
docker exec -i weather-station-db psql -U weather_station -d weather_station <<EOF
UPDATE _prisma_migrations 
SET migration_name = '20251214000000_add_soil_moisture_sensors' 
WHERE migration_name = '20250101000000_add_soil_moisture_sensors';

SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;
EOF

# Or run interactively:
docker exec -it weather-station-db psql -U weather_station -d weather_station

# Then in psql, run:
UPDATE _prisma_migrations 
SET migration_name = '20251214000000_add_soil_moisture_sensors' 
WHERE migration_name = '20250101000000_add_soil_moisture_sensors';

# Verify
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;

# Exit psql
\q
```

After updating the migration name, run:
```bash
cd ~/weather-station/apps/api
export $(grep -v '^#' ../../.env | xargs)
npx prisma migrate deploy
npx prisma generate
```

This will:
1. Update the migration name in the database to match the filesystem
2. Apply any pending migrations (like the new `rain_rate` field)
3. Regenerate the Prisma client with the updated schema
