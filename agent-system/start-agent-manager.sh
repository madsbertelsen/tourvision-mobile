#!/bin/bash

# Load environment variables from .env.manager
export $(cat .env.manager | grep -v '^#' | xargs)

# Run the agent manager
npx tsx agent-manager.ts
