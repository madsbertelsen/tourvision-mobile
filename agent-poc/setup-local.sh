#!/bin/bash
# Local Setup Script for Multi-Document Agent System
# This script automates the local development environment setup

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is running
check_docker() {
    print_step "Checking Docker..."
    if ! docker ps &> /dev/null; then
        print_error "Docker is not running. Please start Docker Desktop and try again."
        echo "Run: open -a Docker"
        exit 1
    fi
    print_success "Docker is running"
}

# Check if Supabase CLI is available
check_supabase_cli() {
    print_step "Checking Supabase CLI..."
    if ! command -v supabase &> /dev/null; then
        print_warning "Supabase CLI not found globally, will use npx"
    else
        print_success "Supabase CLI found"
    fi
}

# Start Supabase
start_supabase() {
    print_step "Starting local Supabase..."

    # Navigate to project root
    cd ..

    # Check if Supabase is already running
    if npx supabase status &> /dev/null; then
        print_warning "Supabase is already running"
        npx supabase status
    else
        print_step "Starting Supabase containers (this may take 1-2 minutes)..."
        npx supabase start
    fi

    # Return to agent-poc directory
    cd agent-poc

    print_success "Supabase started"
}

# Get Supabase credentials
get_supabase_credentials() {
    print_step "Fetching Supabase credentials..."

    cd ..

    # Get service role key
    SERVICE_ROLE_KEY=$(npx supabase status --output json 2>/dev/null | grep -o '"service_role key": "[^"]*' | grep -o '[^"]*$' || echo "")
    SUPABASE_URL=$(npx supabase status --output json 2>/dev/null | grep -o '"API URL": "[^"]*' | grep -o '[^"]*$' || echo "http://127.0.0.1:54321")

    if [ -z "$SERVICE_ROLE_KEY" ]; then
        print_warning "Could not auto-detect service role key, will use npx supabase status output"
        cd agent-poc
        return 1
    fi

    cd agent-poc

    print_success "Credentials fetched"
    return 0
}

# Create .env.local file
create_env_local() {
    print_step "Creating .env.local configuration..."

    # Check if .env.local already exists
    if [ -f .env.local ]; then
        print_warning ".env.local already exists"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_step "Skipping .env.local creation"
            return
        fi
    fi

    # Get AI Gateway API key from .env if exists
    AI_GATEWAY_KEY=""
    if [ -f .env ]; then
        AI_GATEWAY_KEY=$(grep "AI_GATEWAY_API_KEY" .env | cut -d'=' -f2)
    fi

    # Create .env.local
    cat > .env.local <<EOF
# AI Gateway Configuration
AI_GATEWAY_API_KEY=${AI_GATEWAY_KEY:-your-ai-gateway-api-key}

# Local Supabase Configuration
SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:54321}
SUPABASE_SERVICE_KEY=${SERVICE_ROLE_KEY:-paste-service-role-key-here}

# Agent Manager Configuration
MANAGER_ID=manager-local-dev
MAX_CONCURRENT_AGENTS=5
IDLE_TIMEOUT_MS=30000

# WebSocket Configuration
WS_PORT=8787
PARTY_NAME=document
EOF

    if [ -z "$SERVICE_ROLE_KEY" ]; then
        print_warning ".env.local created but you need to manually add SUPABASE_SERVICE_KEY"
        echo "Run: npx supabase status"
        echo "Copy the 'service_role key' and paste it into .env.local"
    else
        print_success ".env.local created with auto-detected credentials"
    fi
}

# Create .dev.vars file
create_dev_vars() {
    print_step "Creating .dev.vars for Cloudflare Workers..."

    if [ -f .dev.vars ]; then
        print_warning ".dev.vars already exists, skipping"
        return
    fi

    cat > .dev.vars <<EOF
# Cloudflare Workers Dev Environment Variables
# This file is used by 'wrangler dev' for local development

SUPABASE_SERVICE_KEY=${SERVICE_ROLE_KEY:-paste-service-role-key-here}
EOF

    if [ -z "$SERVICE_ROLE_KEY" ]; then
        print_warning ".dev.vars created but you need to manually add SUPABASE_SERVICE_KEY"
    else
        print_success ".dev.vars created with auto-detected credentials"
    fi
}

