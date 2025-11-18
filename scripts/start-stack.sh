#!/bin/bash

# TourVision Stack Startup Script
# Starts all services in the correct order

set -e  # Exit on error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Print banner
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         TourVision Stack Startup Script             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

if ! command -v bun &> /dev/null; then
    log_error "Bun is not installed"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    log_error "npx (Node.js) is not installed"
    exit 1
fi

log_success "All prerequisites met"
echo ""

# 1. Start Supabase stack (if not already running)
log_info "Starting Supabase stack..."
if docker ps | grep -q supabase-db; then
    log_warning "Supabase is already running"
else
    npx supabase start --exclude edge-runtime
    log_success "Supabase stack started"
fi
echo ""

# 2. Start Agent Manager (via Docker) - COMMENTED OUT - needs environment configuration
# log_info "Starting Agent Manager..."
# if docker ps | grep -q tourvision-agent-manager; then
#     log_warning "Agent Manager is already running"
#     docker compose restart agent-manager
# else
#     docker compose up -d agent-manager
# fi
# log_success "Agent Manager started"
# echo ""

# 3. Start Y-server (Cloudflare Durable Object)
log_info "Starting Y-server (Cloudflare Durable Object)..."
cd y-server

# Check if already running
if lsof -ti:8787 > /dev/null 2>&1; then
    log_warning "Y-server is already running on port 8787"
    log_info "Killing existing process..."
    kill $(lsof -ti:8787) 2>/dev/null || true
    sleep 2
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing Y-server dependencies..."
    bun install
fi

# Start in background
log_info "Starting Wrangler dev server..."
nohup bun run dev > ../logs/y-server.log 2>&1 &
Y_SERVER_PID=$!
echo $Y_SERVER_PID > ../logs/y-server.pid
log_success "Y-server started (PID: $Y_SERVER_PID)"
cd ..
echo ""

# 4. Start Y-Editor (Vite frontend)
log_info "Starting Y-Editor (Vite frontend)..."
cd y-editor

# Check if already running
if lsof -ti:5174 > /dev/null 2>&1; then
    log_warning "Y-Editor is already running on port 5174"
    log_info "Killing existing process..."
    kill $(lsof -ti:5174) 2>/dev/null || true
    sleep 2
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing Y-Editor dependencies..."
    bun install
fi

# Start in background
log_info "Starting Vite dev server..."
nohup bun run dev > ../logs/y-editor.log 2>&1 &
Y_EDITOR_PID=$!
echo $Y_EDITOR_PID > ../logs/y-editor.pid
log_success "Y-Editor started (PID: $Y_EDITOR_PID)"
cd ..
echo ""

# 5. Start Expo App
log_info "Starting Expo web app..."
cd expo-app

# Check if already running
if lsof -ti:8082 > /dev/null 2>&1; then
    log_warning "Expo app is already running on port 8082"
    log_info "Killing existing process..."
    kill $(lsof -ti:8082) 2>/dev/null || true
    sleep 2
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing Expo dependencies..."
    npm install
fi

# Start in background
log_info "Starting Expo dev server..."
nohup npx expo start --web --port 8082 > ../logs/expo.log 2>&1 &
EXPO_PID=$!
echo $EXPO_PID > ../logs/expo.pid
log_success "Expo app started (PID: $EXPO_PID)"
cd ..
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

# Print summary
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Stack Started! 🚀                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Services running:"
echo "  🗄️  Supabase Studio:    http://localhost:54323"
echo "  🔌 Supabase API:        http://localhost:54321"
echo "  📡 Y-server:            ws://localhost:8787"
echo "  📝 Y-Editor:            http://localhost:5174"
echo "  📱 Expo App:            http://localhost:8082"
echo ""
echo "Note: Agent Manager is commented out (needs env config)"
echo ""
echo "Logs:"
echo "  📄 Y-server:            tail -f logs/y-server.log"
echo "  📄 Y-Editor:            tail -f logs/y-editor.log"
echo "  📄 Expo:                tail -f logs/expo.log"
echo "  📄 Agent Manager:       docker compose logs -f agent-manager"
echo "  📄 Supabase:            docker compose logs -f"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop-stack.sh"
echo ""
