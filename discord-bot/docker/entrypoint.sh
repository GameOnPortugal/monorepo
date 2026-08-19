#!/bin/sh
set -e

# Parse DATABASE_URL of the form:
#   mysql://user:password@host:port/database
#
# Done with a single awk pass instead of chained `cut`s so that a password
# containing ':', '@' or '/' does not desync the field offsets that plain
# positional `cut` relies on. Approach: strip the scheme, split credentials
# from host/db on the LAST '@' (passwords may contain '@', hostnames may
# not), only THEN look for the path separator in what is left (so a '/' in
# the password is never mistaken for the start of the database name), then
# split user:password on the FIRST ':' (usernames should not contain ':')
# and host:port on the LAST ':'.
if [ -z "$DATABASE_URL" ]; then
  echo "entrypoint: DATABASE_URL is not set" >&2
  exit 1
fi

DB_PARSED=$(printf '%s' "$DATABASE_URL" | awk '
  {
    url = $0
    sub(/^[a-zA-Z0-9+]+:\/\//, "", url)   # strip scheme://

    # Split userinfo from host(:port)/db on the LAST "@" -- passwords may
    # contain "@", hostnames may not.
    at = 0
    for (i = length(url); i > 0; i--) {
      if (substr(url, i, 1) == "@") { at = i; break }
    }
    if (at > 0) {
      userinfo = substr(url, 1, at - 1)
      rest = substr(url, at + 1)
    } else {
      userinfo = ""
      rest = url
    }

    # Only now look for the path separator, and only in what is left AFTER
    # the credentials -- a "/" inside the password must not be mistaken for
    # the start of the database name.
    slash = index(rest, "/")
    if (slash > 0) {
      hostport = substr(rest, 1, slash - 1)
      db = substr(rest, slash + 1)
    } else {
      hostport = rest
      db = ""
    }

    colon = index(userinfo, ":")
    if (colon > 0) {
      user = substr(userinfo, 1, colon - 1)
      pass = substr(userinfo, colon + 1)
    } else {
      user = userinfo
      pass = ""
    }

    pcolon = 0
    for (i = length(hostport); i > 0; i--) {
      if (substr(hostport, i, 1) == ":") { pcolon = i; break }
    }
    if (pcolon > 0) {
      host = substr(hostport, 1, pcolon - 1)
      port = substr(hostport, pcolon + 1)
    } else {
      host = hostport
      port = "3306"
    }

    print user
    print pass
    print host
    print port
    print db
  }
')

DB_USER=$(printf '%s\n' "$DB_PARSED" | sed -n '1p')
DB_PASS=$(printf '%s\n' "$DB_PARSED" | sed -n '2p')
DB_HOST=$(printf '%s\n' "$DB_PARSED" | sed -n '3p')
DB_PORT=$(printf '%s\n' "$DB_PARSED" | sed -n '4p')

if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ]; then
  echo "entrypoint: could not parse host/port out of DATABASE_URL" >&2
  exit 1
fi

# Function to check MariaDB readiness. Never print DB_PASS -- this is the
# first thing written to `docker logs` on every boot.
check_mariadb_ready() {
  mariadb -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" --skip-ssl -e 'SELECT 1;' > /dev/null 2>&1
}

echo "Waiting for MariaDB at $DB_HOST:$DB_PORT (user $DB_USER)..."

# Bounded wait: ~60s at 1 attempt/sec, so a wrong DATABASE_URL fails fast
# instead of hanging the container forever.
MAX_ATTEMPTS=60
attempt=0
until check_mariadb_ready; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "entrypoint: could not reach MariaDB at $DB_HOST:$DB_PORT after ${MAX_ATTEMPTS}s, giving up" >&2
    exit 1
  fi
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
