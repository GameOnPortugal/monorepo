.DEFAULT_GOAL := help
.PHONY: tests
.SILENT:

include .env

## Colors
COLOR_RESET   = \033[0m
COLOR_INFO    = \033[32m
COLOR_COMMENT = \033[33m

PROJECT_NAME = 'game-on-portugal-discord-bot-app'
NETWORK = 'game-on-portugal-discord-bot-app'

## Help
help:
	printf "${COLOR_COMMENT}Usage:${COLOR_RESET}\n"
	printf " make [target]\n\n"
	printf "${COLOR_COMMENT}Available targets:${COLOR_RESET}\n"
	awk '/^[a-zA-Z\-\_0-9\.@]+:/ { \
		categoryMessage = match(lastLine, /^## \[(.*)\]/); \
		categoryLength = 0; \
		if (categoryMessage) { \
			categoryName = substr(lastLine, RSTART + 4, RLENGTH - 5); \
			categoryLength = length(categoryName) + 2; \
			if (!printedCategory[categoryName]) { \
				printedCategory[categoryName] = 1; \
				printf "\n${COLOR_COMMENT}%s:${COLOR_RESET}\n", categoryName; \
			} \
		} \
		helpMessage = match(lastLine, /^## (.*)/); \
		if (helpMessage) { \
			helpCommand = substr($$1, 0, index($$1, ":")); \
			helpMessage = substr(lastLine, RSTART + 3 + categoryLength, RLENGTH); \
			printf " ${COLOR_INFO}%-16s${COLOR_RESET} %s\n", helpCommand, helpMessage; \
		} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)

DOCKER_COMPOSE = docker compose --project-name $(PROJECT_NAME)
DOCKER_COMPOSE_EXEC ?= $(DOCKER_COMPOSE) exec

## [Docker] Start containers
up:
	$(DOCKER_COMPOSE) up -d

## [Docker] Stop containers
stop:
	$(DOCKER_COMPOSE) stop

## [Docker] Down containers
down:
	$(DOCKER_COMPOSE) down --remove-orphans --volumes

## [Docker] Build containers
build:
	$(DOCKER_COMPOSE) build

## [Docker] Get inside the container
shell sh:
	$(DOCKER_COMPOSE_EXEC) discord-bot /bin/sh

## [BUN] Install packages
install:
	$(DOCKER_COMPOSE_EXEC) discord-bot bun install

## [BUN] Run bun command (COMMAND=command make bun-command)
bun-command:
	$(DOCKER_COMPOSE_EXEC) discord-bot bun $(COMMAND)

.PHONY: create-user create.user
## [App] Create Initial Admin user
create-user create.user:
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx ts-node bin/console create-user "admin" true true true admin
	echo "User: admin@example.com Password: admin created."

.PHONY: test run.test
## [Tests] Run tests
test run.test:
	if [ -z "$(NAME)" ]; then \
		read -p "Enter jest test regex: " NAME; \
    fi; \
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx jest --detectOpenHandles $$NAME

## [Tests] Run tests
tests:
	$(DOCKER_COMPOSE_EXEC) discord-bot bun test --detectOpenHandles

## [Command] Run a command (COMMAND=command make command)
console-command console.command:
	if [ -z "$(COMMAND)" ]; then \
		read -p "Enter command name: " COMMAND; \
    fi; \
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx ts-node bin/console $(COMMAND)

.PHONY: db-diff db.diff
## [Database] Create migration with name (NAME=name-migration make db-create-migration)
db-diff db.diff:
	if [ -z "$(NAME)" ]; then \
		read -p "Enter migration name: " NAME; \
    fi; \
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx prisma migrate dev --name $$NAME --create-only
	@echo "Migration $$NAME created. Apply it with 'make db-migrate'"

.PHONY: db-migrate db.migrate
## [Database] Run migrations
db-migrate db.migrate:
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx prisma migrate deploy

.PHONY: db-migrate-undo
## [Database] Undo last migration
db-migrate-undo db.migrate.undo:
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx prisma migrate reset

.PHONY: db-generate db.generate
## [Database] Generate prisma client
db-generate db.generate:
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx prisma generate

.PHONY: db-test-setup db.test.setup db.tests.setup
## [DATABASE] Reset Database for tests
db-test-setup db.test.setup db.tests.setup:
	$(DOCKER_COMPOSE_EXEC) discord-bot bun run test:setup

.PHONY: db-dev-setup db.dev.setup
## [DATABASE] Reset Database for dev
db-dev-setup db.dev.setup:
	$(DOCKER_COMPOSE_EXEC) discord-bot bun run dev:setup

.PHONY: db-seed db.seed
## [DATABASE] Seed Database
db-seed db.seed:
	$(DOCKER_COMPOSE_EXEC) discord-bot bunx prisma db seed
