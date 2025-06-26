# Voice Channel Server

Rust backend for the voice channel application using Poem and poem_openapi.

## Development Setup

### Quick Start

1. **Start development dependencies:**
   ```bash
   docker compose up -d
   ```

2. **Copy environment configuration:**
   ```bash
   cp env.example .env
   ```

3. **Run the server:**
   ```bash
   cargo run
   ```

The server will be available at http://localhost:3001 with:
- API endpoints at `/api/*`
- OpenAPI documentation at `/swagger-ui`
- API schema at `/api-docs/openapi.json`

### Development Dependencies

The `docker-compose.yml` in this directory provides:

- **PostgreSQL** (port 5432): Main database
- **Redis** (port 6379): Caching and sessions (for future use)

### Environment Variables

Copy `env.example` to `.env` and customize:

```bash
DATABASE_URL=postgres://postgres:password@localhost/voice_channel
HOST=0.0.0.0
PORT=3001
INSTANCE_FQDN=localhost
ENABLE_FEDERATION=false
RUST_LOG=info
```

### Database Migrations

Migrations run automatically when starting the server. Manual migration:

```bash
cargo run --bin migrate  # If you create a migration binary
# Or they run automatically on server start
```

### API Documentation

Visit http://localhost:3001/swagger-ui to explore the API interactively.

### Production

The production deployment uses the global `compose.yml` with the container image:
```
ghcr.io/v3xlabs/voice-channel/server:latest
```
