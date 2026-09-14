# syntax=docker/dockerfile:1.7

########## build ##########
FROM golang:1.24-bookworm AS build

WORKDIR /src

# Dependency layer first, so `go mod download` is cached when only source changes.
COPY go.mod go.sum ./
RUN go mod download

# Remaining source. internal/db/migrations/*.sql are embedded via //go:embed, so they
# must be present in this layer — do not exclude them in .dockerignore.
COPY . .

# CGO off produces a fully static binary that runs on a minimal base image.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/flowforge ./cmd/flowforge \
 && go build -trimpath -ldflags="-s -w" -o /out/worker    ./cmd/worker \
 && go build -trimpath -ldflags="-s -w" -o /out/migrate   ./cmd/migrate \
 && go build -trimpath -ldflags="-s -w" -o /out/retention ./cmd/retention

########## runtime ##########
# distroless/static ships ca-certificates, which this application REQUIRES: it makes
# outbound HTTPS calls to AI providers (OpenAI/Cohere) and to HTTP task targets
# (internal/execution, internal/ai). Do NOT use `scratch` — with no CA bundle every
# TLS call fails at runtime, and the AI and HTTP-task features break with an opaque error.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/ /app/

# The image holds four binaries and no ENTRYPOINT, so *both* the documented
# local verification and Azure Container Apps' `command` work:
#
#   docker run flowforge:local                → /app/flowforge  (the API)
#   docker run flowforge:local /app/migrate   → /app/migrate
#   docker run flowforge:local /app/worker    → /app/worker
#
# With `ENTRYPOINT ["/app/flowforge"]` the extra argument would be passed *to the
# API binary* and silently ignored, so `docker run … /app/migrate` would start the
# API and fail on the missing HTTP_ADDR instead of migrating. Container Apps
# `--command` overrides ENTRYPOINT, so it happens to work there — but relying on
# that makes the image unusable from Compose, Kubernetes, Fly.io and plain Docker.
# CMD (not ENTRYPOINT) is what makes the entrypoint selectable everywhere.
CMD ["/app/flowforge"]
