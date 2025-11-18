#!/bin/bash

# TourVision Stack Status Script
# Shows the status of all services

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         TourVision Stack Status                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Supabase
echo "📦 Supabase Services:"
if docker ps | grep -q supabase_db; then
    echo -e "  ${GREEN}✓${NC} Database - postgresql://postgres:postgres@localhost:54322/postgres"
else
    echo -e "  ${RED}✗${NC} Database"
fi

if docker ps | grep -q supabase_realtime; then
    echo -e "  ${GREEN}✓${NC} Realtime"
else
    echo -e "  ${RED}✗${NC} Realtime"
fi

if docker ps | grep -q supabase_kong; then
    echo -e "  ${GREEN}✓${NC} API Gateway (Kong) - http://localhost:54321"
else
    echo -e "  ${RED}✗${NC} API Gateway (Kong)"
fi

if docker ps | grep -q supabase_studio; then
    echo -e "  ${GREEN}✓${NC} Studio - http://localhost:54323"
else
    echo -e "  ${RED}✗${NC} Studio"
fi
echo ""

# Check Agent Manager
echo "🤖 Agent Manager:"
if docker ps | grep -q tourvision-agent-manager; then
    echo -e "  ${GREEN}✓${NC} Running in Docker"
    CONTAINER_STATUS=$(docker ps --filter "name=tourvision-agent-manager" --format "{{.Status}}")
    echo -e "  ${BLUE}ℹ${NC}  Status: $CONTAINER_STATUS"
else
    echo -e "  ${RED}✗${NC} Not running"
fi
echo ""

# Check Y-server
echo "📡 Y-server (Durable Object):"
if lsof -ti:8787 > /dev/null 2>&1; then
    PID=$(lsof -ti:8787)
    echo -e "  ${GREEN}✓${NC} Running on ws://localhost:8787 (PID: $PID)"
    if [ -f "logs/y-server.log" ]; then
        echo -e "  ${BLUE}ℹ${NC}  Last log entry:"
        tail -n 1 logs/y-server.log | sed 's/^/    /'
    fi
else
    echo -e "  ${RED}✗${NC} Not running"
fi
echo ""

# Check Y-Editor
echo "📝 Y-Editor (Vite Frontend):"
if lsof -ti:5174 > /dev/null 2>&1; then
    PID=$(lsof -ti:5174)
    echo -e "  ${GREEN}✓${NC} Running on http://localhost:5174 (PID: $PID)"
    if [ -f "logs/y-editor.log" ]; then
        echo -e "  ${BLUE}ℹ${NC}  Last log entry:"
        tail -n 1 logs/y-editor.log | sed 's/^/    /'
    fi
else
    echo -e "  ${RED}✗${NC} Not running"
fi
echo ""

# Check Expo App
echo "📱 Expo Web App:"
if lsof -ti:8082 > /dev/null 2>&1; then
    PID=$(lsof -ti:8082)
    echo -e "  ${GREEN}✓${NC} Running on http://localhost:8082 (PID: $PID)"
    if [ -f "logs/expo.log" ]; then
        echo -e "  ${BLUE}ℹ${NC}  Last log entry:"
        tail -n 1 logs/expo.log | sed 's/^/    /'
    fi
else
    echo -e "  ${RED}✗${NC} Not running"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RUNNING_COUNT=0
TOTAL_COUNT=8

docker ps | grep -q supabase_db && ((RUNNING_COUNT++))
docker ps | grep -q supabase_realtime && ((RUNNING_COUNT++))
docker ps | grep -q supabase_kong && ((RUNNING_COUNT++))
docker ps | grep -q supabase_studio && ((RUNNING_COUNT++))
docker ps | grep -q tourvision-agent-manager && ((RUNNING_COUNT++))
lsof -ti:8787 > /dev/null 2>&1 && ((RUNNING_COUNT++))
lsof -ti:5174 > /dev/null 2>&1 && ((RUNNING_COUNT++))
lsof -ti:8082 > /dev/null 2>&1 && ((RUNNING_COUNT++))

if [ $RUNNING_COUNT -eq $TOTAL_COUNT ]; then
    echo -e "${GREEN}All services running! ($RUNNING_COUNT/$TOTAL_COUNT)${NC}"
elif [ $RUNNING_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Partially running ($RUNNING_COUNT/$TOTAL_COUNT)${NC}"
else
    echo -e "${RED}No services running ($RUNNING_COUNT/$TOTAL_COUNT)${NC}"
fi
echo ""

# Quick actions
echo "Quick actions:"
echo "  Start all:  ./scripts/start-stack.sh"
echo "  Stop all:   ./scripts/stop-stack.sh"
echo "  Logs:       docker compose logs -f  (Supabase)"
echo "              tail -f logs/y-server.log"
echo "              tail -f logs/y-editor.log"
echo "              tail -f logs/expo.log"
echo ""
