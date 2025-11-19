FROM node:20-alpine

WORKDIR /app

# Copy y-partyserver with its package.json first (for file: dependency)
COPY y-partyserver/package*.json /y-partyserver/
COPY y-partyserver/dist /y-partyserver/dist

# Copy shared package.json and install its dependencies first
COPY shared/package*.json /shared/
RUN cd /shared && npm install --omit=dev

# Copy shared source files one by one (excluding node_modules)
# The package.json was already copied and npm install was run
COPY shared/*.ts /shared/
COPY shared/*.js /shared/
COPY shared/y-partyserver /shared/y-partyserver

# Copy package files
COPY agent-system/package*.json ./

# Install dependencies (this will also install y-partyserver's dependencies)
RUN npm install --omit=dev

# Copy source files
COPY agent-system/ .

# Install tsx globally for running TypeScript
RUN npm install -g tsx

# Create symlink for y-partyserver
RUN ln -s /app/node_modules /y-partyserver/node_modules

# Expose port for health checks (optional)
EXPOSE 3001

# Run the agent manager
CMD ["tsx", "agent-manager.ts"]
