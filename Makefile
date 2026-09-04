# FlowForge development and release helpers.
#
# .env must be loaded for targets that talk to a database, unless the
# environment is already populated (e.g. CI). See .env.example.

GO ?= go
BIN_DIR ?= bin

.PHONY: all
all: build

.PHONY: fmt
fmt:
	$(GO) fmt ./...

.PHONY: vet
vet:
	$(GO) vet ./...

.PHONY: build
build:
	$(GO) build ./...

.PHONY: build-binaries
build-binaries:
	mkdir -p $(BIN_DIR)
	$(GO) build -o $(BIN_DIR)/flowforge ./cmd/flowforge
	$(GO) build -o $(BIN_DIR)/worker ./cmd/worker
	$(GO) build -o $(BIN_DIR)/migrate ./cmd/migrate
	$(GO) build -o $(BIN_DIR)/retention ./cmd/retention

.PHONY: test
test:
	$(GO) test ./... -count=1

.PHONY: test-integration
test-integration:
	$(GO) test ./... -count=1

.PHONY: test-race
test-race:
	$(GO) test -race ./... -count=1

.PHONY: check
check:
	@unformatted=$$($(GO) fmt -l .); \
	if [ -n "$$unformatted" ]; then \
		echo "The following files are not gofmt-formatted:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi
	$(GO) vet ./...
	$(GO) build ./...

.PHONY: migrate
migrate:
	$(GO) run ./cmd/migrate

.PHONY: retention
retention:
	$(GO) run ./cmd/retention -days 30

.PHONY: clean
clean:
	rm -rf $(BIN_DIR)
