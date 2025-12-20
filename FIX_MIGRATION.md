# Fix Migration History

The database has the old migration name `20250101000000_add_soil_moisture_sensors` recorded, but the filesystem has been renamed to `20251214000000_add_soil_moisture_sensors`. Since the changes are already applied to the database, we need to resolve the migration history.

## Steps to Fix

Run these commands on your server:

```bash
cd ~/weather-station/apps/api

# Step 1: Mark the old migration as rolled back (it's not in the directory anymore)
dotenv -e ../../.env -- prisma migrate resolve --rolled-back 20250101000000_add_soil_moisture_sensors

# Step 2: Mark the new migration as applied (changes are already in the database)
dotenv -e ../../.env -- prisma migrate resolve --applied 20251214000000_add_soil_moisture_sensors

# Step 3: Now run the migration to apply any pending migrations (like rain_rate)
dotenv -e ../../.env -- prisma migrate deploy

# Step 4: Regenerate Prisma Client
dotenv -e ../../.env -- prisma generate
```

Or from the project root:

```bash
# Step 1: Mark old migration as rolled back
cd apps/api && dotenv -e ../../.env -- prisma migrate resolve --rolled-back 20250101000000_add_soil_moisture_sensors

# Step 2: Mark new migration as applied
cd apps/api && dotenv -e ../../.env -- prisma migrate resolve --applied 20251214000000_add_soil_moisture_sensors

# Step 3: Deploy pending migrations
npm run db:migrate:deploy --workspace=apps/api

# Step 4: Generate Prisma Client
npm run db:generate --workspace=apps/api
```

This will:
1. Remove the old migration name from the database history
2. Add the new migration name as already applied
3. Apply any pending migrations (like the new `rain_rate` field)
4. Regenerate the Prisma client with the updated schema

