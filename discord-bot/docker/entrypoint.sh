#!/bin/sh
set -e

# Parse DATABASE_URL
DB_USER=$(echo $DATABASE_URL | cut -d':' -f2 | sed 's|//||g')
DB_PASS=$(echo $DATABASE_URL | cut -d':' -f3 | cut -d'@' -f1)
DB_HOST=$(echo $DATABASE_URL | cut -d'@' -f2 | cut -d':' -f1)
DB_PORT=$(echo $DATABASE_URL | cut -d':' -f4 | cut -d'/' -f1)

# Function to check MariaDB readiness
check_mariadb_ready() {
  echo "Trying to connect to MariaDB... ($DB_HOST:$DB_PORT) with user $DB_USER and password $DB_PASS"
  mariadb -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS --skip-ssl -e 'SELECT 1;' > /dev/null 2>&1
  return $?
}

# Wait for MariaDB
until check_mariadb_ready; do
  echo "Waiting for MariaDB..."
  sleep 1
done
echo "MariaDB is ready!"

# Disable core dumps
ulimit -c 0

# Run migrations
bunx prisma migrate deploy

# Start the app
if [ "$APP_ENV" = "prod" ]; then
  #pm2-runtime bun run src/index.js
  bun run src/index.ts
elif [ "$APP_ENV" = "dev" ]; then
  bun run src/index.ts
else
  bun run src/index.ts
fi
