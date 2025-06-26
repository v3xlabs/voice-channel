# Voice Channel

A fair, simple, and reliable voice, video, and screen sharing system built with Rust and React.

## Features

- **Voice Communication**: Real-time voice chat using WebRTC
- **Video Sharing**: Turn on webcam for video calls
- **Screen Sharing**: Share your screen with other participants
- **Federation**: Run multiple instances that can communicate with each other
- **Simple UI**: Clean, modern interface built with React and Tailwind CSS

## Technology Stack

### Backend
- **Rust** with Poem web framework
- **PostgreSQL** database with SQLx
- **OpenAPI** documentation with poem_openapi
- **WebRTC** for real-time communication

### Frontend
- **React** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **TanStack Router** for file-based routing
- **TanStack Query** for data fetching
- **Radix UI** for accessible components
- **openapi-typescript** for type-safe API client

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Rust (1.75+) for local development
- Node.js (18+) for local development

### Using Docker Compose - Production

1. Clone the repository:
```bash
git clone <repository-url>
cd voice-channel
```

2. Start all services:
```bash
docker compose up -d
```

3. Access the application:
- Web UI: http://localhost:3000
- API Documentation: http://localhost:3001/swagger-ui

### Local Development

#### Backend Setup
```bash
cd packages/server

# Start development dependencies (PostgreSQL, Redis)
docker compose up -d

# Copy environment file
cp env.example .env

# Run the server
cargo run
```

#### Frontend Setup
```bash
cd packages/web

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Federation

This software supports federation, allowing multiple instances to discover and share channels with each other.

### URL Format
- Current instance: `http://your-domain.com/#channel-name`
- Remote instance: `http://your-domain.com/remote-instance.com#channel-name`

### Configuration
Set the `INSTANCE_FQDN` environment variable to your domain name to enable federation.

## API Documentation

When running the server, visit `/swagger-ui` to see the OpenAPI documentation for all available endpoints.

## Development

The frontend uses OpenAPI types generated from the backend schema. When you run `pnpm dev`, it automatically:

1. Generates TypeScript types from the backend OpenAPI schema
2. Starts the Vite development server with hot reload
3. Proxies API requests to the backend server

### Project Structure
```
voice-channel/
├── packages/
│   ├── server/          # Rust backend
│   │   ├── src/
│   │   │   ├── handlers/api.rs  # poem_openapi endpoints
│   │   │   ├── models/          # Database models
│   │   │   └── main.rs
│   │   ├── migrations/
│   │   └── Cargo.toml
│   └── web/             # React frontend
│       ├── src/
│       │   ├── routes/          # TanStack Router file-based routes
│       │   ├── types/api.ts     # Generated OpenAPI types
│       │   ├── services/api.ts  # Type-safe API client
│       │   └── pages/
│       ├── public/
│       └── package.json
├── docker-compose.yml
└── Cargo.toml           # Workspace configuration
```

### Environment Variables

#### Server
- `DATABASE_URL`: PostgreSQL connection string
- `HOST`: Server bind address (default: 0.0.0.0)
- `PORT`: Server port (default: 3001)
- `INSTANCE_FQDN`: Your instance's domain name
- `ENABLE_FEDERATION`: Enable federation features

#### Web
- `VITE_API_URL`: Backend API URL (default: http://localhost:3001)

## Roadmap

- [x] Basic project setup
- [x] Channel creation and listing
- [x] REST API with OpenAPI documentation
- [ ] WebRTC integration for voice
- [ ] Video calling support
- [ ] Screen sharing
- [ ] Federation between instances
- [ ] Authentication and user management
- [ ] Persistent voice channels
- [ ] Mobile-responsive design

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and ensure everything works
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
