# Docker Setup for Discord Bot TS

This directory contains Docker configuration files for running the Discord Bot TS application.

## Files

- `Dockerfile`: Multi-stage build configuration for the Bun application
- `.dockerignore`: Specifies files that should be excluded from the Docker build
- `docker-compose.yml`: Configuration for running the application with Docker Compose

## Usage

### Building the Docker Image

From the project root directory:

```bash
docker build -t discord-bot-ts -f discord-bot-ts/docker/Dockerfile .
```

### Running with Docker

```bash
docker run -p 3000:3000 discord-bot-ts
```

### Running with Docker Compose

From the `discord-bot-ts/docker` directory:

```bash
docker-compose up
```

For detached mode:

```bash
docker-compose up -d
```

To stop the containers:

```bash
docker-compose down
```

## Environment Variables

You can customize the application behavior by setting environment variables:

- `NODE_ENV`: Set to `production` for production environment or `development` for development
- `PORT`: The port on which the application will run (default: 3000)
- `DATABASE_URL`: Connection string for the MariaDB database

Add additional environment variables in the `docker-compose.yml` file or pass them when running the Docker container.

## Database

The Docker Compose setup includes a MariaDB database with the following configuration:

- **Host**: mariadb
- **Port**: 3306
- **Database**: discord_bot
- **User**: botuser
- **Password**: botpassword
- **Root Password**: rootpassword

### Database Management

The setup also includes Adminer, a database management tool:

- **URL**: http://localhost:8080
- **Server**: mariadb
- **Username**: botuser
- **Password**: botpassword
- **Database**: discord_bot

### Persistent Data

Database data is stored in a Docker volume named `mariadb-data` to ensure data persistence between container restarts.

## Development Mode

For development, the Docker Compose configuration mounts the source code directory as a volume, allowing you to make changes without rebuilding the image.

## Production Deployment

For production deployment, consider:

1. Using the multi-stage build to create a minimal production image
2. Setting `NODE_ENV=production`
3. Implementing proper logging and monitoring
4. Setting up a CI/CD pipeline for automated builds and deployments
