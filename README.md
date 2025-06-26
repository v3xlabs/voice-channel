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
- **Rust** with Axum web framework
- **PostgreSQL** database with SQLx
- **OpenAPI** documentation with utoipa
- **WebRTC** for real-time communication

### Frontend
- **React** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Rust (1.75+) for local development
- Node.js (18+) for local development

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd voice-channel
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the application:
- Web UI: http://localhost:3000
- API Documentation: http://localhost:3001/swagger-ui

### Local Development

#### Backend Setup
```bash
cd packages/server

# Copy environment file
cp env.example .env

# Start PostgreSQL (or use Docker)
docker run -d --name postgres \
  -e POSTGRES_DB=voice_channel \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15

# Run the server
cargo run
```

#### Frontend Setup
```bash
cd packages/web

# Install dependencies
pnpm install

# Start development server
pnpm run dev
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

### Project Structure
```
voice-channel/
├── packages/
│   ├── server/          # Rust backend
│   │   ├── src/
│   │   ├── migrations/
│   │   └── Cargo.toml
│   └── web/             # React frontend
│       ├── src/
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
