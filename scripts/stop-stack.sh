#!/bin/bash

# TourVision Stack Stop Script
# Stops all services gracefully

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
echo "║         TourVision Stack Stop Script                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. Stop Expo App
log_info "Stopping Expo app..."
if [ -f "logs/expo.pid" ]; then
    EXPO_PID=$(cat logs/expo.pid)
    if kill -0 $EXPO_PID 2>/dev/null; then
        kill $EXPO_PID
        log_success "Expo app stopped"
    else
        log_warning "Expo app was not running"
    fi
    rm -f logs/expo.pid
else
    # Fallback: kill by port
    if lsof -ti:8082 > /dev/null 2>&1; then
        kill $(lsof -ti:8082)
        log_success "Expo app stopped (by port)"
    else
        log_warning "Expo app was not running"
    fi
fi
echo ""

# 2. Stop Y-Editor
log_info "Stopping Y-Editor..."
if [ -f "logs/y-editor.pid" ]; then
    Y_EDITOR_PID=$(cat logs/y-editor.pid)
    if kill -0 $Y_EDITOR_PID 2>/dev/null; then
        kill $Y_EDITOR_PID
        log_success "Y-Editor stopped"
    else
        log_warning "Y-Editor was not running"
    fi
    rm -f logs/y-editor.pid
else
    # Fallback: kill by port
    if lsof -ti:5174 > /dev/null 2>&1; then
        kill $(lsof -ti:5174)
        log_success "Y-Editor stopped (by port)"
    else
        log_warning "Y-Editor was not running"
    fi
fi
echo ""

# 3. Stop Y-server
log_info "Stopping Y-server..."
if [ -f "logs/y-server.pid" ]; then
    Y_SERVER_PID=$(cat logs/y-server.pid)
    if kill -0 $Y_SERVER_PID 2>/dev/null; then
        kill $Y_SERVER_PID
        log_success "Y-server stopped"
    else
        log_warning "Y-server was not running"
    fi
    rm -f logs/y-server.pid
else
    # Fallback: kill by port
    if lsof -ti:8787 > /dev/null 2>&1; then
        kill $(lsof -ti:8787)
        log_success "Y-server stopped (by port)"
    else
        log_warning "Y-server was not running"
    fi
fi
echo ""

# 4. Stop Agent Manager
log_info "Stopping Agent Manager..."
if docker ps | grep -q tourvision-agent-manager; then
    docker compose stop agent-manager
    log_success "Agent Manager stopped"
else
    log_warning "Agent Manager was not running"
fi
echo ""

# 5. Stop Supabase stack (optional - ask user)
read -p "Stop Supabase stack as well? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Stopping Supabase stack..."
    docker compose down
    log_success "Supabase stack stopped"
else
    log_info "Keeping Supabase stack running"
fi
echo ""

# Print summary
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Stack Stopped! 🛑                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
