#!/bin/bash

# Development startup script for voice-channel project

set -e

echo "🚀 Starting Voice Channel Development Environment"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start development dependencies if not running
if ! docker ps | grep -q voice-channel-dev-postgres; then
    echo "🐘 Starting development dependencies..."
    cd packages/server
    docker compose up -d
    cd ../..
    
    echo "⏳ Waiting for dependencies to be ready..."
    sleep 5
fi

# Function to start backend
start_backend() {
    echo "🦀 Starting Rust backend..."
    cd packages/server
    
    # Copy .env if it doesn't exist
    if [ ! -f .env ]; then
        cp env.example .env
        echo "📄 Created .env file from env.example"
    fi
    
    cargo run
}

# Function to start frontend
start_frontend() {
    echo "⚛️  Starting React frontend..."
    cd packages/web
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d node_modules ]; then
        echo "📦 Installing dependencies..."
        pnpm install
    fi
    
    pnpm run dev
}

# Parse command line arguments
case "${1:-both}" in
    "backend"|"server")
        start_backend
        ;;
    "frontend"|"web")
        start_frontend
        ;;
    "both"|"")
        # Start both in background
        echo "🌟 Starting both backend and frontend..."
        
        # Start backend in background
        (start_backend) &
        BACKEND_PID=$!
        
        # Wait a moment for backend to start
        sleep 3
        
        # Start frontend
        start_frontend
        
        # Kill backend when frontend exits
        kill $BACKEND_PID 2>/dev/null || true
        ;;
    *)
        echo "Usage: $0 [backend|frontend|both]"
        echo "  backend   - Start only the Rust backend"
        echo "  frontend  - Start only the React frontend" 
        echo "  both      - Start both backend and frontend (default)"
        exit 1
        ;;
esac 