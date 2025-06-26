#!/bin/bash

# Setup script for voice-channel project

set -e

echo "🔧 Setting up Voice Channel Project"

# Check if required tools are installed
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    else
        echo "✅ $1 is installed"
    fi
}

echo "🔍 Checking required tools..."
check_tool "docker"
check_tool "cargo"
check_tool "node"
check_tool "pnpm"

# Setup backend
echo "🦀 Setting up Rust backend..."
cd packages/server

# Copy environment file
if [ ! -f .env ]; then
    cp env.example .env
    echo "📄 Created .env file"
fi

# Check if we can build
echo "🔨 Checking Rust compilation..."
cargo check

cd ../..

# Setup frontend
echo "⚛️  Setting up React frontend..."
cd packages/web

# Install dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install

# Check if we can build
echo "🔨 Checking TypeScript compilation..."
pnpm run build

cd ../..

# Start development dependencies
echo "🐘 Setting up development dependencies..."
cd packages/server
if docker ps | grep -q voice-channel-dev-postgres; then
    echo "📊 Development dependencies are already running"
else
    docker compose up -d
    echo "⏳ Waiting for dependencies to be ready..."
    sleep 10
fi
cd ../..

# Run database migrations
echo "🗃️  Running database migrations..."
cd packages/server
cargo run --bin migrate || echo "⚠️  Migration failed - this is normal on first setup"

cd ../..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start development:"
echo "  ./scripts/dev.sh                 # Start both backend and frontend"
echo "  ./scripts/dev.sh backend         # Start only backend"
echo "  ./scripts/dev.sh frontend        # Start only frontend"
echo ""
echo "Access points:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo "  API Docs: http://localhost:3001/swagger-ui"
echo "" 