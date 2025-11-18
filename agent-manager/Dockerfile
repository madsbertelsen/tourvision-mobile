FROM oven/bun:1

WORKDIR /app

# Copy shared dependencies first
COPY shared/package.json /app/shared/
COPY shared/*.ts /app/shared/

# Copy agent-manager package.json
COPY agent-manager/package.json .

# Install dependencies
RUN bun install

# Copy agent-manager source code
COPY agent-manager/*.ts .

# Expose metrics port (optional)
EXPOSE 3001

# Start the agent manager
CMD ["bun", "run", "agent-manager"]
