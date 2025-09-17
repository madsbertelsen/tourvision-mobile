#!/bin/bash

# Monitor Edge Function Logs
# This script helps monitor the process-chat-message Edge Function

echo "🔍 Edge Function Monitor"
echo "========================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test the Edge Function
test_function() {
    echo -e "${YELLOW}Testing Edge Function...${NC}"

    RESPONSE=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/process-chat-message \
        -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
        -H "Content-Type: application/json" \
        -d "{\"message_id\": \"test-$(date +%s)\", \"trip_id\": \"77528bea-3f27-450b-9dce-11f1c18fce0e\", \"user_id\": \"test-user\", \"message\": \"Test message from monitor\"}")

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ Function responded:${NC} $RESPONSE"
    else
        echo -e "${RED}✗ Function test failed${NC}"
    fi
}

# Function to check recent messages
check_messages() {
    echo -e "\n${YELLOW}Recent Chat Messages:${NC}"

    # Using psql via Docker container
    docker exec -it supabase-db-tourvision-mobile psql -U postgres -d postgres -c \
        "SELECT id, message, created_at FROM trip_chat_messages ORDER BY created_at DESC LIMIT 5;" 2>/dev/null

    if [[ $? -ne 0 ]]; then
        echo -e "${RED}Could not query database. Make sure Supabase is running.${NC}"
    fi
}

# Function to check AI suggestions
check_suggestions() {
    echo -e "\n${YELLOW}Recent AI Suggestions:${NC}"

    docker exec -it supabase-db-tourvision-mobile psql -U postgres -d postgres -c \
        "SELECT id, suggestion_type, title, created_at FROM ai_suggestions ORDER BY created_at DESC LIMIT 5;" 2>/dev/null

    if [[ $? -ne 0 ]]; then
        echo -e "${RED}Could not query AI suggestions.${NC}"
    fi
}

# Main menu
while true; do
    echo -e "\n${BLUE}Options:${NC}"
    echo "1. Test Edge Function"
    echo "2. View Recent Chat Messages"
    echo "3. View Recent AI Suggestions"
    echo "4. View All (Messages + Suggestions)"
    echo "5. Exit"
    echo -n "Select option: "
    read option

    case $option in
        1)
            test_function
            ;;
        2)
            check_messages
            ;;
        3)
            check_suggestions
            ;;
        4)
            check_messages
            check_suggestions
            ;;
        5)
            echo "Exiting monitor..."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
done