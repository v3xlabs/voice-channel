.PHONY: help setup dev dev-backend dev-frontend build test clean docker-up docker-down

# Default target
help:
	@echo "Voice Channel Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Initial project setup"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start both backend and frontend"
	@echo "  make dev-backend    - Start only backend"
	@echo "  make dev-frontend   - Start only frontend"
	@echo ""
	@echo "Building:"
	@echo "  make build          - Build both backend and frontend"
	@echo "  make build-backend  - Build only backend"
	@echo "  make build-frontend - Build only frontend"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-backend   - Run backend tests"
	@echo "  make test-frontend  - Run frontend tests"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up      - Start with Docker Compose"
	@echo "  make docker-down    - Stop Docker Compose"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Clean build artifacts"

# Setup
setup:
	@chmod +x scripts/setup.sh
	@./scripts/setup.sh

# Development
dev:
	@chmod +x scripts/dev.sh
	@./scripts/dev.sh both

dev-backend:
	@chmod +x scripts/dev.sh
	@./scripts/dev.sh backend

dev-frontend:
	@chmod +x scripts/dev.sh
	@./scripts/dev.sh frontend

# Building
build: build-backend build-frontend

build-backend:
	@echo "🦀 Building Rust backend..."
	@cd packages/server && cargo build --release

build-frontend:
	@echo "⚛️  Building React frontend..."
	@cd packages/web && npm run build

# Testing
test: test-backend test-frontend

test-backend:
	@echo "🦀 Testing Rust backend..."
	@cd packages/server && cargo test

test-frontend:
	@echo "⚛️  Testing React frontend..."
	@cd packages/web && npm test

# Docker
docker-up:
	@echo "🐳 Starting with Docker Compose..."
	@docker-compose up -d

docker-down:
	@echo "🐳 Stopping Docker Compose..."
	@docker-compose down

# Cleanup
clean:
	@echo "🧹 Cleaning build artifacts..."
	@cd packages/server && cargo clean
	@cd packages/web && rm -rf dist node_modules/.cache
	@docker system prune -f 