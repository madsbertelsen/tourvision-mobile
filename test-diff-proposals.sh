#!/bin/bash

# Test script for diff proposals functionality
# This script verifies the complete flow from chat message to proposal acceptance

set -e

echo "🧪 Testing Diff Proposals Functionality"
echo "======================================="

# Database connection
DB_CMD="docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check database state
echo -e "\n${YELLOW}Step 1: Checking database state...${NC}"
echo "Checking proposals table structure:"
$DB_CMD -c "\d proposals" | grep -E "(approval_count|rejection_count|applied_at)" || true

echo -e "\nChecking existing proposals:"
$DB_CMD -c "SELECT id, trip_id, status, approval_count, rejection_count, applied_at FROM proposals ORDER BY created_at DESC LIMIT 3;"

# Step 2: Check for any pending proposals with decorations
echo -e "\n${YELLOW}Step 2: Checking proposals with diff decorations...${NC}"
$DB_CMD -c "SELECT
    p.id,
    p.trip_id,
    p.status,
    p.approval_count,
    p.required_approvals,
    jsonb_array_length(p.diff_decorations) as decoration_count,
    t.title as trip_title
FROM proposals p
JOIN trips t ON p.trip_id = t.id
WHERE p.diff_decorations IS NOT NULL
    AND jsonb_array_length(p.diff_decorations) > 0
ORDER BY p.created_at DESC
LIMIT 5;"

# Step 3: Check proposal votes
echo -e "\n${YELLOW}Step 3: Checking proposal votes...${NC}"
$DB_CMD -c "SELECT
    pv.proposal_id,
    pv.vote_type,
    COUNT(*) as vote_count
FROM proposal_votes pv
JOIN proposals p ON pv.proposal_id = p.id
WHERE p.status = 'pending'
GROUP BY pv.proposal_id, pv.vote_type
ORDER BY pv.proposal_id;"

# Step 4: Check trip document sizes for validation
echo -e "\n${YELLOW}Step 4: Validating trip document sizes...${NC}"
$DB_CMD -c "SELECT
    t.id,
    t.title,
    CASE
        WHEN itinerary_document IS NULL THEN 'NULL'
        WHEN itinerary_document::text = '{}' THEN 'Empty object'
        WHEN jsonb_array_length(itinerary_document->'content') = 0 THEN 'Empty content array'
        WHEN jsonb_array_length(itinerary_document->'content') = 1
            AND itinerary_document->'content'->0->>'type' = 'paragraph'
            AND (itinerary_document->'content'->0->'content' IS NULL
                OR jsonb_array_length(itinerary_document->'content'->0->'content') = 0)
        THEN 'Single empty paragraph (size 2)'
        ELSE 'Has content'
    END as doc_state,
    jsonb_array_length(itinerary_document->'content') as content_count
FROM trips t
ORDER BY t.created_at DESC
LIMIT 5;"

# Step 5: Check valid proposal statuses
echo -e "\n${YELLOW}Step 5: Checking valid proposal statuses...${NC}"
$DB_CMD -c "SELECT conname, consrc
FROM pg_constraint
WHERE conname = 'proposals_status_check';"

# Step 6: Test a sample proposal application (dry run)
echo -e "\n${YELLOW}Step 6: Finding a proposal ready to apply...${NC}"
$DB_CMD -c "SELECT
    p.id,
    p.trip_id,
    p.status,
    p.approval_count,
    p.required_approvals,
    CASE
        WHEN p.approval_count >= p.required_approvals THEN '✅ Ready to apply'
        ELSE '⏳ Needs ' || (p.required_approvals - p.approval_count) || ' more approvals'
    END as apply_status
FROM proposals p
WHERE p.status IN ('pending', 'approved')
    AND p.applied_at IS NULL
ORDER BY p.created_at DESC
LIMIT 5;"

echo -e "\n${GREEN}✅ Diff proposals diagnostic complete!${NC}"
echo -e "${GREEN}Next steps:${NC}"
echo "1. Restart Edge Functions: npx supabase functions serve --env-file ./supabase/.env.local"
echo "2. Test in the app by clicking 'Accept' on a proposal"
echo "3. Monitor Edge Function logs for any errors"
