# FlowForge

FlowForge is a Go service for distributed workflow orchestration. The repository currently contains **Phase 1: Foundation** only: configuration validation, PostgreSQL connectivity and migrations, a persisted `User` repository, and a database-aware health endpoint. Workflow execution, queues, workers, scheduling, webhooks, and the dashboard are planned for later phases and are not implemented yet.

## Prerequisites

- Go 1.24+
- Docker and Docker Compose

## Start PostgreSQL

```sh
docker compose up -d postgres
```

Wait until the service is healthy:

```sh
docker compose ps
```

## Configure the service

```sh
cp .env.example .env
set -a
. ./.env
set +a
```

`.env` is local-only and ignored by git. Do not put real credentials in the repository.

## Run migrations

```sh
go run ./cmd/migrate
```

The migration command uses goose and is safe to run again against the same database.

## Start FlowForge

In another terminal, load the same environment and start the service:

```sh
set -a
. ./.env
set +a
go run ./cmd/flowforge
```

The server listens on `HTTP_ADDR`, which defaults to `:8080` in `.env.example`.

## Verify health

```sh
curl -i http://localhost:8080/health
```

With PostgreSQL available, the endpoint returns HTTP `200` and a JSON body showing both service and database health. If PostgreSQL becomes unavailable, it returns HTTP `503` with a degraded status.

## Run tests

Unit tests run without external services:

```sh
go test ./...
```

PostgreSQL integration tests run when `INTEGRATION_DATABASE_URL` is set. For the local Compose database:

```sh
INTEGRATION_DATABASE_URL="$DATABASE_URL" go test ./...
```

The integration suite verifies migrations, migration reruns, database connectivity, User persistence, and the real database-backed health path.