# Update wrangler.toml for local development
update_wrangler_config() {
    print_step "Checking wrangler.toml configuration..."

    # Check if SUPABASE_URL is set to local
    if grep -q "SUPABASE_URL.*127.0.0.1" wrangler.toml; then
        print_success "wrangler.toml already configured for local development"
    else
        print_warning "wrangler.toml may need manual update for local Supabase URL"
        echo "Ensure [vars] section has: SUPABASE_URL = \"http://127.0.0.1:54321\""
    fi
}

# Install dependencies
install_dependencies() {
    print_step "Installing npm dependencies..."

    if [ ! -d node_modules ]; then
        npm install
        print_success "Dependencies installed"
    else
        print_warning "node_modules already exists, skipping install"
        print_step "Run 'npm install' manually if you need to update dependencies"
    fi
}

# Apply migrations
apply_migrations() {
    print_step "Applying database migrations..."

    cd ..

    # Check migration status
    print_step "Checking migration status..."
    npx supabase migration list --local

    # Apply migrations
    print_step "Pushing migrations to local database..."
    npx supabase db push --local

    cd agent-poc

    print_success "Migrations applied"
}

# Verify database tables
verify_database() {
    print_step "Verifying database tables..."

    cd ..

    # Check if tables exist
    TABLES=$(npx supabase db psql --command "\dt" --local 2>/dev/null || echo "")

    if echo "$TABLES" | grep -q "agent_connections"; then
        print_success "agent_connections table exists"
    else
        print_error "agent_connections table not found"
    fi

    if echo "$TABLES" | grep -q "document_activity"; then
        print_success "document_activity table exists"
    else
        print_error "document_activity table not found"
    fi

    if echo "$TABLES" | grep -q "agent_metrics"; then
        print_success "agent_metrics table exists"
    else
        print_error "agent_metrics table not found"
    fi

    cd agent-poc
}

# Print next steps
print_next_steps() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Local Setup Complete! 🎉                             ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo -e "  ${YELLOW}1.${NC} Open Supabase Studio:"
    echo -e "     ${BLUE}http://127.0.0.1:54323${NC}"
    echo ""
    echo -e "  ${YELLOW}2.${NC} Start the Durable Object server (Terminal 1):"
    echo -e "     ${GREEN}npm run dev:server${NC}"
    echo ""
    echo -e "  ${YELLOW}3.${NC} Start the Agent Manager (Terminal 2):"
    echo -e "     ${GREEN}npm run agent-manager${NC}"
    echo ""
    echo -e "  ${YELLOW}4.${NC} Test the system:"
    echo -e "     Open: ${BLUE}http://localhost:8787${NC}"
    echo -e "     Connect to a document and type text ending with '.'"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "  • View Supabase status: ${GREEN}npx supabase status${NC}"
    echo -e "  • View logs: ${GREEN}npx supabase logs db${NC}"
    echo -e "  • Stop Supabase: ${GREEN}npx supabase stop${NC}"
    echo -e "  • Reset database: ${GREEN}npx supabase db reset --local${NC}"
    echo ""
    echo -e "${BLUE}Documentation:${NC}"
    echo -e "  • Local setup guide: ${GREEN}LOCAL_SETUP.md${NC}"
    echo -e "  • Architecture docs: ${GREEN}AGENT_MANAGER_README.md${NC}"
    echo ""
}

# Main setup flow
main() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Multi-Document Agent System - Local Setup                 ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Run setup steps
    check_docker
    check_supabase_cli
    start_supabase

    # Get credentials (may fail, that's okay)
    get_supabase_credentials || true

    create_env_local
    create_dev_vars
    update_wrangler_config
    install_dependencies
    apply_migrations
    verify_database

    # Print next steps
    print_next_steps
}

# Run main function
main
